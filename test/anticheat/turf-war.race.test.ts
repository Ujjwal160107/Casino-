import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { openWarPeriods, closeBidding, claimWarnSoon, activateWar, recordWarTick, beginSettle, settleWar } from "../../src/services/crimeFamily/warService";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution } from "../helpers";

const at = (s: string) => new Date(s);
const M = 60_000;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const war = (id: string) => testPrisma.war.findUnique({ where: { id } });
const heat = async (id: string) => (await testPrisma.user.findUnique({ where: { discordId: id } }))!.crimeHeat;
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

async function family(level = 7, earnings = 0) {
  const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, level, earnings, homeGuildId: "g1", members: [{ userId: a, role: "SOLDIER", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, ids: [boss, a, b] };
}

describe("war lifecycle (9.4, 15)", () => {
  it("opens one War per racket per period while its window is open (T13)", async () => {
    await seedRackets();
    const now = at("2026-11-01T18:00:00Z");
    await Promise.all([openWarPeriods(now), openWarPeriods(now)]);
    const rows = await testPrisma.war.findMany({ orderBy: { racketKey: "asc" } });
    expect(rows.map((w) => w.racketKey)).toEqual(["docks_numbers", "harbor_customs", "laundromat_front", "neon_strip", "valet_racket"]);
    expect(rows.find((w) => w.racketKey === "valet_racket")).toMatchObject({ status: "BIDDING", periodKey: "2026-W45", bidOpensAt: at("2026-11-01T18:00:00Z"), bidClosesAt: at("2026-11-04T17:00:00Z"), startsAt: at("2026-11-04T18:00:00Z"), endsAt: at("2026-11-04T19:00:00Z") });
    await testPrisma.war.deleteMany();
    await openWarPeriods(at("2026-11-02T17:30:00Z"));
    expect(await testPrisma.war.count({ where: { racketKey: "docks_numbers" } })).toBe(0);
  });

  it("closing bidding arms with a defender snapshot, cancels with no bid, and refunds when turf is off (T1)", async () => {
    const owner = await family(); const a = await family(); const c = await family();
    await seedRacket("docks_numbers", { ownerFamilyId: owner.f.id });
    const past = new Date(Date.now() + 30 * M);
    const w1 = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", startsAt: past, topBid: 2_100_000, topBidderFamilyId: a.f.id });
    expect(await Promise.all([closeBidding(w1.id, new Date(), true), closeBidding(w1.id, new Date(), true)])).toContain("ARMED");
    expect(await war(w1.id)).toMatchObject({ status: "ARMED", attackerFamilyId: a.f.id, defenderFamilyId: owner.f.id, topBid: 2_100_000 });
    const w2 = await seedWar({ racketKey: "pawn_row", status: "BIDDING", startsAt: past });
    expect(await closeBidding(w2.id, new Date(), true)).toBe("CANCELLED");
    const w3 = await seedWar({ racketKey: "valet_racket", status: "BIDDING", startsAt: past, topBid: 2_100_000, topBidderFamilyId: c.f.id });
    expect(await closeBidding(w3.id, new Date(), false)).toBe("CANCELLED");
    expect((await fam(c.f.id))!.earnings).toBe(2_100_000);
  });

  it("the war-soon CAS fires once", async () => {
    const a = await family();
    const w = await seedWar({ racketKey: "pawn_row", status: "ARMED", topBid: 2_100_000, topBidderFamilyId: a.f.id });
    expect(await Promise.all([claimWarnSoon(w.id), claimWarnSoon(w.id)])).toEqual(expect.arrayContaining([true, false]));
  });

  it("activation seeds a secret and the class baseline for any defender, or cancels when late (D52, D55)", async () => {
    const a = await family();
    const w = await seedWar({ racketKey: "city_hall", status: "ARMED", startsAt: new Date(Date.now() - M), topBid: 9_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "" });
    expect(await activateWar(w.id, new Date())).toBe("ACTIVE");
    const live = (await war(w.id))!;
    expect(live.seed).toMatch(/^[0-9a-f]{32}$/);
    expect([live.defDocks, live.defMain, live.defAlleys, live.atkDocks]).toEqual([80, 80, 80, 0]);
    const d = await family();
    const fw = await seedWar({ racketKey: "harbor_customs", status: "ARMED", startsAt: new Date(Date.now() - M), topBid: 4_550_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    expect(await activateWar(fw.id, new Date())).toBe("ACTIVE");
    const fl = (await war(fw.id))!;
    expect([fl.defDocks, fl.defMain, fl.defAlleys]).toEqual([50, 50, 50]);         // a family defender also starts at the DISTRICT baseline (D52)
    const late = await seedWar({ racketKey: "casino_row", status: "ARMED", startsAt: new Date(Date.now() - 11 * M), topBid: 9_100_000, topBidderFamilyId: a.f.id });
    expect(await activateWar(late.id, new Date())).toBe("CANCELLED");
    expect((await fam(a.f.id))!.earnings).toBe(9_100_000);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: a.f.id, type: "bid_refund" } })).toMatchObject({ amount: 9_100_000 });
  });

  it("ticks keep the largest gap, measured up to endsAt (T2)", async () => {
    const a = await family();
    const now = new Date();
    const w = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", startsAt: new Date(+now - 50 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, lastTickAt: new Date(+now - 2 * M) });
    await recordWarTick(w.id, now);
    expect(await war(w.id)).toMatchObject({ maxTickGapSeconds: 120, lastTickAt: now });
    const ended = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", startsAt: new Date(+now - 76 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, lastTickAt: new Date(+now - 17 * M) });
    await recordWarTick(ended.id, now);
    expect((await war(ended.id))!.maxTickGapSeconds).toBe(60);
  });
});

describe("settlement (9.4, edges 11, 12, 15, 16)", () => {
  it("a capture moves ownership, burns the bid and awards XP once under two settlers", async () => {
    const d = await family(); const a = await family();
    await seedRacket("casino_row", { ownerFamilyId: d.f.id, neglectStrikes: 2 });
    const w = await seedWar({ racketKey: "casino_row", status: "SETTLING", topBid: 9_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 90, atkMain: 90, atkAlleys: 0, defDocks: 80, defMain: 80, defAlleys: 80 } });
    for (const id of a.ids) await seedContribution({ warId: w.id, familyId: a.f.id, userId: id, side: "ATK", hits: 6, correctHits: 6, points: 60 });
    const rs = await Promise.all([settleWar(w.id, new Date()), settleWar(w.id, new Date())]);
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect(rs.find(Boolean)).toMatchObject({ outcome: "CAPTURED", burned: 9_100_000, heated: [] });
    expect(await testPrisma.racket.findUnique({ where: { key: "casino_row" } })).toMatchObject({ ownerFamilyId: a.f.id, neglectStrikes: 0 });
    expect(await fam(a.f.id)).toMatchObject({ warWins: 1, xp: 600 + 18 * 5 });
    expect(await testPrisma.familyLedger.count({ where: { type: "war_bid_burn" } })).toBe(1);
    expect(await war(w.id)).toMatchObject({ status: "RESOLVED", winnerFamilyId: a.f.id });
  });

  it("a held defence: heat for attackers who hit, defence XP only with attacker hits on 2 blocks (D64)", async () => {
    const d = await family(1); const a = await family(1);
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 40, atkMain: 20, atkAlleys: 0, defDocks: 30, defMain: 42, defAlleys: 30 } });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[0], side: "ATK", hits: 4, correctHits: 4, points: 40 });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[1], side: "ATK", hits: 2, correctHits: 2, points: 20 });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[2], side: "ATK", hits: 0, lastScoutSlot: 3 });
    await seedContribution({ warId: w.id, familyId: d.f.id, userId: d.ids[0], side: "DEF", hits: 1, correctHits: 1, points: 12 });
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "HELD" });
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.ownerFamilyId).toBe(d.f.id);
    expect([await heat(a.ids[0]), await heat(a.ids[1]), await heat(a.ids[2])]).toEqual([15, 15, 0]);
    expect(await fam(d.f.id)).toMatchObject({ xp: 305, warWins: 1 });
    expect(await fam(a.f.id)).toMatchObject({ xp: 30, warWins: 0 });
  });

  it("a staged war earns the defender nothing; the Street holds at the baseline (D52, D64, edge 16)", async () => {
    const d = await family(1); const a = await family(7);
    await seedRacket("pawn_row", { ownerFamilyId: d.f.id });
    const staged = await seedWar({ racketKey: "pawn_row", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 10, defDocks: 30, defMain: 30, defAlleys: 30 } });
    await settleWar(staged.id, new Date());
    expect(await fam(d.f.id)).toMatchObject({ xp: 0, warWins: 0 });
    await seedRacket("city_hall");
    const street = await seedWar({ racketKey: "city_hall", status: "SETTLING", topBid: 9_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "", scores: { atkDocks: 80, atkMain: 80, defDocks: 80, defMain: 80, defAlleys: 80 } });
    expect(await settleWar(street.id, new Date())).toMatchObject({ outcome: "HELD", burned: 9_100_000 });
    expect((await testPrisma.racket.findUnique({ where: { key: "city_hall" } }))!.ownerFamilyId).toBe("");
  });

  it("a tick gap over 600 s cancels and refunds: no ownership, XP or heat (D55, edge 12)", async () => {
    const a = await family(1);
    await seedRacket("valet_racket");
    const w = await seedWar({ racketKey: "valet_racket", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, maxTickGapSeconds: 601, scores: { atkDocks: 90, atkMain: 90 } });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[0], side: "ATK", hits: 6, correctHits: 6, points: 60 });
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "CANCELLED", refunded: 2_100_000, xp: [] });
    expect(await fam(a.f.id)).toMatchObject({ earnings: 2_100_000, xp: 0 });
    expect(await heat(a.ids[0])).toBe(0);
    expect((await testPrisma.racket.findUnique({ where: { key: "valet_racket" } }))!.ownerFamilyId).toBe("");
  });

  it("a capture lands when the defender lost the racket meanwhile, and an over-cap capture goes to the Street (T19)", async () => {
    const d = await family(1); const a = await family(1);
    await seedRacket("docks_numbers", { ownerFamilyId: "" });           // neglect released it during the war
    const w = await seedWar({ racketKey: "docks_numbers", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 40, atkMain: 40 } });
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "CAPTURED", overCap: false });
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.ownerFamilyId).toBe(a.f.id);
    await seedRacket("pawn_row");
    const w2 = await seedWar({ racketKey: "pawn_row", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "", scores: { atkDocks: 40, atkMain: 40 } });
    expect(await settleWar(w2.id, new Date())).toMatchObject({ outcome: "CAPTURED", overCap: true });
    expect((await testPrisma.racket.findUnique({ where: { key: "pawn_row" } }))!.ownerFamilyId).toBe("");
    const burn = await testPrisma.familyLedger.findFirst({ where: { familyId: a.f.id, type: "war_bid_burn" }, orderBy: { createdAt: "desc" } });
    expect((burn!.meta as any).overCap).toBe(true);
  });

  it("beginSettle moves an ended ACTIVE war to SETTLING once; a SETTLING war left by a crash resumes", async () => {
    const a = await family(1);
    await seedRacket("pawn_row");
    const w = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", startsAt: new Date(Date.now() - 61 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "" });
    expect(await Promise.all([beginSettle(w.id, new Date()), beginSettle(w.id, new Date())])).toEqual(expect.arrayContaining([true, false]));
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "HELD" });
    expect(await settleWar(w.id, new Date())).toBeNull();
  });
});
