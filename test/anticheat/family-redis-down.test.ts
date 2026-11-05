import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { redisService } from "../../src/services/redisService";
import { setNx, touchActivity } from "../../src/services/crimeFamily/activity";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { inviteMember, acceptInvite } from "../../src/services/crimeFamily/membershipService";
import { depositToVault } from "../../src/services/crimeFamily/vaultService";
import { executePayday } from "../../src/services/crimeFamily/paydayService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, withCfConfig } from "../helpers";
import { planCaper, joinCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { parseAnswers } from "../../src/services/crimeFamily/intelRing";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { onSeatsChanged, resolveAndAnnounce, announceLobby } from "../../src/ui/crimeFamily/caperFlow";
import { caperCrew, fakeCaperClient, G, CH } from "../crimeFamily/caperFixtures";
import { scoutWar, armHit, answerHit } from "../../src/services/crimeFamily/warActions";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { collectRacket } from "../../src/services/crimeFamily/racketService";
import { tickWars, tickRackets } from "../../src/services/crimeFamily/turfJobs";
import { weakPoint } from "../../src/services/crimeFamily/warMath";
import { fakeClient } from "../crimeFamily/fakeClient";

// Redis never guards family money or membership (spec 14.3): an outage must
// not stop a single family write, and the activity throttle writes anyway.

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const member = (id: string) => testPrisma.familyMember.findUniqueOrThrow({ where: { userId: id } });
const redisDown = () => vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); });

const activeRule = { key: "test", label: "test seats", need: 1, count: async () => 1 };

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);
afterEach(() => vi.restoreAllMocks());

describe("activity throttle (14.3 cf:active)", () => {
  it("setNx reports set, then held, while Redis is up", async () => {
    const key = "cf:test:setnx";
    await testRedis().del(key);
    expect(await setNx(key, 60)).toBe("set");
    expect(await setNx(key, 60)).toBe("held");
  });

  it("a second touch within the hour leaves lastActiveAt unchanged", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    await testRedis().del(`cf:active:${boss}`);
    const first = new Date("2026-11-04T10:00:00Z");
    await touchActivity(boss, first);
    expect(+(await member(boss)).lastActiveAt).toBe(+first);
    await touchActivity(boss, new Date("2026-11-04T10:30:00Z"));
    expect(+(await member(boss)).lastActiveAt).toBe(+first);
  });
});

describe("with Redis down", () => {
  it("setNx returns error and touchActivity still writes lastActiveAt", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    redisDown();
    expect(await setNx("cf:test:down", 60)).toBe("error");
    const now = new Date("2026-11-04T12:00:00Z");
    await expect(touchActivity(boss, now)).resolves.toBeUndefined();
    expect(+(await member(boss)).lastActiveAt).toBe(+now);
  });

  it("createFamily, invite/accept and depositToVault succeed with correct balances", async () => {
    const boss = await seedEligibleUser({ wallet: 15_000_000 });
    const joinerId = await seedEligibleUser({ wallet: 2_000_000 });
    redisDown();
    const family = await createFamily({ uid: boss, username: "b", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" });
    expect(await wallet(boss)).toBe(5_000_000);

    const inv = await inviteMember({ inviterId: boss, inviteeId: joinerId, guildId: "g1", channelId: "c1" });
    expect((await acceptInvite(inv.id, joinerId)).member).toMatchObject({ familyId: family.id, role: "SOLDIER" });

    expect(await depositToVault(joinerId, 1_000_000)).toMatchObject({ tax: 50_000, net: 950_000 });
    expect(await wallet(joinerId)).toBe(1_000_000);
    expect(await testPrisma.family.findUnique({ where: { id: family.id } })).toMatchObject({ treasury: 950_000 });
  });

  it("executePayday pays every eligible member", async () => {
    ACTIVITY_RULES.push(activeRule);
    try {
      const boss = await seedEligibleUser();
      const soldiers = [await seedEligibleUser(), await seedEligibleUser()];
      const family = await seedFamily({
        bossId: boss, earnings: 3_000_000, lastPaydayAt: daysAgo(8),
        members: soldiers.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
      });
      redisDown();
      expect(await executePayday(family.id, boss, { earnings: 3_000_000, count: 3 })).toMatchObject({ status: "paid" });
      for (const id of [boss, ...soldiers]) expect(await wallet(id)).toBe(950_000);
    } finally {
      ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(activeRule), 1);
    }
  });
});

describe("capers with Redis down", () => {
  const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
  const bal = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  const text = (payload: any) => JSON.stringify(payload.components.map((c: any) => c.toJSON()));
  let down: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => { await resetFamilies(); down = vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); }); });
  afterEach(() => down.mockRestore());

  it("plan → joins → auto-start → locks → settle pays exactly the stored outcome, and every state renders", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const mid = await postCaperCard(fc.client, c.id, CH);
    for (const r of ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const) {
      const j = await joinCaper({ caperId: c.id, uid: f.ids[r], role: r, guildId: G });
      await onSeatsChanged(fc.client, c.id, j.full);                     // un-debounced render, then the auto-start
    }
    const run = await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } });
    expect(run.status).toBe("RUNNING");
    const base = new Map(await Promise.all(Object.values(f.ids).map(async (id) => [id, await bal(id)] as const)));   // after every stake
    const earnings0 = (await testPrisma.family.findUniqueOrThrow({ where: { id: f.family.id } })).earnings;
    const answers = parseAnswers(run.answers)!;
    const t = new Date(+run.startedAt + 5_000);
    for (const r of T1) { await openBrief(c.id, f.ids[r], t); await lockChoice(c.id, f.ids[r], answers.seats[r]!.correct, t); }
    await resolveAndAnnounce(fc.client, c.id, new Date(+run.goEndsAt + 1_000), new Date(0));
    const done = await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } });
    expect(done.status).toBe("RESOLVED");
    const cut = done.outcome === "CLEAN" ? 280_000 : 98_000;             // T1 n=4 (8.6)
    for (const id of Object.values(f.ids)) expect(await bal(id)).toBe(base.get(id)! + cut);
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.family.id } })).earnings).toBe(earnings0 + Math.floor((done.pool * 10) / 100));
    const cards = fc.edits.filter((e) => e.messageId === mid).map((e) => e.payload);
    expect(cards.some((p) => text(p).includes(`cpr:join:${c.id}`))).toBe(true);                                   // LOBBY
    expect(cards.some((p) => text(p).includes(`cpr:brief:${c.id}`))).toBe(true);                                  // GO (S13)
    expect(cards.some((p) => (p.files ?? []).some((x: any) => x.name.startsWith("cf_result_")))).toBe(true);      // result (S15)
  });

  it("announceLobby still DMs a qualified member (the lobby-DM cap fails open)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    expect(await announceLobby(fc.client, c.id)).toEqual(expect.arrayContaining([f.ids.LOOKOUT, f.ids.SAFECRACKER, f.ids.DRIVER]));
    expect(fc.dms.get(f.ids.LOOKOUT)).toBe(1);
  });
});

describe("turf with Redis down (spec 18 shape 4, edge 8)", () => {
  const H = 3600_000;
  const balance = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  async function turfSides() {
    const mk = async (ch: string) => {
      const boss = await seedEligibleUser({ wallet: 200_000 }); const ub = await seedEligibleUser({ wallet: 200_000 }); const s = await seedEligibleUser({ wallet: 200_000 });
      const f = await seedFamily({ bossId: boss, level: 1, earnings: 5_000_000, homeGuildId: "g1", homeChannelId: ch, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
      return { f, boss, ub, s };
    };
    return { a: await mk("ch-a"), d: await mk("ch-d") };
  }
  beforeAll(() => ensureUniqueIndexes(["Racket", "War", "WarContribution"]));
  beforeEach(async () => { await resetFamilies(); vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); }); });
  afterEach(() => vi.restoreAllMocks());

  it("scout, arm and answer still work: wallet −25,000, score +10", async () => {
    const { a, d } = await turfSides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    await scoutWar({ warId: w.id, userId: a.s, guildId: "g1" });
    const h = await armHit({ warId: w.id, userId: a.s, guildId: "g1", block: "docks" });
    const slot = (await testPrisma.warHit.findUnique({ where: { id: h.hitId } }))!.slot;
    expect(await answerHit({ hitId: h.hitId, userId: a.s, choice: weakPoint(w.seed, "docks", slot) })).toEqual({ correct: true, points: 10, block: "docks" });
    expect(await balance(a.s)).toBe(175_000);
    expect((await testPrisma.war.findUnique({ where: { id: w.id } }))!.atkDocks).toBe(10);
  });

  it("placeBid moves the escrow out of earnings", async () => {
    const { a } = await turfSides();
    await seedWar({ racketKey: "pawn_row", status: "BIDDING" });
    await placeBid({ racketKey: "pawn_row", actorId: a.boss, amount: 2_100_000 });
    expect((await testPrisma.family.findUnique({ where: { id: a.f.id } }))!.earnings).toBe(2_900_000);
    expect(await testPrisma.war.findFirst({ where: { racketKey: "pawn_row" } })).toMatchObject({ topBid: 2_100_000, topBidderFamilyId: a.f.id });
  });

  it("collectRacket mints one cycle", async () => {
    const { a } = await turfSides();
    const r = await seedRacket("pawn_row", { ownerFamilyId: a.f.id, lastPayoutAt: new Date(Date.now() - 25 * H) });
    expect(await collectRacket(r.id, new Date(), 3)).toMatchObject({ status: "minted", cycles: 1, amount: 300_000 });
    expect((await testPrisma.family.findUnique({ where: { id: a.f.id } }))!.earnings).toBe(5_300_000);
  });

  it("tickWars edits both boards on two consecutive minutes, because setNx 'error' renders (T7)", async () => {
    const { a, d } = await turfSides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, boards: [
      { side: "ATK", guildId: "g1", channelId: "ch-a", messageId: "m-a", hasBanner: true, dead: false },
      { side: "DEF", guildId: "g1", channelId: "ch-d", messageId: "m-d", hasBanner: true, dead: false },
    ] });
    const c = fakeClient();
    const now = new Date();
    await tickWars(c.client, now);
    await tickWars(c.client, new Date(+now + 60_000));
    const edits = (ch: string) => c.calls.filter((x) => x.op === "edit" && x.channelId === ch).length;
    expect([edits("ch-a"), edits("ch-d")]).toEqual([2, 2]);
    expect(c.calls.filter((x) => x.op === "send")).toHaveLength(0);
  });

  it("tickRackets still sends its neglect DMs", async () => {
    const { a } = await turfSides();                                  // no war hits: nobody is racket-eligible
    await seedRacket("pawn_row", { ownerFamilyId: a.f.id, lastPayoutAt: new Date(Date.now() - 25 * H) });
    const c = fakeClient();
    await withCfConfig({ enabled: true, turfEnabled: true }, () => tickRackets(c.client, new Date()));
    expect((await testPrisma.racket.findUnique({ where: { key: "pawn_row" } }))!.neglectStrikes).toBe(1);
    expect([...c.dm.keys()].sort()).toEqual([a.boss, a.ub, a.s].sort());
  });
});
