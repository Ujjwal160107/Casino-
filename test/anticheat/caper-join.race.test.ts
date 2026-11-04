import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { planCaper, joinCaper, leaveCaper, cancelCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { questBus } from "../../src/services/questEvents";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { testPrisma, resetFamilies, ensureUniqueIndexes, seedEligibleUser } from "../helpers";
import { caperCrew, txCount, G, CH } from "../crimeFamily/caperFixtures";

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
    await expect(plan(ids.LOOKOUT)).rejects.toThrow("Only a Capo or above can plan a caper.");
    await expect(plan(ids.MASTERMIND, 2)).rejects.toThrow("Payroll Van unlocks at family level 3.");
    await expect(plan(ids.MASTERMIND, 5)).rejects.toThrow("Pick a tier from 1 to 4.");
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(Date.now() + 3_600_000) } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow(/^Family caper cooldown: ready <t:\d+:R>\.$/);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date() } });
    for (let k = 0; k < 4; k++) await testPrisma.caper.create({ data: { familyId: family.id, tier: 1, status: "RESOLVED", liveSlot: `old${k}`, plannerId: ids.MASTERMIND, guildId: G, channelId: CH, lobbyClosesAt: new Date(), startedAt: new Date(Date.now() - 3_600_000) } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow(/^Your family has run 4 capers in the last 24 hours\. Next slot <t:\d+:R>\.$/);
    await testPrisma.caper.updateMany({ where: { liveSlot: "old0" }, data: { status: "CANCELLED", outcome: "VOID" } });   // VOID never counts
    for (const id of [ids.LOOKOUT, ids.SAFECRACKER, ids.DRIVER]) await testPrisma.user.update({ where: { discordId: id }, data: { crimeHeat: 100 } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow("Your family is under investigation: no capers until fewer than 3 members are at 100 heat.");
    expect(await wallet(ids.MASTERMIND)).toBe(before);
  });

  it("plan racing disband: exactly one commits", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    const [p, d] = await Promise.allSettled([plan(ids.MASTERMIND), disbandFamily(ids.MASTERMIND, family.tag)]);
    expect([p.status, d.status].filter((s) => s === "fulfilled")).toHaveLength(1);
    if (d.status === "fulfilled") { expect(await testPrisma.caper.count()).toBe(0); expect(await wallet(ids.MASTERMIND)).toBe(before); }
    else expect((d as PromiseRejectedResult).reason.message).toMatch(BUSY_OR("A caper is in its lobby."));
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
    await expect(join(c.id, ids.LOOKOUT, "HACKER")).rejects.toThrow("That role is not part of this caper.");
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", undefined, "g2")).rejects.toThrow("This caper is in another server; join that server to play.");
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
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Already in this caper."));
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
    await expect(plan(bossId)).rejects.toThrow("Your family already has a live caper.");
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
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", now)).rejects.toThrow(/^You've used both caper seats in the last 24 hours\. A seat frees <t:1793836920:R>\.$/);
    await testPrisma.caperCrew.updateMany({ where: { userId: ids.LOOKOUT, liveSlot: "65f000000000000000000001" }, data: { startedAt: new Date("2026-11-04T00:00:00Z") } });
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", now)).resolves.toBeTruthy();
  });

  it("refunds are unearned: leave refunds once, emits no economy:earn, and frees the role", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    const emit = vi.spyOn(questBus, "emit");
    await leaveCaper(c.id, ids.LOOKOUT);
    await expect(leaveCaper(c.id, ids.LOOKOUT)).rejects.toThrow("You are not in this caper.");
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
    await expect(cancelCaper(c.id, ids.LOOKOUT)).rejects.toThrow("Only the planner or the Boss can cancel this caper.");
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
