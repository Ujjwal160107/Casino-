// Beta QA: Crew Heists (internal "caper", customIds cpr:*) end to end, as a hostile
// QA team and a crowd of simulated players. Every press goes through the real
// router with customIds exactly as the cards emit them; money, ledger and state
// invariants are checked after each scenario. Confirmed bugs are `it.fails`.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import prisma from "../../../src/utils/prisma";
import { caperTier, caperRole, type CaperRoleKey } from "../../../src/data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../../src/utils/economyConfig";
import { planCaper, joinCaper, startCaper, leaveCaper, cancelCaper } from "../../../src/services/crimeFamily/caperLobbyService";
import { openBrief, lockChoice, shareIntel } from "../../../src/services/crimeFamily/caperPlayService";
import { resolveCaper } from "../../../src/services/crimeFamily/caperSettleService";
import { buildCaperCardView } from "../../../src/services/crimeFamily/caperQueries";
import { sweepCapers } from "../../../src/services/crimeFamily/caperSweeper";
import { announceLobby, resolveAndAnnounce, runStart } from "../../../src/ui/crimeFamily/caperFlow";
import { buildCaperCard, buildBrief, buildPersonalCaperCard } from "../../../src/ui/crimeFamily/caperScreens";
import { CPR_IDS } from "../../../src/ui/crimeFamily/ids";
import { handleCaper } from "../../../src/commands/economy/caper";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, seedEligibleUser, daysAgo, withCfConfig } from "../../helpers";
import { caperCrew, seedRunning, seedLobby, fakeCaperClient, scriptedRng, G, CH } from "../caperFixtures";
import {
  open, ui, said, money, liquid, ledgerSum, caperRow, crewOf, answersOf, assertSettledPerSpec, assertInvariants,
  assertRenderable, expectedSettlement, ROLES_FOR, type Money,
} from "./heist.helpers";

type Tier = 1 | 2 | 3 | 4;
type Pick = "right" | "wrong" | "none";

beforeAll(async () => {
  await ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew", "Wallet", "User", "Bank"]);
  // A fresh test DB lacks these collections; Mongo aborts concurrent transactions that would
  // each create one implicitly (P2028), which production (collections exist) never sees.
  for (const name of ["Transaction", "FamilyLedger", "Audit", "Bank", "Wallet", "Inventory", "CaperCrew", "Caper"]) {
    await testPrisma.$runCommandRaw({ create: name }).catch(() => undefined);
  }
});
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const liveCaperOf = (familyId: string) => testPrisma.caper.findFirst({ where: { familyId, liveSlot: "LIVE" } });
const isGoCall = (s: { payload: any }) => Array.isArray(s.payload.allowed_mentions?.users);

async function snapshot(familyId: string, ids: string[]) {
  const before = await money(ids);
  const heatBefore = new Map<string, number>();
  const capersBefore = new Map<string, number>();
  for (const id of ids) {
    heatBefore.set(id, (await testPrisma.user.findUniqueOrThrow({ where: { discordId: id } })).crimeHeat);
    capersBefore.set(id, (await testPrisma.familyMember.findUnique({ where: { userId: id } }))?.capers ?? 0);
  }
  const fam = await testPrisma.family.findUniqueOrThrow({ where: { id: familyId } });
  return { before, heatBefore, capersBefore, family: { id: familyId, earnings: fam.earnings, xp: fam.xp } };
}

/**
 * One whole heist through the router: plan (select), joins (Join as… on the card),
 * Start (press, unless the last join filled it), briefs, optional shares, locks,
 * then the last lock or the sweeper settles. `dark` seats never open the brief;
 * the harness moves goEndsAt so the leak point has passed.
 */
async function simulate(o: { tier: Tier; n: number; picks?: Partial<Record<CaperRoleKey, Pick>>; dark?: CaperRoleKey[]; share?: CaperRoleKey[] }) {
  const roles = ROLES_FOR(o.tier, o.n);
  const f = await caperCrew({ tier: o.tier, roles });
  const ids = Object.values(f.ids);
  const snap = await snapshot(f.family.id, ids);
  const fc = fakeCaperClient();
  await ui.plan(fc.client, f.ids.MASTERMIND, String(o.tier));
  const planned = (await liveCaperOf(f.family.id))!;
  expect(planned.status).toBe("LOBBY");
  for (const role of roles.filter((r) => r !== "MASTERMIND")) {
    const j = await ui.join(fc.client, planned.id, f.ids[role], role, { messageId: planned.messageId });
    expect(said(j)).not.toContain("Not eligible");
  }
  if (o.n < caperTier(o.tier).crewMax) await ui.start(fc.client, planned.id, f.ids.MASTERMIND);
  const run = await caperRow(planned.id);
  expect(run.status).toBe("RUNNING");
  expect(fc.sent.filter(isGoCall)).toHaveLength(1);
  const answers = await answersOf(planned.id);
  const dark = new Set(o.dark ?? []);

  for (const role of roles.filter((r) => !dark.has(r))) {
    const b = await ui.brief(fc.client, planned.id, f.ids[role]);
    const i = answers.order.indexOf(role);
    const prev = answers.order[(i - 1 + answers.order.length) % answers.order.length];
    const prevLabel = answers.seats[prev]!.options[answers.seats[prev]!.correct];
    expect(said(b)).toContain(`Your intel for <@${f.ids[prev]}>: **${prevLabel}**`);
  }
  for (const role of o.share ?? []) await ui.share(fc.client, planned.id, f.ids[role]);
  if (dark.size > 0) {
    // Time travel: briefs opened a minute ago, GO ends in 25 s, so leakAt passed 5 s ago.
    await testPrisma.caperCrew.updateMany({ where: { caperId: planned.id, briefOpened: true }, data: { briefOpenedAt: new Date(Date.now() - 60_000) } });
    await testPrisma.caper.update({ where: { id: planned.id }, data: { goEndsAt: new Date(Date.now() + 25_000) } });
  }
  for (const role of roles) {
    const pick = o.picks?.[role] ?? "right";
    if (pick === "none") continue;
    const correct = answers.seats[role]!.correct;
    const a = await ui.act(fc.client, planned.id, f.ids[role], pick === "right" ? correct : (correct + 1) % 4);
    if (dark.has(role)) expect(said(a)).toContain("You went dark");
  }
  let caper = await caperRow(planned.id);
  if (caper.status === "RUNNING") {
    await sweepCapers(fc.client, new Date(caper.goEndsAt.getTime() + 1_000));
    caper = await caperRow(planned.id);
  }
  const exp = await assertSettledPerSpec({ caperId: planned.id, ...snap });
  await assertInvariants();
  for (const s of fc.sent) assertRenderable("sent", s.payload);
  for (const e of fc.edits) assertRenderable("edit", e.payload);
  for (const id of ids) if (fc.lastDm.get(id)) assertRenderable(`dm ${id}`, fc.lastDm.get(id));
  return { f, fc, caper, exp, answers };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST sim: full heists for every tier and crew size (router end to end)", () => {
  const sizes: [Tier, number][] = [[1, 3], [1, 4], [2, 4], [2, 5], [3, 5], [3, 6], [4, 5], [4, 6]];
  for (const [tier, n] of sizes) {
    it(`T${tier} n=${n}: a perfect crew settles CLEAN or patrol-MESSY per spec, money and ledger exact`, () => open(async () => {
      const { exp } = await simulate({ tier, n });
      expect(exp.misses).toBe(0);
      expect(["CLEAN", "MESSY"]).toContain(exp.outcome);
    }));
  }

  it("T1 n=3 one wrong lock: MESSY 35% pool, wrong seat still paid (it locked), per spec", () => open(async () => {
    const { exp, f } = await simulate({ tier: 1, n: 3, picks: { LOOKOUT: "wrong" } });
    expect(exp.outcome).toBe("MESSY");
    expect(exp.pool).toBe(367_500);
    expect(exp.perSeat.get(f.ids.LOOKOUT)!.cut).toBe(98_000);
  }));

  it("T1 n=4 two misses (one wrong, one unlocked): BUST, every seat fined 150,000, no jail at T1", () => open(async () => {
    const { exp, f } = await simulate({ tier: 1, n: 4, picks: { LOOKOUT: "wrong", DRIVER: "none" } });
    expect(exp.outcome).toBe("BUST");
    for (const id of Object.values(f.ids)) expect(exp.perSeat.get(id)!.fine).toBe(150_000);
  }));

  it("T2 n=5 two misses is only MESSY (bustAt 3 for n ≥ 5); the unlocked seat gets 0", () => open(async () => {
    const { exp, f } = await simulate({ tier: 2, n: 5, picks: { DRIVER: "wrong", MUSCLE: "none" } });
    expect(exp.outcome).toBe("MESSY");
    expect(exp.perSeat.get(f.ids.MUSCLE)!.cut).toBe(0);
    expect(exp.perSeat.get(f.ids.DRIVER)!.cut).toBe(154_000);
  }));

  it("T3 n=6 three wrong: BUST with jail rolls; fines may push the bank into debt", () => open(async () => {
    const { exp } = await simulate({ tier: 3, n: 6, picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong", HACKER: "wrong" } });
    expect(exp.outcome).toBe("BUST");
  }));

  it("T4 n=6 with a dark seat and shares: the dark seat is a miss with cut 0, its partner locks on the leak", () => open(async () => {
    const { exp, f, caper } = await simulate({ tier: 4, n: 6, dark: ["DRIVER"], share: ["MASTERMIND", "LOOKOUT"] });
    expect(exp.misses).toBe(1);
    expect(exp.outcome).toBe("MESSY");
    expect(exp.perSeat.get(f.ids.DRIVER)!.cut).toBe(0);
    const crew = await crewOf(caper.id);
    // The Safecracker's intel holder is the Driver (ring order), who went dark: its lock is marked leaked.
    expect(crew.find((r) => r.role === "SAFECRACKER")!.leaked).toBe(true);
  }));

  it("T2 n=4 mixed: dark Lookout + wrong Driver = BUST (bustAt 2), jail only from the stored rolls", () => open(async () => {
    const { exp } = await simulate({ tier: 2, n: 4, dark: ["LOOKOUT"], picks: { DRIVER: "wrong" } });
    expect(exp.outcome).toBe("BUST");
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST plan: who, which tier, how often (cpr:plan through the router)", () => {
  const R3: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"];

  it("tier unlocks by family level: T2 at L3, T3 at L5, T4 at L8; one level short is refused with no stake", () => open(async () => {
    for (const [tier, level] of [[2, 3], [3, 5], [4, 8]] as const) {
      await resetFamilies();
      const f = await caperCrew({ tier, roles: [...caperTier(tier).required] });
      await testPrisma.family.update({ where: { id: f.family.id }, data: { level: level - 1 } });
      const fc = fakeCaperClient();
      const before = await wallet(f.ids.MASTERMIND);
      const refused = await ui.plan(fc.client, f.ids.MASTERMIND, String(tier));
      expect(said(refused)).toContain(`${caperTier(tier).name} unlocks at family level ${level}.`);
      expect(await wallet(f.ids.MASTERMIND)).toBe(before);
      await testPrisma.family.update({ where: { id: f.family.id }, data: { level } });
      await ui.plan(fc.client, f.ids.MASTERMIND, String(tier));
      expect((await liveCaperOf(f.family.id))?.tier).toBe(tier);
      expect(await wallet(f.ids.MASTERMIND)).toBe(before - caperTier(tier).stake);
    }
  }));

  it("forged tier values are refused before any write: 0, 5, -1, 1.5, NaN, Infinity, '', 1e1", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: R3 });
    const fc = fakeCaperClient();
    for (const t of ["0", "5", "-1", "1.5", "NaN", "Infinity", "", "1e1", "abc"]) {
      const i = await ui.plan(fc.client, f.ids.MASTERMIND, t);
      expect(said(i)).toContain("Pick a tier from 1 to 4.");
    }
    expect(await testPrisma.caper.count()).toBe(0);
  }));

  it("a plan press with a forged owner id (another member's panel) is not theirs", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: R3 });
    const i = await ui.raw(fakeCaperClient().client, CPR_IDS.plan(f.ids.MASTERMIND), f.ids.LOOKOUT, ["1"]);
    expect(said(i)).toContain("This panel is not yours.");
    expect(await testPrisma.caper.count()).toBe(0);
  }));

  it("heist cap = max(4, ceil(members/3)): 13 members allows a 5th run in 24 h but not a 6th; VOID and cancelled runs never count", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: R3 });
    const extra: string[] = [];
    for (let k = 0; k < 10; k++) extra.push(await seedEligibleUser({}));
    for (const [k, uid] of extra.entries()) {
      await testPrisma.familyMember.create({ data: { familyId: f.family.id, userId: uid, role: "SOLDIER", roleSlot: uid, seat: 4 + k, joinedAt: daysAgo(10) } });
    }
    await testPrisma.family.update({ where: { id: f.family.id }, data: { memberCount: 13 } });
    const seedRun = (status: string, outcome: string, hoursAgo: number) => testPrisma.caper.create({ data: {
      familyId: f.family.id, tier: 1, status, outcome, liveSlot: `x${Math.random()}`, plannerId: f.ids.MASTERMIND, guildId: G, channelId: CH,
      lobbyClosesAt: daysAgo(1), startedAt: new Date(Date.now() - hoursAgo * 3_600_000),
    } });
    for (let k = 0; k < 4; k++) await seedRun("RESOLVED", "CLEAN", 20 - k);
    await seedRun("CANCELLED", "VOID", 2);
    await seedRun("CANCELLED", "CANCELLED", 1);
    const fc = fakeCaperClient();
    await ui.plan(fc.client, f.ids.MASTERMIND, "1");
    const fifth = (await liveCaperOf(f.family.id))!;
    expect(fifth).not.toBeNull();
    await cancelCaper(fifth.id, f.ids.MASTERMIND);
    await testPrisma.family.update({ where: { id: f.family.id }, data: { nextCaperAt: daysAgo(1) } });
    await seedRun("RESOLVED", "MESSY", 3);
    const refused = await ui.plan(fc.client, f.ids.MASTERMIND, "1");
    expect(said(refused)).toContain("run 5 crew heists in the last 24 hours (cap 5 for 13 members)");
    // 12 members: cap 4.
    await testPrisma.family.update({ where: { id: f.family.id }, data: { memberCount: 12 } });
    expect(said(await ui.plan(fc.client, f.ids.MASTERMIND, "1"))).toContain("(cap 4 for 12 members)");
  }));

  it("investigation threshold max(3, ceil(members/4)): 16 members freeze at 4 hot, not at 3; dues arrears never block", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: R3 });
    await testPrisma.family.update({ where: { id: f.family.id }, data: { duesArrears: 5 } });
    const hot: string[] = [];
    for (let k = 0; k < 13; k++) {
      const uid = await seedEligibleUser({ heat: k < 4 ? 100 : 0 });
      hot.push(uid);
      await testPrisma.familyMember.create({ data: { familyId: f.family.id, userId: uid, role: "SOLDIER", roleSlot: uid, seat: 4 + k, joinedAt: daysAgo(10) } });
    }
    await testPrisma.family.update({ where: { id: f.family.id }, data: { memberCount: 16 } });
    const fc = fakeCaperClient();
    expect(said(await ui.plan(fc.client, f.ids.MASTERMIND, "1"))).toContain("fewer than 4 members are at 100 heat");
    await testPrisma.user.update({ where: { discordId: hot[0] }, data: { crimeHeat: 99 } });
    await ui.plan(fc.client, f.ids.MASTERMIND, "1");
    expect(await liveCaperOf(f.family.id)).not.toBeNull();
  }));

  it("two officers plan at once (Boss + Capo): one live heist, the loser keeps their stake", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: R3, plannerRank: "CAPO" });
    // Give the Boss a Mastermind item so both may plan.
    const bossItem = await testPrisma.shopItem.findFirstOrThrow({ where: { catalogKey: caperRole("MASTERMIND").prepKeys[0] } });
    await testPrisma.inventory.create({ data: { userId: f.bossId, shopItemId: bossItem.id, amount: 1 } });
    const fc = fakeCaperClient();
    const [wb, wc] = [await wallet(f.bossId), await wallet(f.ids.MASTERMIND)];
    await Promise.all([ui.plan(fc.client, f.bossId, "1"), ui.plan(fc.client, f.ids.MASTERMIND, "1")]);
    expect(await testPrisma.caper.count({ where: { familyId: f.family.id } })).toBe(1);
    const paid = (wb - (await wallet(f.bossId))) + (wc - (await wallet(f.ids.MASTERMIND)));
    expect(paid).toBe(caperTier(1).stake);
    await assertInvariants();
  }));

  it("a planner without a Mastermind prep item is refused with the item names; a Soldier, an Associate Capo and a jailed Capo cannot plan", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: R3 });
    await testPrisma.inventory.deleteMany({ where: { userId: f.ids.MASTERMIND } });
    const fc = fakeCaperClient();
    const noItem = await ui.plan(fc.client, f.ids.MASTERMIND, "1");
    expect(said(noItem)).toContain("Mastermind needs one of:");
    expect(said(await ui.plan(fc.client, f.ids.LOOKOUT, "1"))).toContain("Only a Capo or above can plan a crew heist.");
    await resetFamilies();
    const g = await caperCrew({ tier: 1, roles: R3, plannerRank: "CAPO", joinedDaysAgo: 1 });
    expect(said(await ui.plan(fc.client, g.ids.MASTERMIND, "1"))).toMatch(/Not eligible: .*days in the family/);
    await testPrisma.familyMember.update({ where: { userId: g.ids.MASTERMIND }, data: { joinedAt: daysAgo(10) } });
    await testPrisma.user.update({ where: { discordId: g.ids.MASTERMIND }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    expect(said(await ui.plan(fc.client, g.ids.MASTERMIND, "1"))).toContain("not jailed");
    expect(await testPrisma.caper.count()).toBe(0);
  }));

  it("the kill switch refuses planning and joining but a live heist still plays to the end", async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    const fc = fakeCaperClient();
    expect(said(await ui.plan(fc.client, f.ids.MASTERMIND, "1"))).toContain("not open");
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    expect(said(await ui.join(fc.client, c.id, f.ids.LOOKOUT, "LOOKOUT"))).toContain("not open");
    await joinCaper({ caperId: c.id, uid: f.ids.LOOKOUT, role: "LOOKOUT" });
    await joinCaper({ caperId: c.id, uid: f.ids.SAFECRACKER, role: "SAFECRACKER" });
    await ui.start(fc.client, c.id, f.ids.MASTERMIND);
    expect((await caperRow(c.id)).status).toBe("RUNNING");
    const answers = await answersOf(c.id);
    for (const r of ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const) {
      await ui.brief(fc.client, c.id, f.ids[r]);
      await ui.act(fc.client, c.id, f.ids[r], answers.seats[r]!.correct);
    }
    expect((await caperRow(c.id)).status).toBe("RESOLVED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST lobby: Join as…, seat gates, stakes, leaving", () => {
  const T1: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"];

  async function lobby(tier: Tier = 1, roles: CaperRoleKey[] = T1) {
    const f = await caperCrew({ tier, roles });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier, guildId: G, channelId: CH });
    return { ...f, fc, c };
  }

  it("seat gates on press: heat at the ceiling, jail, ban, tenure, net worth, missing prep item, a used-up seat cap; nothing debited", () => open(async () => {
    const { ids, fc, c, family } = await lobby();
    const L = ids.LOOKOUT;
    const startW = await wallet(L);
    const tryJoin = async () => said(await ui.join(fc.client, c.id, L, "LOOKOUT"));

    await testPrisma.user.update({ where: { discordId: L }, data: { crimeHeat: 70 } });
    expect(await tryJoin()).toContain("heat below 70");
    await testPrisma.user.update({ where: { discordId: L }, data: { crimeHeat: 0, isJailed: true, jailReleaseTime: new Date(Date.now() + 60_000) } });
    expect(await tryJoin()).toContain("not jailed");
    await testPrisma.user.update({ where: { discordId: L }, data: { isJailed: false, jailReleaseTime: null, isBanned: true, banExpiresAt: null } });
    expect(await tryJoin()).toContain("not banned");
    await testPrisma.user.update({ where: { discordId: L }, data: { isBanned: false } });
    await testPrisma.familyMember.update({ where: { userId: L }, data: { joinedAt: new Date(Date.now() - 71 * 3_600_000) } });
    expect(await tryJoin()).toContain("days in the family");
    await testPrisma.familyMember.update({ where: { userId: L }, data: { joinedAt: daysAgo(10) } });
    await testPrisma.wallet.update({ where: { userId: L }, data: { balance: 1_999_000 } });
    expect(await tryJoin()).toContain("≥ 2,000,000 net worth");
    await testPrisma.wallet.update({ where: { userId: L }, data: { balance: startW } });
    await testPrisma.inventory.deleteMany({ where: { userId: L } });
    const noItem = await tryJoin();
    expect(noItem).toContain("Lookout needs one of:");
    expect(noItem).toContain("Hunting Permit");
    const item = await testPrisma.shopItem.findFirstOrThrow({ where: { catalogKey: "hunting_permit" } });
    await testPrisma.inventory.create({ data: { userId: L, shopItemId: item.id, amount: 1 } });
    for (let k = 0; k < 2; k++) {
      await testPrisma.caperCrew.create({ data: { caperId: `65f0000000000000000000a${k}`, familyId: family.id, userId: L, role: "LOOKOUT", stake: 1, started: true, startedAt: new Date(Date.now() - (k + 1) * 3_600_000), liveSlot: `old${k}` } });
    }
    expect(await tryJoin()).toContain("You've used both crew heist seats in the last 24 hours.");
    expect(await wallet(L)).toBe(startW);
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: L } })).toBe(0);
  }));

  it("heat 69 at T1 (one below the ceiling) may join", () => open(async () => {
    const { ids, fc, c } = await lobby();
    await testPrisma.user.update({ where: { discordId: ids.LOOKOUT }, data: { crimeHeat: 69 } });
    await ui.join(fc.client, c.id, ids.LOOKOUT, "LOOKOUT");
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: ids.LOOKOUT } })).toBe(1);
  }));

  it("five concurrent Join presses by one member (same role, then two roles) take one seat and one stake", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const w0 = await wallet(ids.LOOKOUT);
    await Promise.all([1, 2, 3, 4, 5].map(() => ui.join(fc.client, c.id, ids.LOOKOUT, "LOOKOUT")));
    await Promise.all([ui.join(fc.client, c.id, ids.SAFECRACKER, "SAFECRACKER"), ui.join(fc.client, c.id, ids.SAFECRACKER, "DRIVER")]);
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: ids.LOOKOUT } })).toBe(1);
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: ids.SAFECRACKER } })).toBe(1);
    expect(w0 - (await wallet(ids.LOOKOUT))).toBe(50_000);
    expect(await ledgerSum(ids.LOOKOUT, "caper_stake")).toBe(-50_000);
    await assertInvariants();
  }));

  it("forged Join values: Mastermind, lower-case, a role outside the tier, empty, prototype keys; nothing debited", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const w0 = await wallet(ids.LOOKOUT);
    expect(said(await ui.join(fc.client, c.id, ids.LOOKOUT, "MASTERMIND"))).toContain("The Mastermind seat belongs to the planner.");
    for (const v of ["lookout", "HACKER", "MUSCLE", "", "__proto__", "constructor", "LOOKOUT "]) {
      expect(said(await ui.join(fc.client, c.id, ids.LOOKOUT, v))).toContain("That role is not part of this crew heist.");
    }
    // A join pressed as a button (no values) is refused the same way.
    expect(said(await ui.raw(fc.client, CPR_IDS.join(c.id), ids.LOOKOUT))).toContain("That role is not part of this crew heist.");
    expect(await wallet(ids.LOOKOUT)).toBe(w0);
  }));

  it("leave refunds once (double press), rejoin pays again, the ledger nets to zero; the planner leaving cancels and refunds everyone once", () => open(async () => {
    const { ids, fc, c, family } = await lobby();
    const w0 = await wallet(ids.LOOKOUT);
    await ui.join(fc.client, c.id, ids.LOOKOUT, "LOOKOUT");
    const [a, b] = await Promise.all([ui.leave(fc.client, c.id, ids.LOOKOUT), ui.leave(fc.client, c.id, ids.LOOKOUT)]);
    expect(said(a) + said(b)).toContain("You are not in this crew heist.");
    expect(await wallet(ids.LOOKOUT)).toBe(w0);
    await ui.join(fc.client, c.id, ids.LOOKOUT, "LOOKOUT");
    await ui.join(fc.client, c.id, ids.SAFECRACKER, "SAFECRACKER");
    const wm = await wallet(ids.MASTERMIND);
    await Promise.all([ui.leave(fc.client, c.id, ids.MASTERMIND), ui.leave(fc.client, c.id, ids.MASTERMIND), ui.cancel(fc.client, c.id, ids.MASTERMIND)]);
    expect((await caperRow(c.id)).status).toBe("CANCELLED");
    expect(await wallet(ids.MASTERMIND)).toBe(wm + 50_000);
    expect(await wallet(ids.LOOKOUT)).toBe(w0);
    expect(await ledgerSum(ids.LOOKOUT, "caper_stake") + await ledgerSum(ids.LOOKOUT, "caper_stake_refund")).toBe(0);
    expect(await ledgerSum(ids.MASTERMIND, "caper_stake") + await ledgerSum(ids.MASTERMIND, "caper_stake_refund")).toBe(0);
    const fam = await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } });
    expect(fam.nextCaperAt.getTime()).toBeGreaterThan(Date.now() + 1_700_000);
    await assertInvariants();
  }));

  it("a full lobby auto-starts; a later Join on the stale card is refused with no debit", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const outsider = await seedEligibleUser({ wallet: 5_000_000, prepKeys: ["hunting_permit"] });
    await testPrisma.familyMember.create({ data: { familyId: (await caperRow(c.id)).familyId, userId: outsider, role: "SOLDIER", roleSlot: outsider, seat: 9, joinedAt: daysAgo(10) } });
    await testPrisma.family.update({ where: { id: (await caperRow(c.id)).familyId }, data: { memberCount: { increment: 1 } } });
    for (const r of ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const) await ui.join(fc.client, c.id, ids[r], r, { messageId: (await caperRow(c.id)).messageId });
    expect((await caperRow(c.id)).status).toBe("RUNNING");
    const w = await wallet(outsider);
    expect(said(await ui.join(fc.client, c.id, outsider, "LOOKOUT"))).toContain("Lobby closed.");
    expect(await wallet(outsider)).toBe(w);
  }));

  it("joining another family's heist with a forged caper id is refused; a non-member is told they have no family", () => open(async () => {
    const a = await lobby();
    const b = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const loner = await seedEligibleUser({ wallet: 5_000_000, prepKeys: ["hunting_permit"] });
    expect(said(await ui.join(a.fc.client, a.c.id, b.ids.LOOKOUT, "LOOKOUT"))).toContain("This crew heist belongs to another family.");
    expect(said(await ui.join(a.fc.client, a.c.id, loner, "LOOKOUT"))).toContain("not in a crime family");
    expect(await testPrisma.caperCrew.count({ where: { caperId: a.c.id } })).toBe(1);
  }));

  it("a member seated in one lobby cannot also plan or join another family's lobby after a kick-and-join (one live seat)", () => open(async () => {
    const a = await lobby();
    await ui.join(a.fc.client, a.c.id, a.ids.LOOKOUT, "LOOKOUT");
    expect((await planCaper({ uid: a.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH }).catch((e) => e)).message).toContain("already has a live crew heist");
    const seat = await testPrisma.caperCrew.findFirstOrThrow({ where: { userId: a.ids.LOOKOUT, liveSlot: "LIVE" } });
    expect(seat.caperId).toBe(a.c.id);
  }));

  it("join from a DM and from another server: seated, the DM is edited into the S25 seated card", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const dm = await ui.join(fc.client, c.id, ids.LOOKOUT, "LOOKOUT", { guildId: null, messageId: "dm-message" });
    expect(said(dm)).toContain("seated as **Lookout**");
    const far = await ui.join(fc.client, c.id, ids.SAFECRACKER, "SAFECRACKER", { guildId: "g-other", messageId: "s25" });
    expect(said(far)).toContain("seated as **Safecracker**");
    expect((await crewOf(c.id)).map((r) => r.role).sort()).toEqual(["LOOKOUT", "MASTERMIND", "SAFECRACKER"]);
  }));

  it("lobby DMs reach unseated qualifiers with a Join select that works from the DM; the DM renders within limits", () => open(async () => {
    const f = await caperCrew({ tier: 4, roles: ["MASTERMIND"] });
    const joiners: Record<string, string> = {};
    for (const [k, role] of (["LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"] as const).entries()) {
      const uid = await seedEligibleUser({ wallet: 41_000_000, prepKeys: [caperRole(role).prepKeys[0]] });
      joiners[role] = uid;
      await testPrisma.familyMember.create({ data: { familyId: f.family.id, userId: uid, role: "SOLDIER", roleSlot: uid, seat: 3 + k, joinedAt: daysAgo(10) } });
    }
    await testPrisma.family.update({ where: { id: f.family.id }, data: { memberCount: 6 } });
    const fc = fakeCaperClient();
    await ui.plan(fc.client, f.ids.MASTERMIND, "4");
    const c = (await liveCaperOf(f.family.id))!;
    for (let k = 0; k < 50 && Object.values(joiners).some((u) => !fc.dms.get(u)); k++) await new Promise((r) => setTimeout(r, 20));   // openLobby sends them in the background
    for (const uid of Object.values(joiners)) {
      expect(fc.dms.get(uid)).toBe(1);
      const dm = fc.lastDm.get(uid) as any;
      assertRenderable("lobby DM", dm);
      expect(JSON.stringify(dm)).toContain(`cpr:join:${c.id}`);
    }
    for (const [role, uid] of Object.entries(joiners)) await ui.join(fc.client, c.id, uid, role, { guildId: null, messageId: `dm-${uid}` });
    expect((await caperRow(c.id)).status).toBe("RUNNING");
    for (const uid of [f.ids.MASTERMIND, ...Object.values(joiners)]) assertRenderable("GO DM", fc.lastDm.get(uid));
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST start: who, minimum crew, pinches", () => {
  const T1: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"];

  async function seated(roles: CaperRoleKey[] = T1, o: { tier?: Tier; plannerRank?: "BOSS" | "CAPO" } = {}) {
    const tier = o.tier ?? 1;
    const f = await caperCrew({ tier, roles: [...roles], plannerRank: o.plannerRank });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier, guildId: G, channelId: CH });
    for (const r of roles.filter((x) => x !== "MASTERMIND").slice(0, 1)) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r });
    return { ...f, fc, c };
  }

  it("a crew member who is not the planner cannot Start; the Boss (unseated) can; missing required roles wait", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: T1, plannerRank: "CAPO" });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: c.id, uid: f.ids.LOOKOUT, role: "LOOKOUT" });
    expect(said(await ui.start(fc.client, c.id, f.ids.MASTERMIND))).toContain("Fill the required roles first: Safecracker.");
    await joinCaper({ caperId: c.id, uid: f.ids.SAFECRACKER, role: "SAFECRACKER" });
    expect(said(await ui.start(fc.client, c.id, f.ids.LOOKOUT))).toContain("Only the planner or the Boss can start this crew heist.");
    const stranger = await seedEligibleUser({});
    expect(said(await ui.start(fc.client, c.id, stranger))).toContain("Only the planner or the Boss");
    await ui.start(fc.client, c.id, f.bossId);
    expect((await caperRow(c.id)).status).toBe("RUNNING");
    expect((await crewOf(c.id)).length).toBe(3);
  }));

  for (const spoil of ["heat", "item", "jail", "wallet"] as const) {
    it(`an optional seat that went bad in the lobby (${spoil}) is pinched at Start, refunded once, and the run starts without it`, () => open(async () => {
      const roles: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"];
      const f = await caperCrew({ tier: 2, roles });
      const fc = fakeCaperClient();
      const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 2, guildId: G, channelId: CH });
      for (const r of ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r });
      const m = f.ids.MUSCLE;
      await joinCaper({ caperId: c.id, uid: m, role: "MUSCLE" }).catch(() => undefined);
      expect((await caperRow(c.id)).status).toBe("LOBBY"); // T2 max is 5: four seats do not auto-start
      const w0 = await wallet(m);
      if (spoil === "heat") await testPrisma.user.update({ where: { discordId: m }, data: { crimeHeat: 60 } });
      if (spoil === "item") await testPrisma.inventory.updateMany({ where: { userId: m }, data: { amount: 0 } });
      if (spoil === "jail") await testPrisma.user.update({ where: { discordId: m }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 600_000) } });
      if (spoil === "wallet") await testPrisma.wallet.update({ where: { userId: m }, data: { balance: 0 } });
      const before = spoil === "wallet" ? 0 : w0;
      const r = await ui.start(fc.client, c.id, f.ids.MASTERMIND);
      expect(said(r)).toBe("[]"); // a started run sends no refusal
      expect((await caperRow(c.id)).status).toBe("RUNNING");
      expect((await crewOf(c.id)).map((x) => x.userId)).not.toContain(m);
      expect(await wallet(m)).toBe(before + 100_000);
      expect(await ledgerSum(m, "caper_stake") + await ledgerSum(m, "caper_stake_refund")).toBe(0);
      const goCall = fc.sent.find(isGoCall)!;
      expect(JSON.stringify(goCall.payload)).toContain(`Pinched at Start: <@${m}>`);
      expect(goCall.payload.allowed_mentions.users).not.toContain(m);
      await assertInvariants();
    }));
  }

  it("a required seat pinched at Start keeps the lobby open; the sweeper at close cancels it and refunds everyone once", () => open(async () => {
    const f = await seated();
    await joinCaper({ caperId: f.c.id, uid: f.ids.SAFECRACKER, role: "SAFECRACKER" });
    await testPrisma.user.update({ where: { discordId: f.ids.SAFECRACKER }, data: { crimeHeat: 70 } });
    const r = await ui.start(f.fc.client, f.c.id, f.ids.MASTERMIND);
    expect(said(r)).toContain("got pinched (stake refunded)");
    expect((await caperRow(f.c.id)).status).toBe("LOBBY");
    await testPrisma.caper.update({ where: { id: f.c.id }, data: { lobbyClosesAt: new Date(Date.now() - 1_000) } });
    await sweepCapers(f.fc.client, new Date());
    expect((await caperRow(f.c.id)).status).toBe("CANCELLED");
    for (const id of Object.values(f.ids)) {
      expect(await ledgerSum(id, "caper_stake") + await ledgerSum(id, "caper_stake_refund")).toBe(0);
    }
    await assertInvariants();
  }));

  it("the planner pinched at Start cancels the heist: every stake refunded once, 30-minute cooldown", () => open(async () => {
    const f = await seated();
    await joinCaper({ caperId: f.c.id, uid: f.ids.SAFECRACKER, role: "SAFECRACKER" });
    await testPrisma.user.update({ where: { discordId: f.ids.MASTERMIND }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 600_000) } });
    const r = await ui.start(f.fc.client, f.c.id, f.ids.MASTERMIND);
    expect(said(r)).toContain("the crew heist was cancelled and every stake refunded");
    expect((await caperRow(f.c.id)).outcome).toBe("CANCELLED");
    for (const id of Object.values(f.ids)) expect(await ledgerSum(id, "caper_stake") + await ledgerSum(id, "caper_stake_refund")).toBe(0);
    await assertInvariants();
  }));

  it("Start pressed four times at once plus the auto-start: one run, one GO call, one GO DM each, stakes taken once", () => open(async () => {
    const f = await seated();
    await joinCaper({ caperId: f.c.id, uid: f.ids.SAFECRACKER, role: "SAFECRACKER" });
    await Promise.all([
      ui.start(f.fc.client, f.c.id, f.ids.MASTERMIND), ui.start(f.fc.client, f.c.id, f.ids.MASTERMIND),
      ui.start(f.fc.client, f.c.id, f.bossId), ui.start(f.fc.client, f.c.id, f.ids.MASTERMIND),
      runStart(f.fc.client, f.c.id, { kind: "auto" }),
    ]);
    expect((await caperRow(f.c.id)).status).toBe("RUNNING");
    expect(f.fc.sent.filter(isGoCall)).toHaveLength(1);
    for (const r of ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const) expect(f.fc.dms.get(f.ids[r])).toBe(1);
    for (const r of ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const) expect(await ledgerSum(f.ids[r], "caper_stake")).toBe(-50_000);
    await assertInvariants();
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST GO: briefs, the intel ring, Share, locks", () => {
  const R4: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"];

  it("the brief opens only at GO; non-crew, another family's member and a stranger are refused at every GO button", async () => {
    const lob = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const fc = fakeCaperClient();
    expect(said(await ui.brief(fc.client, lob.caper.id, lob.ids.LOOKOUT))).toContain("The brief opens at GO.");
    await resetFamilies();
    const { caper, ids } = await seedRunning({ tier: 1, roles: R4, picks: { LOOKOUT: "none" } });
    const other = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const stranger = await seedEligibleUser({});
    for (const uid of [other.ids.LOOKOUT, stranger, other.bossId]) {
      expect(said(await ui.brief(fc.client, caper.id, uid))).toContain("You are not in this crew heist.");
      expect(said(await ui.share(fc.client, caper.id, uid))).toContain("You are not in this crew heist.");
      expect(said(await ui.act(fc.client, caper.id, uid, 0))).toContain("You are not in this crew heist.");
      expect(said(await ui.leave(fc.client, caper.id, uid))).toContain("You are not in this crew heist.");
      expect(said(await ui.cancel(fc.client, caper.id, uid))).toContain("Only the planner or the Boss");
    }
    expect((await testPrisma.caperCrew.findFirstOrThrow({ where: { caperId: caper.id, userId: ids.LOOKOUT } })).choice).toBe(-1);
  });

  it("forged option indexes are refused: 4, -1, 1.5, NaN, 1e9, Infinity, 0.5", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: R4, picks: { LOOKOUT: "none", DRIVER: "none" } });
    const fc = fakeCaperClient();
    for (const idx of ["4", "-1", "1.5", "NaN", "1e9", "Infinity", "0.5"]) {
      expect(said(await ui.act(fc.client, caper.id, ids.LOOKOUT, idx))).toContain("Pick one of the four options.");
    }
    expect((await testPrisma.caperCrew.findFirstOrThrow({ where: { caperId: caper.id, userId: ids.LOOKOUT } })).choice).toBe(-1);
  });

  it("Share: needs an opened brief, goes once (double press), works after the sharer locked, nudges the seat it answers once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: R4, picks: { MASTERMIND: "none", LOOKOUT: "none", SAFECRACKER: "none", DRIVER: "none" }, dark: ["DRIVER"] });
    const fc = fakeCaperClient();
    // DRIVER never opened: Share refused.
    expect(said(await ui.share(fc.client, caper.id, ids.DRIVER))).toContain("Open your brief first.");
    const answers = await answersOf(caper.id);
    await ui.act(fc.client, caper.id, ids.LOOKOUT, answers.seats.LOOKOUT!.correct);
    const [a, b] = await Promise.all([ui.share(fc.client, caper.id, ids.LOOKOUT), ui.share(fc.client, caper.id, ids.LOOKOUT)]);
    expect(said(a) + said(b)).toContain("Already shared.");
    // The Lookout holds the Mastermind's intel: one nudge to the Mastermind, never the label.
    expect(fc.dms.get(ids.MASTERMIND)).toBe(1);
    const nudge = JSON.stringify(fc.lastDm.get(ids.MASTERMIND));
    expect(nudge).not.toContain(answers.seats.MASTERMIND!.options[answers.seats.MASTERMIND!.correct]);
    assertRenderable("intel DM", fc.lastDm.get(ids.MASTERMIND));
    const mm = await ui.brief(fc.client, caper.id, ids.MASTERMIND, { ephemeralSource: true });
    expect(said(mm)).toContain(`Intel from <@${ids.LOOKOUT}>: **${answers.seats.MASTERMIND!.options[answers.seats.MASTERMIND!.correct]}**`);
    // Only the Mastermind's brief shows it.
    expect(said(await ui.brief(fc.client, caper.id, ids.SAFECRACKER))).not.toContain(answers.seats.MASTERMIND!.options[answers.seats.MASTERMIND!.correct] + "**\\n");
  });

  it("locks: right and wrong recorded once (double press), a lock after goEndsAt is Too late, a dark seat cannot lock", async () => {
    const goEndsAt = new Date(Date.now() + 20_000);   // leakAt 10 s ago
    const { caper, ids } = await seedRunning({ tier: 1, roles: R4, startedAt: new Date(Date.now() - 100_000), goEndsAt, picks: { LOOKOUT: "none", SAFECRACKER: "none", DRIVER: "none" }, dark: ["DRIVER"] });
    const fc = fakeCaperClient();
    const answers = await answersOf(caper.id);
    const [x, y] = await Promise.all([ui.act(fc.client, caper.id, ids.LOOKOUT, 0), ui.act(fc.client, caper.id, ids.LOOKOUT, 1)]);
    expect(said(x) + said(y)).toContain("Locked in already.");
    expect(said(await ui.act(fc.client, caper.id, ids.DRIVER, answers.seats.DRIVER!.correct))).toContain("You went dark: this seat counts as a miss.");
    await testPrisma.caper.update({ where: { id: caper.id }, data: { goEndsAt: new Date(Date.now() - 1) } });
    expect(said(await ui.act(fc.client, caper.id, ids.SAFECRACKER, 0))).toContain("Too late.");
    expect(said(await ui.share(fc.client, caper.id, ids.SAFECRACKER))).toContain("Too late.");
    expect(said(await ui.brief(fc.client, caper.id, ids.SAFECRACKER))).toContain("Too late.");
    const crew = await crewOf(caper.id);
    expect(crew.find((r) => r.role === "SAFECRACKER")!.choice).toBe(-1);
    expect(crew.find((r) => r.role === "DRIVER")!.choice).toBe(-1);
  });

  it("the leak: from leakAt a seat whose holder is dark reads its answer and locks as leaked", async () => {
    const goEndsAt = new Date(Date.now() + 20_000);
    const { caper, ids } = await seedRunning({ tier: 1, roles: R4, startedAt: new Date(Date.now() - 100_000), goEndsAt, picks: { SAFECRACKER: "none", DRIVER: "none" }, dark: ["DRIVER"] });
    const fc = fakeCaperClient();
    const answers = await answersOf(caper.id);
    const label = answers.seats.SAFECRACKER!.options[answers.seats.SAFECRACKER!.correct];
    expect(said(await ui.brief(fc.client, caper.id, ids.SAFECRACKER))).toContain(`The intel leaked: **${label}**`);
    await ui.act(fc.client, caper.id, ids.SAFECRACKER, answers.seats.SAFECRACKER!.correct);
    expect((await crewOf(caper.id)).find((r) => r.role === "SAFECRACKER")!.leaked).toBe(true);
  });

  // BUG-HEIST-1: a seat can lock without ever opening its brief (cpr:act needs no
  // briefOpened), stay dark, and still be paid and counted as a pass; its partner
  // meanwhile reads the leaked answer. Spec 8.3/8.5/8.6 (D49): a dark seat is a miss with cut 0.
  it.fails("BUG-HEIST-1: a seat that locks blind (never opens its brief) is dark at the leak yet counted as a pass and paid", async () => {
    const startedAt = new Date(Date.now() - 10_000);
    const goEndsAt = new Date(startedAt.getTime() + 120_000);   // leakAt is 80 s away: the forged lock lands before it
    const { caper, ids, family } = await seedRunning({
      tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], startedAt, goEndsAt,
      picks: { MASTERMIND: "none", LOOKOUT: "none" }, dark: ["LOOKOUT"],
    });
    const fc = fakeCaperClient();
    const answers = await answersOf(caper.id);
    // The Lookout presses a forged cpr:act (an answer told over voice) without opening the brief.
    const blind = await ui.act(fc.client, caper.id, ids.LOOKOUT, answers.seats.LOOKOUT!.correct);
    expect(said(blind)).not.toContain("went dark");
    expect((await crewOf(caper.id)).find((r) => r.role === "LOOKOUT")!.briefOpened).toBe(false);
    // After the leak the Mastermind (whose holder is the dark Lookout) reads its answer for free.
    const leakAt = new Date(goEndsAt.getTime() - 30_000);
    const after = new Date(leakAt.getTime() + 1_000);
    const mmBrief = await openBrief(caper.id, ids.MASTERMIND, after);
    expect(mmBrief.leaked).toBe(answers.seats.MASTERMIND!.options[answers.seats.MASTERMIND!.correct]);
    await lockChoice(caper.id, ids.MASTERMIND, answers.seats.MASTERMIND!.correct, after);
    const before = await wallet(ids.LOOKOUT);
    await resolveCaper(caper.id, new Date(goEndsAt.getTime() + 1_000), scriptedRng([9_999, 9_999, 9_999]));
    const settled = await caperRow(caper.id);
    const lookout = (await crewOf(caper.id)).find((r) => r.role === "LOOKOUT")!;
    // The card marks the seat "(went dark)" while paying it.
    const card = await buildCaperCardView(caper.id, new Date());
    expect(card!.seats.find((s) => s.role === "LOOKOUT")!.dark).toBe(true);
    // Spec: the dark Lookout is a miss (so at best MESSY) and is paid 0.
    expect(settled.outcome).toBe("MESSY");
    expect(lookout.passed).toBe(false);
    expect(lookout.cut).toBe(0);
    expect(await wallet(ids.LOOKOUT)).toBe(before);
    void family;
  });

  it("a member jailed after Start still briefs and locks; jail at settlement extends but never shortens a longer sentence", async () => {
    const { caper, ids } = await seedRunning({ tier: 2, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"], picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong" } });
    const long = new Date(Date.now() + 10 * 3_600_000);
    await testPrisma.user.update({ where: { discordId: ids.DRIVER }, data: { isJailed: true, jailReleaseTime: long } });
    // Every jail roll succeeds (rollUnit 0 < 0.2).
    await resolveCaper(caper.id, new Date(), scriptedRng([0, 0, 0, 0, 0]));
    const c = await caperRow(caper.id);
    expect(c.outcome).toBe("BUST");
    const driver = await testPrisma.user.findUniqueOrThrow({ where: { discordId: ids.DRIVER } });
    expect(driver.jailReleaseTime!.getTime()).toBe(long.getTime());
    const lookout = await testPrisma.user.findUniqueOrThrow({ where: { discordId: ids.LOOKOUT } });
    expect(lookout.isJailed).toBe(true);
    expect(Math.abs(lookout.jailReleaseTime!.getTime() - (Date.now() + 1_200_000))).toBeLessThan(10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST settlement: exact math, exactly once, adversarial crews", () => {
  const R6: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"];

  it("spec 8.6 table: CLEAN and MESSY cuts for every tier and size from scripted rolls", async () => {
    const table: [Tier, number, number, number, number][] = [
      [1, 3, 1_050_000, 280_000, 98_000], [1, 4, 1_400_000, 280_000, 98_000], [2, 4, 2_200_000, 440_000, 154_000], [2, 5, 2_750_000, 440_000, 154_000],
      [3, 5, 4_250_000, 680_000, 238_000], [3, 6, 5_100_000, 680_000, 238_000], [4, 5, 6_000_000, 960_000, 336_000], [4, 6, 7_200_000, 960_000, 336_000],
    ];
    for (const [tier, n, poolClean, cutClean, cutMessy] of table) {
      for (const roll of [9_999, 0]) {
        await resetFamilies();
        const { caper } = await seedRunning({ tier, roles: ROLES_FOR(tier, n) });
        await resolveCaper(caper.id, new Date(), scriptedRng([roll, 0, 0, 0, 0, 0, 0]));
        const c = await caperRow(caper.id);
        const crew = await crewOf(caper.id);
        if (roll === 9_999) {
          expect({ tier, n, outcome: c.outcome, pool: c.pool, cut: crew[0].cut }).toEqual({ tier, n, outcome: "CLEAN", pool: poolClean, cut: cutClean });
        } else {
          expect({ tier, n, outcome: c.outcome, cut: crew[0].cut }).toEqual({ tier, n, outcome: "MESSY", cut: cutMessy });
        }
      }
    }
  });

  it("five settlers at once (sweeper, last lock, timer): one draw, each seat paid once, vault and XP once", async () => {
    const { caper, ids, family } = await seedRunning({ tier: 4, roles: R6 });
    const before = await money(Object.values(ids));
    await Promise.allSettled([1, 2, 3, 4, 5].map(() => resolveCaper(caper.id, new Date())));
    await resolveCaper(caper.id, new Date());
    const c = await caperRow(caper.id);
    expect(c.status).toBe("RESOLVED");
    const crew = await crewOf(caper.id);
    for (const r of crew) {
      expect(liquid(await money([r.userId]), r.userId) - liquid(before, r.userId)).toBe(r.cut);
      expect(await ledgerSum(r.userId, "caper_cut")).toBe(r.cut);
    }
    const fam = await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } });
    expect(fam.earnings).toBe(Math.floor(c.pool * 0.1));
    const ledger = await testPrisma.familyLedger.count({ where: { familyId: family.id, type: "caper_cut" } });
    expect(ledger).toBe(1);
    await assertInvariants();
  });

  it("a broke crew cannot dodge the Bust fine: wallet first, then the bank into debt", async () => {
    const { caper, ids } = await seedRunning({ tier: 4, roles: R6, picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong", DRIVER: "wrong" }, wallet: 0 });
    await testPrisma.wallet.update({ where: { userId: ids.MUSCLE }, data: { balance: 200_000 } });
    await resolveCaper(caper.id, new Date(), scriptedRng(Array(20).fill(9_999)));
    expect((await caperRow(caper.id)).outcome).toBe("BUST");
    const m = await money([ids.MUSCLE, ids.HACKER]);
    expect(m.get(ids.MUSCLE)).toEqual({ wallet: 0, bank: -550_000 });
    expect(m.get(ids.HACKER)).toEqual({ wallet: 0, bank: -750_000 });
  });

  it("no one can leave, be kicked, disband, cancel or re-start mid-run; a RUNNING seat cannot dodge the settlement", async () => {
    const { caper, ids, family, bossId } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], picks: { LOOKOUT: "none" } });
    const fc = fakeCaperClient();
    const { leaveFamily, kickMember } = await import("../../../src/services/crimeFamily/membershipService");
    const { disbandFamily } = await import("../../../src/services/crimeFamily/disbandService");
    expect(said(await ui.leave(fc.client, caper.id, ids.LOOKOUT))).toContain("The crew heist has started; your seat is locked in.");
    expect(said(await ui.cancel(fc.client, caper.id, ids.MASTERMIND))).toContain("Lobby closed.");
    expect(said(await ui.start(fc.client, caper.id, ids.MASTERMIND))).toContain("Lobby closed.");
    await expect(leaveFamily(ids.LOOKOUT)).rejects.toThrow(/live crew heist/);
    await expect(kickMember(bossId, ids.LOOKOUT)).rejects.toThrow(/running crew heist/);
    await expect(disbandFamily(bossId, family.tag)).rejects.toThrow(/crew heist is running/i);
    expect(await testPrisma.caperCrew.count({ where: { caperId: caper.id } })).toBe(3);
    await assertInvariants();
  });

  it("an adversarial crew that never locks takes no cut, still pays fine and heat on the Bust, and burns the stake", async () => {
    const { caper, ids } = await seedRunning({ tier: 2, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"], picks: { MASTERMIND: "none", LOOKOUT: "none", SAFECRACKER: "none", DRIVER: "none" }, wallet: 1_000_000 });
    await resolveCaper(caper.id, new Date(caper.goEndsAt.getTime() + 1), scriptedRng(Array(10).fill(9_999)));
    const c = await caperRow(caper.id);
    expect(c.outcome).toBe("BUST");
    for (const id of Object.values(ids)) {
      expect(await wallet(id)).toBe(700_000);
      expect((await testPrisma.user.findUniqueOrThrow({ where: { discordId: id } })).crimeHeat).toBe(45);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST VOID on restart (BotProcessBoot) and the sweeper racing players", () => {
  const R3: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"];

  it("a boot during GO with an unlocked seat VOIDs: every stake back once, no heat/XP/vault, the seat and family caps untouched", async () => {
    const { caper, ids, family } = await seedRunning({ tier: 1, roles: R3, picks: { SAFECRACKER: "none" } });
    await testPrisma.botProcessBoot.create({ data: { shardIds: [3], bootedAt: new Date(caper.startedAt.getTime() + 5_000) } });
    const fc = fakeCaperClient();
    const w0 = await money(Object.values(ids));
    await Promise.all([sweepCapers(fc.client, new Date(caper.goEndsAt.getTime() + 1_000)), sweepCapers(fc.client, new Date(caper.goEndsAt.getTime() + 2_000))]);
    const c = await caperRow(caper.id);
    expect({ status: c.status, outcome: c.outcome }).toEqual({ status: "CANCELLED", outcome: "VOID" });
    for (const id of Object.values(ids)) {
      expect(liquid(await money([id]), id) - liquid(w0, id)).toBe(50_000);
      expect(await ledgerSum(id, "caper_stake_refund")).toBe(50_000);
      expect((await testPrisma.user.findUniqueOrThrow({ where: { discordId: id } })).crimeHeat).toBe(0);
    }
    const fam = await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } });
    expect({ xp: fam.xp, earnings: fam.earnings }).toEqual({ xp: 0, earnings: 0 });
    expect(await testPrisma.caperCrew.count({ where: { userId: ids.LOOKOUT, started: true } })).toBe(0);
    // A lock after the VOID is too late, and the void card renders.
    expect(said(await ui.act(fc.client, caper.id, ids.SAFECRACKER, 0))).toContain("Too late.");
    const card = buildCaperCard((await buildCaperCardView(caper.id, new Date()))!, { art: true });
    expect(JSON.stringify(card)).toContain("Crew heist void");
    await assertInvariants();
  });

  it("the sweeper closing a lobby races the planner's Cancel and a member's Leave: one end state, each stake refunded once", async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: c.id, uid: f.ids.LOOKOUT, role: "LOOKOUT" });
    await testPrisma.caper.update({ where: { id: c.id }, data: { lobbyClosesAt: new Date(Date.now() - 1) } });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await Promise.allSettled([sweepCapers(fc.client, new Date()), ui.cancel(fc.client, c.id, f.ids.MASTERMIND), ui.leave(fc.client, c.id, f.ids.LOOKOUT), sweepCapers(fc.client, new Date())]);
    } finally { errors.mockRestore(); }
    expect((await caperRow(c.id)).status).toBe("CANCELLED");
    for (const id of [f.ids.MASTERMIND, f.ids.LOOKOUT]) expect(await ledgerSum(id, "caper_stake") + await ledgerSum(id, "caper_stake_refund")).toBe(0);
    await assertInvariants();
  });

  it("the sweeper starting a due lobby races the planner's Start: one GO call, one run", async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r });
    await testPrisma.caper.update({ where: { id: c.id }, data: { lobbyClosesAt: new Date(Date.now() - 1) } });
    await Promise.allSettled([sweepCapers(fc.client, new Date()), ui.start(fc.client, c.id, f.ids.MASTERMIND), sweepCapers(fc.client, new Date())]);
    expect((await caperRow(c.id)).status).toBe("RUNNING");
    expect(fc.sent.filter(isGoCall)).toHaveLength(1);
    await assertInvariants();
  });

  it("the sweeper resolving at goEndsAt races the last lock: paid once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: R3, picks: { SAFECRACKER: "none" }, goEndsAt: new Date(Date.now() + 5_000), startedAt: new Date(Date.now() - 115_000) });
    const fc = fakeCaperClient();
    const answers = await answersOf(caper.id);
    const before = await money(Object.values(ids));
    await Promise.allSettled([
      ui.act(fc.client, caper.id, ids.SAFECRACKER, answers.seats.SAFECRACKER!.correct),
      sweepCapers(fc.client, new Date(Date.now() + 10_000)),
      resolveAndAnnounce(fc.client, caper.id, new Date(Date.now() + 10_000)),
    ]);
    await sweepCapers(fc.client, new Date(Date.now() + 10_000));
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
    for (const r of await crewOf(caper.id)) expect(liquid(await money([r.userId]), r.userId) - liquid(before, r.userId)).toBe(r.cut);
    await assertInvariants();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST stale and forged customIds", () => {
  it("every button of a finished heist is dead: join, leave, start, cancel, brief, share, act; no money moves", () => open(async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await resolveCaper(caper.id, new Date());
    const fc = fakeCaperClient();
    const before = await money(Object.values(ids));
    expect(said(await ui.join(fc.client, caper.id, ids.LOOKOUT, "DRIVER"))).toContain("Lobby closed.");
    expect(said(await ui.leave(fc.client, caper.id, ids.LOOKOUT))).toContain("You are not in this crew heist.");
    expect(said(await ui.start(fc.client, caper.id, ids.MASTERMIND))).toContain("Lobby closed.");
    expect(said(await ui.cancel(fc.client, caper.id, ids.MASTERMIND))).toContain("Lobby closed.");
    expect(said(await ui.brief(fc.client, caper.id, ids.LOOKOUT))).toContain("Too late.");
    expect(said(await ui.share(fc.client, caper.id, ids.LOOKOUT))).toContain("Too late.");
    expect(said(await ui.act(fc.client, caper.id, ids.LOOKOUT, 0))).toContain("Too late.");
    expect(await money(Object.values(ids))).toEqual(before);
  }));

  it("a cancelled lobby's stale Join select (card or DM) refuses with no debit, and the member can join the next lobby", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const fc = fakeCaperClient();
    const c1 = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: c1.id, uid: f.ids.LOOKOUT, role: "LOOKOUT" });
    await cancelCaper(c1.id, f.ids.MASTERMIND);
    await testPrisma.family.update({ where: { id: f.family.id }, data: { nextCaperAt: daysAgo(1) } });
    const c2 = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const w = await wallet(f.ids.SAFECRACKER);
    expect(said(await ui.join(fc.client, c1.id, f.ids.SAFECRACKER, "SAFECRACKER", { guildId: null }))).toContain("Lobby closed.");
    expect(await wallet(f.ids.SAFECRACKER)).toBe(w);
    await ui.join(fc.client, c2.id, f.ids.LOOKOUT, "LOOKOUT");
    expect(await testPrisma.caperCrew.count({ where: { caperId: c2.id, userId: f.ids.LOOKOUT } })).toBe(1);
    await assertInvariants();
  }));

  it("cpr customIds forged with another family's caper id: every action refused, both heists untouched", () => open(async () => {
    const a = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], picks: { LOOKOUT: "none" } });
    const bf = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const b = await planCaper({ uid: bf.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: b.id, uid: bf.ids.LOOKOUT, role: "LOOKOUT" });
    const fc = fakeCaperClient();
    const before = await money([...Object.values(a.ids), ...Object.values(bf.ids)]);
    // Family A's Boss and crew against B's lobby; B's Boss and crew against A's run.
    expect(said(await ui.start(fc.client, b.id, a.bossId))).toContain("Only the planner or the Boss");
    expect(said(await ui.cancel(fc.client, b.id, a.bossId))).toContain("Only the planner or the Boss");
    expect(said(await ui.leave(fc.client, b.id, a.ids.LOOKOUT))).toContain("You are not in this crew heist.");
    expect(said(await ui.join(fc.client, b.id, a.ids.LOOKOUT, "SAFECRACKER"))).toMatch(/already hold a seat|belongs to another family/);
    expect(said(await ui.act(fc.client, a.caper.id, bf.ids.LOOKOUT, 0))).toContain("You are not in this crew heist.");
    expect(said(await ui.share(fc.client, a.caper.id, bf.ids.LOOKOUT))).toContain("You are not in this crew heist.");
    expect(said(await ui.raw(fc.client, CPR_IDS.openBrief(a.caper.id, bf.ids.LOOKOUT), bf.ids.LOOKOUT))).toContain("You are not in this crew heist.");
    expect(said(await ui.cancel(fc.client, a.caper.id, bf.bossId))).toContain("Only the planner or the Boss");
    expect(await money([...Object.values(a.ids), ...Object.values(bf.ids)])).toEqual(before);
    expect((await caperRow(b.id)).status).toBe("LOBBY");
    expect((await caperRow(a.caper.id)).status).toBe("RUNNING");
    await assertInvariants();
  }));

  it("malformed caper ids in cpr customIds fail closed with a generic refusal and no write", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const fc = fakeCaperClient();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const id of ["cpr:join:zzz", "cpr:start:not-an-id", "cpr:brief:", "cpr:act:abc:1", "cpr:share:<@1>", "cpr:cancel:65f0000000000000000000zz"]) {
        const i = await ui.raw(fc.client, id, f.ids.LOOKOUT, id.startsWith("cpr:join") ? ["LOOKOUT"] : undefined);
        expect(said(i)).toMatch(/Something went wrong|Lobby closed|not in this crew heist|Too late|role is not part|Only the planner/);
      }
    } finally { errors.mockRestore(); }
    expect(await testPrisma.caper.count()).toBe(0);
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST screens at worst case", () => {
  it("result card for a T4 Bust with six seats (relayed, leaked, dark, jailed), GO card, lobby, cancelled, VOID and personal cards all render within limits", async () => {
    const { caper, ids } = await seedRunning({ tier: 4, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"], picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong", DRIVER: "none" }, dark: ["DRIVER"], shared: ["MASTERMIND", "LOOKOUT", "MUSCLE", "HACKER"] });
    await testPrisma.caperCrew.updateMany({ where: { caperId: caper.id }, data: { relayed: true, leaked: true } });
    const go = (await buildCaperCardView(caper.id, new Date(), "Pinched at Start: " + Array(5).fill(`<@${ids.LOOKOUT}>`).join(", ")))!;
    assertRenderable("S13", buildCaperCard(go, { art: true }));
    for (const id of Object.values(ids)) assertRenderable("S25", buildPersonalCaperCard(go, id));
    await resolveCaper(caper.id, new Date(caper.goEndsAt.getTime() + 1_000), scriptedRng(Array(20).fill(0)));
    const result = (await buildCaperCardView(caper.id, new Date()))!;
    expect(result.outcome).toBe("BUST");
    assertRenderable("S15", buildCaperCard(result, { art: true }));
    const text = JSON.stringify(buildCaperCard(result, { art: true }).components.map((c: any) => c.toJSON()));
    expect(text).toContain("(went dark)");
    expect(text).toContain("jailed 60 min");
    const brief = await openBrief(caper.id, ids.MUSCLE, new Date()).catch(() => null);
    expect(brief).toBeNull(); // resolved: Too late
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST membership races and the router table", () => {
  /** Runs `before` once, just ahead of the next prisma.$transaction (the service's own transaction). */
  function beforeNextTransaction(before: () => Promise<unknown>) {
    const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (...args: unknown[]) => {
      spy.mockRestore();
      await before();
      return (original as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as never);
    return spy;
  }

  // BUG-HEIST-2: the seat gates read membership before the join transaction and the
  // transaction never re-reads it, while leaving the family (whose hook refuses a
  // member with a live seat) does not touch the caper. A leave committing between
  // the two leaves a non-member holding a LIVE seat (and its stake) in the old family's lobby.
  it.fails("BUG-HEIST-2: leaving the family while a Join is in flight leaves a non-member seated in the family's lobby", async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const { leaveFamily } = await import("../../../src/services/crimeFamily/membershipService");
    let left = false;
    beforeNextTransaction(async () => { await leaveFamily(f.ids.LOOKOUT); left = true; });
    const joined = await joinCaper({ caperId: c.id, uid: f.ids.LOOKOUT, role: "LOOKOUT" }).then(() => true, () => false);
    expect(left).toBe(true);
    const member = await testPrisma.familyMember.findUnique({ where: { userId: f.ids.LOOKOUT } });
    const seat = await testPrisma.caperCrew.findFirst({ where: { userId: f.ids.LOOKOUT, liveSlot: "LIVE" } });
    // Either the join is refused, or the member is still in the family: never a seat without membership.
    expect({ joined, seatedWithoutFamily: !member && !!seat }).toEqual({ joined: false, seatedWithoutFamily: false });
  });

  it("…and that non-member is pinched and refunded at Start (the Start re-check holds the money line)", async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const { leaveFamily } = await import("../../../src/services/crimeFamily/membershipService");
    beforeNextTransaction(() => leaveFamily(f.ids.DRIVER));
    await joinCaper({ caperId: c.id, uid: f.ids.DRIVER, role: "DRIVER" }).catch(() => undefined);
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r });
    const r = await startCaper(c.id, { kind: "press", uid: f.ids.MASTERMIND });
    expect(r.status).toBe("started");
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: f.ids.DRIVER } })).toBe(0);
    expect(await ledgerSum(f.ids.DRIVER, "caper_stake") + await ledgerSum(f.ids.DRIVER, "caper_stake_refund")).toBe(0);
  });

  // BUG-HEIST-3: the router looks routes up with `table[key]` on a plain object, so an
  // action named after an Object.prototype member resolves to that member, passes the
  // owner check (args end with the presser's id), is acknowledged, and then throws
  // "entry.run is not a function": logged as an error and answered "Something went wrong."
  it.fails("BUG-HEIST-3: cpr:constructor / __proto__ / toString:<own id> resolve Object.prototype members as routes and crash the handler", async () => {
    const uid = await seedEligibleUser({});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const out: string[] = [];
    let logged = 0;
    try {
      for (const action of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
        out.push(said(await ui.raw(fakeCaperClient().client, `cpr:${action}:${uid}`, uid)));
      }
      logged = errors.mock.calls.length;
    } finally { errors.mockRestore(); }
    for (const s of out) expect(s).toContain("This button is no longer active.");
    expect(logged).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST prefix command (!heist) from any server", () => {
  const T1: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"];

  async function bang(fc: ReturnType<typeof fakeCaperClient>, uid: string, args: string[], guildId = G, channelId = CH) {
    const reply = vi.fn(async (_p: unknown) => ({ id: "r1" }));
    const message = { client: fc.client, guildId, guild: { id: guildId }, channelId, channel: fc.channel(channelId), author: { id: uid, username: "T", bot: false }, reply } as any;
    await handleCaper(message, args);
    return JSON.stringify(reply.mock.calls);
  }

  it("join / leave / start / cancel / brief from another server; refusals name the reason; money nets out", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: T1 });
    const fc = fakeCaperClient();
    expect(await bang(fc, f.ids.MASTERMIND, ["plan", "9"])).toContain("Pick a tier from 1 to 4.");
    await bang(fc, f.ids.MASTERMIND, ["plan", "1"]);
    const c = (await liveCaperOf(f.family.id))!;
    expect(await bang(fc, f.ids.LOOKOUT, ["join", "mastermind"], "g-far")).toContain("The Mastermind seat belongs to the planner.");
    expect(await bang(fc, f.ids.LOOKOUT, ["join", "boss"], "g-far")).toContain("Unknown role.");
    expect(await bang(fc, f.ids.LOOKOUT, ["join", "look", "out"], "g-far")).toContain("seated as **Lookout**");
    expect(await bang(fc, f.ids.LOOKOUT, ["leave"], "g-far")).toContain("your stake was refunded");
    await bang(fc, f.ids.LOOKOUT, ["join", "lookout"]);
    await bang(fc, f.ids.SAFECRACKER, ["join", "safe_cracker"]);
    expect(await bang(fc, f.ids.LOOKOUT, ["start"], "g-far")).toContain("Only the planner or the Boss can start");
    expect(await bang(fc, f.ids.LOOKOUT, ["cancel"])).toContain("Only the planner or the Boss can cancel");
    expect(await bang(fc, f.ids.LOOKOUT, ["brief"])).toContain("No crew heist is running.");
    await bang(fc, f.ids.MASTERMIND, ["start"], "g-far");
    expect((await caperRow(c.id)).status).toBe("RUNNING");
    expect(await bang(fc, f.ids.LOOKOUT, ["brief"], "g-far")).toContain(`cpr:open:brief:${c.id}:${f.ids.LOOKOUT}`);
    expect(await bang(fc, f.ids.LOOKOUT, ["leave"])).toContain("The crew heist has started; your seat is locked in.");
    expect(await bang(fc, f.ids.DRIVER, ["join", "driver"])).toContain("Your family has no open lobby.");
    expect(await bang(fc, f.ids.MASTERMIND, ["cancel"])).toContain("Lobby closed.");
    expect(await ledgerSum(f.ids.LOOKOUT, "caper_stake") + await ledgerSum(f.ids.LOOKOUT, "caper_stake_refund")).toBe(-50_000);
    await assertInvariants();
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST crowd: several families playing at once", () => {
  it("three families plan, join, start, brief and lock concurrently through the router; every heist settles per spec, nothing leaks across", () => open(async () => {
    const crews = [];
    for (const [tier, n] of [[1, 4], [2, 5], [3, 6]] as const) {
      const f = await caperCrew({ tier, roles: ROLES_FOR(tier, n) });
      crews.push({ tier, n, f, snap: await snapshot(f.family.id, Object.values(f.ids)) });
    }
    const fc = fakeCaperClient();
    await Promise.all(crews.map((c) => ui.plan(fc.client, c.f.ids.MASTERMIND, String(c.tier))));
    const capers = await Promise.all(crews.map(async (c) => (await liveCaperOf(c.f.family.id))!));
    // Every joiner presses at once, plus a few hostile presses: a cross-family join and a duplicate role.
    await Promise.all(crews.flatMap((c, k) => [
      ...ROLES_FOR(c.tier, c.n).filter((r) => r !== "MASTERMIND").map((r) => ui.join(fc.client, capers[k].id, c.f.ids[r], r)),
      ui.join(fc.client, capers[(k + 1) % 3].id, c.f.ids.LOOKOUT, "LOOKOUT"),
    ]));
    for (const c of capers) expect((await caperRow(c.id)).status).toBe("RUNNING");
    const answers = await Promise.all(capers.map((c) => answersOf(c.id)));
    await Promise.all(crews.flatMap((c, k) => ROLES_FOR(c.tier, c.n).map(async (r) => {
      await ui.brief(fc.client, capers[k].id, c.f.ids[r]);
      await ui.act(fc.client, capers[k].id, c.f.ids[r], answers[k].seats[r]!.correct);
    })));
    for (const [k, c] of crews.entries()) {
      await sweepCapers(fc.client, new Date(Date.now() + 200_000));
      await assertSettledPerSpec({ caperId: capers[k].id, ...c.snap });
    }
    await assertInvariants();
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
describe("HEIST after the take: heat, investigation and the per-player caps feed back", () => {
  it("a Bust's heat puts the family under investigation (3 of 3 at ≥ 100) and the next plan is refused", () => open(async () => {
    const { caper, ids, family } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong" }, wallet: 5_000_000 });
    for (const id of Object.values(ids)) await testPrisma.user.update({ where: { discordId: id }, data: { crimeHeat: 60 } });
    await resolveCaper(caper.id, new Date(), scriptedRng(Array(10).fill(9_999)));
    expect((await caperRow(caper.id)).outcome).toBe("BUST");
    for (const id of Object.values(ids)) expect((await testPrisma.user.findUniqueOrThrow({ where: { discordId: id } })).crimeHeat).toBe(100);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: daysAgo(1) } });
    const fc = fakeCaperClient();
    expect(said(await ui.plan(fc.client, ids.MASTERMIND, "1"))).toContain("under investigation");
  }));

  it("two full runs use a member's two seats: a third Join is refused until the oldest seat ages out; a T4 run's heat bars the next T4 seat", () => open(async () => {
    const roles: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"];
    const f = await caperCrew({ tier: 4, roles });
    const fc = fakeCaperClient();
    for (let run = 0; run < 2; run++) {
      await testPrisma.family.update({ where: { id: f.family.id }, data: { nextCaperAt: daysAgo(1) } });
      await testPrisma.user.updateMany({ where: { discordId: { in: Object.values(f.ids) } }, data: { crimeHeat: 0 } });
      await ui.plan(fc.client, f.ids.MASTERMIND, "4");
      const c = (await liveCaperOf(f.family.id))!;
      for (const r of roles.filter((x) => x !== "MASTERMIND")) await ui.join(fc.client, c.id, f.ids[r], r);
      const answers = await answersOf(c.id);
      for (const r of roles) { await ui.brief(fc.client, c.id, f.ids[r]); await ui.act(fc.client, c.id, f.ids[r], answers.seats[r]!.correct); }
      expect((await caperRow(c.id)).status).toBe("RESOLVED");
    }
    // Heat after a T4 run is 40 (Clean) or 50 (Messy): at or over the T4 ceiling of 40.
    const heat = (await testPrisma.user.findUniqueOrThrow({ where: { discordId: f.ids.LOOKOUT } })).crimeHeat;
    expect(heat).toBeGreaterThanOrEqual(40);
    await testPrisma.family.update({ where: { id: f.family.id }, data: { nextCaperAt: daysAgo(1) } });
    // The planner is out of seats too: the plan itself is refused.
    expect(said(await ui.plan(fc.client, f.ids.MASTERMIND, "4"))).toMatch(/used both crew heist seats|heat below 40/);
    await assertInvariants();
  }));

  it("planning from a DM is refused before any write", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    expect(said(await ui.plan(fakeCaperClient().client, f.ids.MASTERMIND, "1", { guildId: null }))).toContain("not open in this server");
    expect(await testPrisma.caper.count()).toBe(0);
  }));
});
