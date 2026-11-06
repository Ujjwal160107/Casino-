import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { planCaper, joinCaper, leaveCaper, cancelCaper, startCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { questBus } from "../../src/services/questEvents";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { computeNetWorth } from "../../src/services/netWorthService";
import { caperRole, caperTier } from "../../src/data/crimeFamilyCatalog";
import { leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { testPrisma, resetFamilies, ensureUniqueIndexes, seedEligibleUser, seedFamily, daysAgo } from "../helpers";
import { caperCrew, seedLobby, txCount, G, CH } from "../crimeFamily/caperFixtures";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const crew = (caperId: string) => testPrisma.caperCrew.findMany({ where: { caperId } });
const plan = (uid: string, tier = 1, now?: Date) => planCaper({ uid, tier, guildId: G, channelId: CH, now });
const join = (caperId: string, uid: string, role: any, now?: Date, guildId = G) => joinCaper({ caperId, uid, role, guildId, now });
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);
const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("plan (8.4 step 1)", () => {
  it("opens a 600 s lobby, seats the planner as Mastermind and takes the stake", async () => {
    const now = new Date();
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    const c = await plan(ids.MASTERMIND, 1, now);
    expect(c).toMatchObject({ familyId: family.id, tier: 1, status: "LOBBY", liveSlot: "LIVE", plannerId: ids.MASTERMIND, guildId: G, channelId: CH, messageId: "", seatsVersion: 0 });
    expect(+c.lobbyClosesAt).toBe(+now + 600_000);
    expect(await crew(c.id)).toMatchObject([{ userId: ids.MASTERMIND, role: "MASTERMIND", stake: 50_000, started: false, liveSlot: "LIVE" }]);
    expect(await wallet(ids.MASTERMIND)).toBe(before - 50_000);
  });

  it("refuses with the reason and takes nothing", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    await expect(plan(ids.LOOKOUT)).rejects.toThrow("Only a Capo or above can plan a crew heist.");
    await expect(plan(ids.MASTERMIND, 2)).rejects.toThrow("Payroll Van unlocks at family level 3.");
    await expect(plan(ids.MASTERMIND, 5)).rejects.toThrow("Pick a tier from 1 to 4.");
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(Date.now() + 3_600_000) } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow(/^Family crew heist cooldown: ready <t:\d+:R>\.$/);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date() } });
    for (let k = 0; k < 4; k++) await testPrisma.caper.create({ data: { familyId: family.id, tier: 1, status: "RESOLVED", liveSlot: `old${k}`, plannerId: ids.MASTERMIND, guildId: G, channelId: CH, lobbyClosesAt: new Date(), startedAt: new Date(Date.now() - 3_600_000) } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow(/^Your family has run 4 crew heists in the last 24 hours \(cap 4 for 4 members\)\. Next slot <t:\d+:R>\.$/);
    await testPrisma.caper.updateMany({ where: { liveSlot: "old0" }, data: { status: "CANCELLED", outcome: "VOID" } });   // VOID never counts
    for (const id of [ids.LOOKOUT, ids.SAFECRACKER, ids.DRIVER]) await testPrisma.user.update({ where: { discordId: id }, data: { crimeHeat: 100 } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow("Your family is under investigation: no crew heists until fewer than 3 members are at 100 heat.");
    expect(await wallet(ids.MASTERMIND)).toBe(before);
  });

  it("plan racing disband: exactly one commits", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    const [p, d] = await Promise.allSettled([plan(ids.MASTERMIND), disbandFamily(ids.MASTERMIND, family.tag)]);
    expect([p.status, d.status].filter((s) => s === "fulfilled")).toHaveLength(1);
    if (d.status === "fulfilled") { expect(await testPrisma.caper.count()).toBe(0); expect(await wallet(ids.MASTERMIND)).toBe(before); }
    else expect((d as PromiseRejectedResult).reason.message).toMatch(BUSY_OR("A crew heist is in its lobby."));
  });
});

describe("join (8.4 steps 2-3)", () => {
  it("takes a seat and its stake; full is true once every seat up to the tier maximum is filled", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    expect((await join(c.id, ids.LOOKOUT, "LOOKOUT")).full).toBe(false);
    await join(c.id, ids.SAFECRACKER, "SAFECRACKER");
    const r = await join(c.id, ids.DRIVER, "DRIVER");
    expect(r.full).toBe(true);
    expect(r.caper.seatsVersion).toBe(3);
  });

  it("refuses the Mastermind seat, a role outside the tier, another guild and a missing prep item, with no debit", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    const before = await wallet(ids.LOOKOUT);
    await expect(join(c.id, ids.LOOKOUT, "MASTERMIND")).rejects.toThrow("The Mastermind seat belongs to the planner.");
    await expect(join(c.id, ids.LOOKOUT, "HACKER")).rejects.toThrow("That role is not part of this crew heist.");
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", undefined, "g2")).rejects.toThrow("This crew heist is in another server; join that server to play.");
    await expect(join(c.id, ids.LOOKOUT, "DRIVER")).rejects.toThrow("Driver needs one of: Iron Spurs, Guard Vest, Arctic Wolf Spirit Charm.");
    expect(await wallet(ids.LOOKOUT)).toBe(before);
    expect(await crew(c.id)).toHaveLength(1);
  });

  it("same user double join, two roles at once: one row, one stake", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const both = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["hunting_permit", "mechanic_toolkit"] });
    const c = await plan(ids.MASTERMIND);
    await testPrisma.familyMember.create({ data: { familyId: c.familyId, userId: both, role: "SOLDIER", roleSlot: both, seat: 9, joinedAt: new Date(Date.now() - 10 * 864e5) } });
    const rs = await Promise.allSettled([join(c.id, both, "LOOKOUT"), join(c.id, both, "SAFECRACKER")]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Already in this crew heist."));
    expect(await wallet(both)).toBe(2_950_000);
  });

  it("same role race between two members: one seat; the loser keeps their money", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    const twin = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["hunting_permit"] });
    await testPrisma.familyMember.create({ data: { familyId: c.familyId, userId: twin, role: "SOLDIER", roleSlot: twin, seat: 9, joinedAt: new Date(Date.now() - 10 * 864e5) } });
    const lookoutBefore = await wallet(ids.LOOKOUT);
    const rs = await Promise.allSettled([join(c.id, ids.LOOKOUT, "LOOKOUT"), join(c.id, twin, "LOOKOUT")]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Role just taken."));
    expect((await crew(c.id)).filter((r) => r.role === "LOOKOUT")).toHaveLength(1);
    expect(lookoutBefore - (await wallet(ids.LOOKOUT)) + (3_000_000 - (await wallet(twin)))).toBe(50_000);
  });

  it("one live caper per family: a second plan is refused", async () => {
    const { ids, bossId } = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    await plan(ids.MASTERMIND);
    const briefcase = await testPrisma.shopItem.findFirst({ where: { catalogKey: "business_briefcase" } });
    await testPrisma.inventory.create({ data: { userId: bossId, shopItemId: briefcase!.id, amount: 1 } });   // the fixture's unseated Boss owns no prep item
    await expect(plan(bossId)).rejects.toThrow("Your family already has a live crew heist.");
    expect(await testPrisma.caper.count()).toBe(1);
  });

  it("dues arrears do not block planning (spec 7.4, D30)", async () => {
    const { ids, family } = await caperCrew({ tier: 1, roles: [...T1] });
    await testPrisma.family.update({ where: { id: family.id }, data: { duesArrears: 3 } });
    const c = await plan(ids.MASTERMIND);
    expect(c.status).toBe("LOBBY");
  });

  it("join after lobbyClosesAt is refused by the CAS with no debit", async () => {
    const now = new Date();
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND, 1, now);
    const before = await wallet(ids.LOOKOUT);
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", new Date(+now + 600_001))).rejects.toThrow("Lobby closed.");
    expect(await wallet(ids.LOOKOUT)).toBe(before);
  });

  it("join vs cancel (interleave): the joiner has no orphan row, keeps their stake and can join the next lobby", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    const before = await wallet(ids.LOOKOUT);
    // joinCaper's pre-check is getCaper → prisma.caper.findUnique({ where: { id } }) on the global client.
    const delegate = prisma.caper as any; const original = delegate.findUnique; let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.id === c.id) { first = false; await cancelCaper(c.id, ids.MASTERMIND); }
      return snapshot;                                    // stale: still LOBBY
    };
    try { await expect(join(c.id, ids.LOOKOUT, "LOOKOUT")).rejects.toThrow("Lobby closed."); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect(await testPrisma.caperCrew.count({ where: { userId: ids.LOOKOUT } })).toBe(0);
    expect(await wallet(ids.LOOKOUT)).toBe(before);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date() } });
    const next = await plan(ids.MASTERMIND);
    await expect(join(next.id, ids.LOOKOUT, "LOOKOUT")).resolves.toMatchObject({ full: false });
  });

  it("enforces the rolling 2-seat cap across UTC midnight (23 h 59 m in, 24 h 1 m out)", async () => {
    const now = new Date("2026-11-05T00:01:00Z");
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const seat = (startedAt: Date, k: number) => testPrisma.caperCrew.create({ data: { caperId: `65f00000000000000000000${k}`, familyId: family.id, userId: ids.LOOKOUT, role: "LOOKOUT", liveSlot: `65f00000000000000000000${k}`, stake: 50_000, started: true, startedAt } });
    await seat(new Date("2026-11-04T00:02:00Z"), 1); await seat(new Date("2026-11-04T23:00:00Z"), 2);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(+now - 1) } });
    const c = await plan(ids.MASTERMIND, 1, now);
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", now)).rejects.toThrow(/^You've used both crew heist seats in the last 24 hours\. A seat frees <t:1793836920:R>\.$/);
    await testPrisma.caperCrew.updateMany({ where: { userId: ids.LOOKOUT, liveSlot: "65f000000000000000000001" }, data: { startedAt: new Date("2026-11-04T00:00:00Z") } });
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", now)).resolves.toBeTruthy();
  });

  it("refunds are unearned: leave refunds once, emits no economy:earn, and frees the role", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    const emit = vi.spyOn(questBus, "emit");
    await leaveCaper(c.id, ids.LOOKOUT);
    await expect(leaveCaper(c.id, ids.LOOKOUT)).rejects.toThrow("You are not in this crew heist.");
    expect(emit).not.toHaveBeenCalledWith("economy:earn", expect.anything());
    emit.mockRestore();
    const w = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
    expect(await testPrisma.transaction.findMany({ where: { walletId: w!.id, type: "caper_stake_refund" } })).toMatchObject([{ amount: 50_000, isEarned: false }]);
    await expect(join(c.id, ids.SAFECRACKER, "SAFECRACKER")).resolves.toBeTruthy();
  });

  it("the Mastermind leaving cancels and refunds everyone once; cancel is planner-or-Boss only", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    await expect(cancelCaper(c.id, ids.LOOKOUT)).rejects.toThrow("Only the planner or the Boss can cancel this crew heist.");
    expect(await leaveCaper(c.id, ids.MASTERMIND)).toEqual({ cancelled: true });
    expect(await testPrisma.caper.findUnique({ where: { id: c.id } })).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED", liveSlot: c.id });
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(2);
  });

  it("after a chair handover the current Boss, not only the planner, can cancel a Capo's caper (edge 2)", async () => {
    const { ids, bossId } = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    expect(await cancelCaper(c.id, bossId)).toHaveLength(2);
    expect((await testPrisma.caper.findUnique({ where: { id: c.id } }))!.status).toBe("CANCELLED");
    expect(await txCount("caper_stake_refund", [ids.MASTERMIND, ids.LOOKOUT])).toBe(2);
    await expect(cancelCaper(c.id, bossId)).rejects.toThrow("Lobby closed.");
    expect(await txCount("caper_stake_refund", [ids.MASTERMIND, ids.LOOKOUT])).toBe(2);
  });
});

// Sets uid's wallet so that net worth + the paid stake lands exactly on `target`, whatever else (prep items at their
// ShopItem price, bank) the seed left in the net worth (src/services/netWorthService.ts:94-99 counts inventory).
async function walletForStartNetWorth(uid: string, target: number) {
  const nw = await computeNetWorth(uid);
  const stake = caperTier(1).stake;
  await testPrisma.wallet.update({ where: { userId: uid }, data: { balance: target - stake - (nw.total - nw.wallet) } });
}

async function fullLobby(roles: readonly string[] = T1, now = new Date()) {
  const f = await caperCrew({ tier: 1, roles: [...roles] as any });
  const c = await plan(f.ids.MASTERMIND, 1, now);
  for (const r of roles) if (r !== "MASTERMIND") await join(c.id, f.ids[r as keyof typeof f.ids], r, now);
  return { ...f, caper: c };
}

describe("start (8.4 step 5)", () => {
  it("starts with every seat filled: stakes locked, the draw stored, heat snapshot, edge and the family cooldown", async () => {
    const now = new Date();
    const { family, ids, caper } = await fullLobby(T1, now);
    await testPrisma.user.update({ where: { discordId: ids.LOOKOUT }, data: { crimeHeat: 30 } });
    expect(await startCaper(caper.id, { kind: "auto" }, now)).toEqual({ status: "started", pinched: [], reason: null });
    const c = (await testPrisma.caper.findUnique({ where: { id: caper.id } }))!;
    expect(c).toMatchObject({ status: "RUNNING", startedAt: now, goEndsAt: new Date(+now + 120_000), heatSnapshot: 30, roll: -1, outcome: "" });
    expect(c.edge).toBeCloseTo((0.10 + 0.09 + 0.08 + 0.10) / 4, 10);    // first prep key of each role
    expect((c.answers as any).order).toEqual(["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"]);
    expect((await crew(caper.id)).every((r) => r.started && +r.startedAt === +now && r.liveSlot === "LIVE")).toBe(true);
    expect(+(await testPrisma.family.findUnique({ where: { id: family.id } }))!.nextCaperAt).toBe(+now + 10_800_000);
  });

  it("only the planner or the current Boss may press Start; required roles first", async () => {
    const { ids, caper } = await fullLobby(["MASTERMIND", "LOOKOUT"]);
    await expect(startCaper(caper.id, { kind: "press", uid: ids.LOOKOUT })).rejects.toThrow("Only the planner or the Boss can start this crew heist.");
    expect(await startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })).toEqual({ status: "waiting", pinched: [], reason: "Fill the required roles first: Safecracker." });
  });

  it("pinches a member jailed during the lobby, refunds them and starts with the rest", async () => {
    const { ids, caper } = await fullLobby();
    await testPrisma.user.update({ where: { discordId: ids.DRIVER }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    const before = await wallet(ids.DRIVER);
    expect(await startCaper(caper.id, { kind: "auto" })).toMatchObject({ status: "started", pinched: [{ userId: ids.DRIVER, role: "DRIVER" }] });
    expect(await wallet(ids.DRIVER)).toBe(before + 50_000);
    expect((await crew(caper.id)).map((r) => r.role).sort()).toEqual(["LOOKOUT", "MASTERMIND", "SAFECRACKER"]);
  });

  it("a member who used up their only prep item is pinched; a broken required role keeps the lobby open", async () => {
    const { ids, caper } = await fullLobby();
    await testPrisma.inventory.deleteMany({ where: { userId: ids.LOOKOUT } });
    expect(await startCaper(caper.id, { kind: "auto" })).toMatchObject({ status: "pinched", pinched: [{ userId: ids.LOOKOUT, role: "LOOKOUT" }] });
    expect((await testPrisma.caper.findUnique({ where: { id: caper.id } }))!.status).toBe("LOBBY");
  });

  it("net worth at Start counts the stake already paid (C2, Review Focus 1)", async () => {
    const gate = caperTier(1).seatGate.netWorth;                                   // 2,000,000
    const { ids, caper } = await fullLobby(["MASTERMIND", "LOOKOUT", "SAFECRACKER"]);
    await walletForStartNetWorth(ids.SAFECRACKER, gate);                           // net worth + stake = gate exactly
    expect(await startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })).toMatchObject({ status: "started", pinched: [] });
    await resetFamilies();
    const again = await fullLobby(["MASTERMIND", "LOOKOUT", "SAFECRACKER"]);
    await walletForStartNetWorth(again.ids.SAFECRACKER, gate - 1);                 // one Fortune short
    expect(await startCaper(again.caper.id, { kind: "auto" })).toMatchObject({ status: "pinched", pinched: [{ userId: again.ids.SAFECRACKER, role: "SAFECRACKER" }] });
  });

  it("a pinched planner cancels the caper: every stake refunded once and the 30-minute cooldown (spec 8.4 step 4, edge 3)", async () => {
    const now = new Date();
    const { family, ids, caper } = await fullLobby(T1, now);
    await testPrisma.user.update({ where: { discordId: ids.MASTERMIND }, data: { isJailed: true, jailReleaseTime: new Date(+now + 3_600_000) } });
    const before = await Promise.all(Object.values(ids).map(wallet));
    expect(await startCaper(caper.id, { kind: "auto" }, now)).toEqual({
      status: "cancelled", pinched: [{ userId: ids.MASTERMIND, role: "MASTERMIND" }],
      reason: `<@${ids.MASTERMIND}> got pinched; the crew heist was cancelled and every stake refunded.`,
    });
    expect(await testPrisma.caper.findUnique({ where: { id: caper.id } })).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED", liveSlot: caper.id });
    expect(await Promise.all(Object.values(ids).map(wallet))).toEqual(before.map((b) => b + 50_000));
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(4);
    expect(+(await testPrisma.family.findUnique({ where: { id: family.id } }))!.nextCaperAt).toBe(+now + 1_800_000);
  });

  it("after a chair handover the current Boss can Start a Capo's caper (edge 2)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    const c = await plan(f.ids.MASTERMIND);
    await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
    expect(await startCaper(c.id, { kind: "press", uid: f.bossId })).toMatchObject({ status: "started" });
  });

  it("a press re-checks the Boss inside the transaction: a handover before the retry refuses the old Boss (edge 2)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    const c = await plan(f.ids.MASTERMIND);
    await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
    const original = prisma.$transaction.bind(prisma);
    let first = true;
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (...args: unknown[]) => {
      if (!first) return (original as (...a: unknown[]) => Promise<unknown>)(...args);
      first = false;
      await testPrisma.family.update({ where: { id: f.family.id }, data: { bossId: f.ids.LOOKOUT } });   // the chair moves
      throw new Error("Write conflict");                                                                // and the first attempt retries
    }) as never);
    try {
      await expect(startCaper(c.id, { kind: "press", uid: f.bossId })).rejects.toThrow("Only the planner or the Boss can start this crew heist.");
    } finally { spy.mockRestore(); }
    expect((await testPrisma.caper.findUnique({ where: { id: c.id } }))!.status).toBe("LOBBY");
  });

  it("a pinch then the family cooldown: the note names the pinched member (edge 71)", async () => {
    const { family, ids, caper } = await fullLobby();
    await testPrisma.user.update({ where: { discordId: ids.DRIVER }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(Date.now() + 600_000) } });
    const r = await startCaper(caper.id, { kind: "auto" });
    expect(r).toMatchObject({ status: "waiting", pinched: [{ userId: ids.DRIVER, role: "DRIVER" }] });
    expect(r.reason).toMatch(new RegExp(`^<@${ids.DRIVER}> got pinched \\(stake refunded\\)\\. Family crew heist cooldown: ready <t:\\d+:R>\\.$`));
  });

  it("waits while the family cooldown is running (edge 71)", async () => {
    const { family, caper } = await fullLobby();
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(Date.now() + 600_000) } });
    expect(await startCaper(caper.id, { kind: "auto" })).toMatchObject({ status: "waiting", reason: expect.stringMatching(/^Family crew heist cooldown: ready <t:\d+:R>\.$/) });
    expect((await testPrisma.caper.findUnique({ where: { id: caper.id } }))!.status).toBe("LOBBY");
  });

  it("Start pressed twice and racing the auto-start: exactly one run (Review Focus 5)", async () => {
    const { ids, caper } = await fullLobby();
    const rs = await Promise.all([startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND }), startCaper(caper.id, { kind: "auto" }), startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })].map((p) => p.catch((e) => ({ status: e.message }))));
    expect(rs.filter((r) => r.status === "started")).toHaveLength(1);
    for (const r of rs) expect(r.status).toMatch(/^(started|closed|Vault busy, try again\.)$/);
  });

  it("join vs auto-start (interleave): the joiner has no orphan row and keeps their stake", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(f.ids.MASTERMIND);
    await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
    const before = await wallet(f.ids.DRIVER);
    const delegate = prisma.caper as any; const original = delegate.findUnique; let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.id === c.id) { first = false; await startCaper(c.id, { kind: "press", uid: f.ids.MASTERMIND }); }
      return snapshot;
    };
    try { await expect(join(c.id, f.ids.DRIVER, "DRIVER")).rejects.toThrow("Lobby closed."); } finally { delegate.findUnique = original; }
    expect(await testPrisma.caperCrew.count({ where: { userId: f.ids.DRIVER } })).toBe(0);
    expect(await wallet(f.ids.DRIVER)).toBe(before);
  });

  it("join racing start for real: a committed join is always part of the started crew or refunded, never orphaned", async () => {
    for (let k = 0; k < 5; k++) {
      await resetFamilies();
      const f = await caperCrew({ tier: 1, roles: [...T1] });
      const c = await plan(f.ids.MASTERMIND);
      await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
      const [j] = await Promise.allSettled([join(c.id, f.ids.DRIVER, "DRIVER"), startCaper(c.id, { kind: "press", uid: f.ids.MASTERMIND })]);
      const row = await testPrisma.caperCrew.findFirst({ where: { caperId: c.id, userId: f.ids.DRIVER } });
      if (j.status === "fulfilled") expect(row?.started).toBe(true);
      else expect(row).toBeNull();
    }
  });
});

/** A level-10 family of n (the Boss can plan tier 1), off its cooldown. */
async function sized(n: number) {
  const boss = await seedEligibleUser({ wallet: 5_000_000, prepKeys: [caperRole("MASTERMIND").prepKeys[0]] });
  const ids: string[] = [];
  for (let k = 0; k < n - 1; k++) ids.push(await seedEligibleUser());
  const f = await seedFamily({ bossId: boss, level: 10, homeGuildId: G, homeChannelId: CH, members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
  await testPrisma.family.update({ where: { id: f.id }, data: { nextCaperAt: daysAgo(1) } });
  return { f, boss, ids };
}
/** k started (RESOLVED) runs, the j-th started (k - j) hours ago, so index 0 is the oldest. */
async function startedRuns(familyId: string, plannerId: string, k: number) {
  for (let j = 0; j < k; j++) {
    const at = new Date(Date.now() - (k - j) * 3_600_000);
    await testPrisma.caper.create({ data: { familyId, tier: 1, status: "RESOLVED", liveSlot: `old${j}`, plannerId, guildId: G, channelId: CH, lobbyClosesAt: at, startedAt: at } });
  }
}
/** k extra Soldiers in seats after the current ones; memberCount follows. */
async function grow(familyId: string, k: number): Promise<string[]> {
  const seats = await testPrisma.familyMember.count({ where: { familyId } });
  const ids: string[] = [];
  for (let j = 0; j < k; j++) {
    const userId = await seedEligibleUser();
    await testPrisma.familyMember.create({ data: { familyId, userId, role: "SOLDIER", roleSlot: userId, seat: seats + j + 1, joinedAt: daysAgo(10) } });
    ids.push(userId);
  }
  await testPrisma.family.update({ where: { id: familyId }, data: { memberCount: { increment: k } } });
  return ids;
}

describe("heist cap by size (amendment 2.2)", () => {
  it.each([[12, 4], [13, 5], [25, 9], [30, 10]])("%i members: the cap is %i", async (n, cap) => {
    const { f, boss } = await sized(n);
    await startedRuns(f.id, boss, cap - 1);
    const c = await plan(boss);
    await testPrisma.caper.update({ where: { id: c.id }, data: { status: "RESOLVED", liveSlot: c.id, startedAt: new Date() } });
    await expect(plan(boss)).rejects.toThrow(new RegExp(`^Your family has run ${cap} crew heists in the last 24 hours \\(cap ${cap} for ${n} members\\)\\. Next slot <t:\\d+:R>\\.$`));
  });

  it("Start re-checks the cap after members leave: 25 → 21 members, 8 runs, cap 7, the second-oldest run frees the slot", async () => {
    const { caper, family, ids } = await seedLobby({ roles: [...T1] });
    const extra = await grow(family.id, 21);                                    // 4 + 21 = 25 members, cap 9
    await startedRuns(family.id, ids.MASTERMIND, 8);
    for (const id of extra.slice(0, 4)) await leaveFamily(id);                   // 21 members, cap 7
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } })).memberCount).toBe(21);
    const r = await startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND });
    expect(r.status).toBe("waiting");
    expect(r.reason).toContain("Your family has run 8 crew heists in the last 24 hours (cap 7 for 21 members).");
    const second = await testPrisma.caper.findFirstOrThrow({ where: { familyId: family.id, liveSlot: "old1" } });
    expect(r.reason).toContain(`<t:${Math.floor((+second.startedAt! + 86_400_000) / 1000)}:R>`);
  });

  it("8 of 30 members at 100 heat freezes planning; 7 does not", async () => {
    const { boss, ids } = await sized(30);
    const heat = (who: string[]) => testPrisma.user.updateMany({ where: { discordId: { in: who } }, data: { crimeHeat: 100 } });
    await heat(ids.slice(0, 7));
    await expect(plan(boss)).resolves.toMatchObject({ status: "LOBBY" });
    await testPrisma.caper.deleteMany({});
    await heat(ids.slice(0, 8));
    await expect(plan(boss)).rejects.toThrow("Your family is under investigation: no crew heists until fewer than 8 members are at 100 heat.");
  });
});
