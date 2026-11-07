import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { openWarPeriods, closeBidding, claimWarnSoon, activateWar, recordWarTick, beginSettle, settleWar } from "../../src/services/crimeFamily/warService";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { scoutWar, armHit, answerHit, sweepWarHits } from "../../src/services/crimeFamily/warActions";
import { weakPoint, slotOf } from "../../src/services/crimeFamily/warMath";
import { WAR_BLOCKS } from "../../src/data/crimeFamilyCatalog";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution } from "../helpers";

const at = (s: string) => new Date(s);
const M = 60_000;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const war = (id: string) => testPrisma.war.findUnique({ where: { id } });
const heat = async (id: string) => (await testPrisma.user.findUnique({ where: { discordId: id } }))!.crimeHeat;
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

async function family(level = 7, earnings = 0, tag?: string) {
  const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, level, earnings, tag, homeGuildId: "g1", members: [{ userId: a, role: "SOLDIER", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
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

  it("arming writes the racket, so the owner's racing disband never leaves a deleted defender", async () => {
    for (const key of ["docks_numbers", "pawn_row", "valet_racket"]) {
      const tag = key.slice(0, 3).toUpperCase();
      const owner = await family(7, 0, tag); const a = await family();
      await testPrisma.family.update({ where: { id: owner.f.id }, data: { lastPaydayAt: daysAgo(1) } });
      const before = await seedRacket(key, { ownerFamilyId: owner.f.id });
      const w = await seedWar({ racketKey: key, status: "BIDDING", startsAt: new Date(Date.now() + 30 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id });
      await Promise.allSettled([closeBidding(w.id, new Date(), true), disbandFamily(owner.ids[0], tag)]);
      const armed = (await war(w.id))!;
      expect(armed).toMatchObject({ status: "ARMED", attackerFamilyId: a.f.id });
      if (armed.defenderFamilyId !== "") expect(await fam(armed.defenderFamilyId)).not.toBeNull();
      const after = (await testPrisma.racket.findUnique({ where: { key } }))!;
      expect(+after.updatedAt).toBeGreaterThan(+before.updatedAt);
    }
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

  it("a held war whose defender family is gone settles as the Street: no XP, warWins or war_hits for it", async () => {
    const d = await family(1); const a = await family(1);
    await seedRacket("docks_numbers");                                   // the defender's disband released it
    const w = await seedWar({ racketKey: "docks_numbers", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 40, atkMain: 20, atkAlleys: 0, defDocks: 30, defMain: 42, defAlleys: 30 } });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[0], side: "ATK", hits: 6, correctHits: 6, points: 60 });
    await seedContribution({ warId: w.id, familyId: d.f.id, userId: d.ids[0], side: "DEF", hits: 1, correctHits: 1, points: 12 });
    await testPrisma.familyMember.deleteMany({ where: { familyId: d.f.id } });
    await testPrisma.family.delete({ where: { id: d.f.id } });
    const r = await settleWar(w.id, new Date());
    expect(r).toMatchObject({ outcome: "HELD", burned: 2_100_000, xp: [{ familyId: a.f.id, xp: 30 }] });
    expect(await war(w.id)).toMatchObject({ status: "RESOLVED" });
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.ownerFamilyId).toBe("");
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

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
async function liveWar(o: { started?: number } = {}) {
  const d = await family(1); const a = await family(1);
  for (const id of [...a.ids, ...d.ids]) await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 200_000 } });
  await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
  const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", startsAt: new Date(Date.now() - (o.started ?? 10) * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
  return { w, a, d };
}
const right = (seed: string, block: "docks" | "main" | "alleys", startsAt: Date, now = new Date()) => weakPoint(seed, block, slotOf(startsAt, now));

describe("war actions (9.4, edges 45–51)", () => {
  it("scouting is free, once per member per slot, and reveals the current weak point", async () => {
    const { w, a } = await liveWar();
    const rs = await Promise.allSettled([scoutWar({ warId: w.id, userId: a.ids[1] }), scoutWar({ warId: w.id, userId: a.ids[1] })]);
    const ok = rs.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect((rs.find((r) => r.status === "rejected") as any).reason.message).toMatch(/^Already scouted this slot, next at <t:\d+:R>\.$/);
    const rep = ok[0].value;
    const block = WAR_BLOCKS.find((b) => b.key === rep.block)!;
    expect(rep.approach).toBe(block.approaches[right(w.seed, rep.block, w.startsAt)]);
    expect(await testPrisma.warContribution.count({ where: { warId: w.id } })).toBe(1);
    expect(await wallet(a.ids[1])).toBe(200_000);
  });

  it("a hit costs 25,000, arms a 20 s call and sets the 600 s cooldown; racing presses debit once", async () => {
    const { w, a } = await liveWar();
    const now = new Date();
    const rs = await Promise.allSettled([armHit({ warId: w.id, userId: a.ids[0], block: "main", now }), armHit({ warId: w.id, userId: a.ids[0], block: "docks", now })]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((rs.find((r) => r.status === "rejected") as any).reason.message).toMatch(/^Next hit <t:\d+:R>\.$|Vault busy/);
    expect(await wallet(a.ids[0])).toBe(175_000);
    const hit = (await testPrisma.warHit.findFirst({ where: { warId: w.id } }))!;
    expect(hit).toMatchObject({ state: "ARMED", side: "ATK", slot: slotOf(w.startsAt, now), deadline: new Date(+now + 20_000) });
    expect(await testPrisma.warContribution.findFirst({ where: { warId: w.id, userId: a.ids[0] } })).toMatchObject({ hits: 1, nextHitAt: new Date(+now + 600_000) });
  });

  it("enforces 6 hits per war and refuses a short wallet with nothing written (edge 46)", async () => {
    const { w, a } = await liveWar();
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[1], side: "ATK", hits: 6 });
    await expect(armHit({ warId: w.id, userId: a.ids[1], block: "docks" })).rejects.toThrow("You've used all 6 hits in this war.");
    await testPrisma.wallet.update({ where: { userId: a.ids[2] }, data: { balance: 24_999 } });
    await expect(armHit({ warId: w.id, userId: a.ids[2], block: "docks" })).rejects.toThrow("Insufficient funds.");
    expect(await testPrisma.warHit.count({ where: { warId: w.id } })).toBe(0);
    expect(await testPrisma.warContribution.findFirst({ where: { warId: w.id, userId: a.ids[2] } })).toMatchObject({ hits: 0 });
  });

  it("a correct answer scores +10 attacking or +12 defending; a miss scores 0 and reveals nothing (T10)", async () => {
    const { w, a, d } = await liveWar();
    const atk = await armHit({ warId: w.id, userId: a.ids[0], block: "docks" });
    const def = await armHit({ warId: w.id, userId: d.ids[0], block: "docks" });
    const ok = right(w.seed, "docks", w.startsAt);
    expect(await answerHit({ hitId: atk.hitId, userId: a.ids[0], choice: ok })).toEqual({ correct: true, points: 10, block: "docks" });
    expect(await answerHit({ hitId: def.hitId, userId: d.ids[0], choice: (ok + 1) % 4 })).toEqual({ correct: false, points: 0, block: "docks" });
    expect(await war(w.id)).toMatchObject({ atkDocks: 10, defDocks: 30 });
    expect(await testPrisma.warContribution.findFirst({ where: { userId: a.ids[0] } })).toMatchObject({ correctHits: 1, points: 10 });
    expect((await testPrisma.familyMember.findUnique({ where: { userId: a.ids[0] } }))!.correctHits).toBe(1);
    await expect(answerHit({ hitId: atk.hitId, userId: a.ids[0], choice: ok })).rejects.toThrow("Locked in already.");
    await expect(answerHit({ hitId: def.hitId, userId: a.ids[0], choice: ok })).rejects.toThrow("Not your hit.");
  });

  it("an answer is judged against the arm-time slot (edge 50)", async () => {
    const { w, a } = await liveWar({ started: 24.9 });                    // slot 4 ends in ~6 s
    const armedAt = new Date();
    const h = await armHit({ warId: w.id, userId: a.ids[0], block: "alleys", now: armedAt });
    const later = new Date(+armedAt + 10_000);                            // slot 5
    expect(slotOf(w.startsAt, later)).toBe(5);
    expect((await answerHit({ hitId: h.hitId, userId: a.ids[0], choice: weakPoint(w.seed, "alleys", 4), now: later })).correct).toBe(true);
  });

  it("an answer after the deadline is too late, and the sweeper times it out (edge 47)", async () => {
    const { w, a } = await liveWar();
    const now = new Date();
    const h = await armHit({ warId: w.id, userId: a.ids[0], block: "main", now });
    await expect(answerHit({ hitId: h.hitId, userId: a.ids[0], choice: 0, now: new Date(+now + 21_000) })).rejects.toThrow("Too late.");
    expect(await sweepWarHits(new Date(+now + 21_000))).toBe(1);
    expect((await testPrisma.warHit.findUnique({ where: { id: h.hitId } }))!.state).toBe("TIMEOUT");
  });

  it("stale buttons: scout and hit after the war ended are refused with nothing written (Review Focus 3)", async () => {
    const { w, a } = await liveWar();
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "RESOLVED" } });
    await expect(scoutWar({ warId: w.id, userId: a.ids[0] })).rejects.toThrow("This war is over.");
    await expect(armHit({ warId: w.id, userId: a.ids[0], block: "docks" })).rejects.toThrow("This war is over.");
    expect([await wallet(a.ids[0]), await testPrisma.warContribution.count()]).toEqual([200_000, 0]);
  });

  it("an answer that lands after settlement began scores nothing (T17)", async () => {
    const { w, a } = await liveWar();
    const h = await armHit({ warId: w.id, userId: a.ids[0], block: "docks" });
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "SETTLING" } });
    await expect(answerHit({ hitId: h.hitId, userId: a.ids[0], choice: right(w.seed, "docks", w.startsAt) })).rejects.toThrow("Too late: the war is over.");
    expect((await war(w.id))!.atkDocks).toBe(0);
    expect((await testPrisma.warHit.findUnique({ where: { id: h.hitId } }))!.state).toBe("ARMED");
  });

  it("wrong family, Associates and hot members are refused before any write (edge 45, 51; Review Focus 4)", async () => {
    const { w, a } = await liveWar();
    const outsider = await family(1);
    await expect(armHit({ warId: w.id, userId: outsider.ids[0], block: "docks" })).rejects.toThrow("Not your war.");
    const fresh = await seedEligibleUser({ wallet: 200_000 });
    await testPrisma.familyMember.create({ data: { familyId: a.f.id, userId: fresh, role: "SOLDIER", roleSlot: fresh, seat: 9, joinedAt: new Date() } });
    await expect(scoutWar({ warId: w.id, userId: fresh })).rejects.toThrow(/Not eligible/);
    await testPrisma.user.update({ where: { discordId: a.ids[2] }, data: { crimeHeat: 100 } });
    await expect(armHit({ warId: w.id, userId: a.ids[2], block: "docks" })).rejects.toThrow(/heat/);
    expect(await testPrisma.warContribution.count({ where: { warId: w.id } })).toBe(0);
    expect(await wallet(a.ids[1])).toBe(200_000);
  });

  it("a member's first scout and first hit racing create one contribution row", async () => {
    const { w, a } = await liveWar();
    const rs = await Promise.allSettled([scoutWar({ warId: w.id, userId: a.ids[0] }), armHit({ warId: w.id, userId: a.ids[0], block: "main" })]);
    expect(rs.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await testPrisma.warContribution.count({ where: { warId: w.id, userId: a.ids[0] } })).toBe(1);
  });
});
