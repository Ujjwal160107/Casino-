import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { syncLeagueCities, closeCityIfIdle, placeUnplaced, rebalanceLeague, TURF_CENSUS_STEPS } from "../../src/services/crimeFamily/turfCensus";
import { CENSUS_STEPS, runTurfCensus } from "../../src/services/crimeFamily/census";
import { seedTurf } from "../../src/services/crimeFamily/turfCities";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { getRacketDetailView } from "../../src/services/crimeFamily/turfQueries";
import { nextWarStart } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import {
  testPrisma, seedEligibleUser, seedFamily, seedTurfCity, seedRacket, seedWar, seedWarHits, racketByKey, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig,
} from "../helpers";

const ON = { enabled: true, turfEnabled: true };
const DAY = 86_400_000;
const T0 = new Date("2026-11-10T00:10:00Z");
beforeAll(async () => {
  await ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War", "CfJobRun"]);
  // A fresh test DB has no FamilyLedger collection; parallel bids that each create it inside a transaction abort (P2028).
  await testPrisma.$runCommandRaw({ create: "FamilyLedger" }).catch((err: Error) => {
    if (!/Code: `?48\b|NamespaceExists/.test(String(err?.message))) throw err;
  });
});
beforeEach(async () => { await resetFamilies(); await seedTurf(); });

const city = (league: string, number: number) => testPrisma.turfCity.findUniqueOrThrow({ where: { league_number: { league, number } } });
/** n bare Gold families (activeMembers 3) in cityId ("" = unplaced), placed one minute apart. */
async function gold(n: number, cityId: string, o: { level?: number; from?: number } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(await seedFamily({ bossId: await seedEligibleUser(), level: o.level ?? 8, earnings: 50_000_000,
      data: { cityId, activeMembers: 3, cityPlacedAt: new Date(+T0 - DAY + ((o.from ?? 0) + i) * 60_000) } }));
  }
  return out;
}
/** A family whose 3 members each have 3 correct war hits this week (so plan 4's step counts it active). */
async function liveFamily(level: number) {
  const ids = [await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser()];
  const f = await seedFamily({ bossId: ids[0], level, members: ids.slice(1).map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
  for (const id of ids) await seedWarHits(id, f.id, 3, { createdAt: new Date(+T0 - DAY) });
  return f;
}
const sizesOf = async (league: string) => {
  const open = await testPrisma.turfCity.findMany({ where: { league, status: "OPEN" }, orderBy: { number: "asc" } });
  return Promise.all(open.map((c) => testPrisma.family.count({ where: { cityId: c.id, activeMembers: { gte: 3 } } })));
};

describe("cities per league (6.3, A27)", () => {
  it("the 41st active Gold family opens Uptown #2, is placed there, and the rebalance ends at 22 / 19 (edge 3, H6)", async () => {
    await withCfConfig(ON, async () => {
      await gold(40, (await city("GOLD", 1)).id);
      await gold(1, "", { from: 40 });
      expect(await syncLeagueCities("GOLD", T0)).toMatchObject({ target: 2, opened: [2] });
      expect(await testPrisma.racket.count({ where: { cityId: (await city("GOLD", 2)).id } })).toBe(10);
      expect(await placeUnplaced("GOLD", T0)).toHaveLength(1);
      expect(await sizesOf("GOLD")).toEqual([40, 1]);
      expect(await rebalanceLeague("GOLD", T0)).toHaveLength(18);
      expect(await sizesOf("GOLD")).toEqual([22, 19]);
    });
  });

  it("a city with an owned racket never closes; it closes on the first eligible census after release (edge 4)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      const [owner] = await gold(1, u2.id);
      await seedRacket("pawn_row", { cityId: u2.id, ownerFamilyId: owner.id });
      await gold(29, (await city("GOLD", 1)).id, { from: 1 });
      for (let d = 0; d < 15; d++) expect((await syncLeagueCities("GOLD", new Date(+T0 + d * DAY))).closed).toEqual([]);
      expect(await city("GOLD", 2)).toMatchObject({ status: "OPEN", surplusDays: 15 });
      await testPrisma.racket.updateMany({ where: { cityId: u2.id }, data: { ownerFamilyId: "" } });
      const sync = await syncLeagueCities("GOLD", new Date(+T0 + 15 * DAY));
      expect(sync).toMatchObject({ closed: [2], cleared: [owner.id] });
      expect(await testPrisma.family.count({ where: { cityId: u2.id } })).toBe(0);
      expect(await placeUnplaced("GOLD", new Date(+T0 + 15 * DAY))).toEqual([{ familyId: owner.id, cityId: (await city("GOLD", 1)).id }]);
    });
  });

  it("a family displaced by a closure is re-placed by the cities step and told its new city; first placements stay silent (6.9)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      await testPrisma.turfCity.update({ where: { id: u2.id }, data: { surplusDays: 20 } });
      const [moved] = await gold(1, u2.id);
      await gold(29, (await city("GOLD", 1)).id, { from: 1 });
      await gold(1, "", { from: 30 });                                          // unplaced: placed later, silently
      const cities = TURF_CENSUS_STEPS.find((s) => s.key === "turf_cities")!;
      const notices = (await cities.run(T0)) ?? [];
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ type: "turf", userIds: [moved.bossId] });
      expect(JSON.stringify(notices[0].build(moved.bossId))).toContain("New city");
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: moved.id } })).cityId).toBe((await city("GOLD", 1)).id);
      const placement = TURF_CENSUS_STEPS.find((s) => s.key === "turf_placement")!;
      expect((await placement.run(T0)) ?? []).toEqual([]);
      expect(await testPrisma.family.count({ where: { cityId: "", level: 8 } })).toBe(0);
    });
  });

  it("surplus counts once per UTC day and resets when the league needs its cities again (H12)", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "SILVER", number: 2 });
      await syncLeagueCities("SILVER", T0); await syncLeagueCities("SILVER", new Date(+T0 + 3_600_000));
      expect((await city("SILVER", 2)).surplusDays).toBe(1);
      await withCfConfig({ familiesPerCity: 1 }, async () => {
        await seedFamily({ bossId: await seedEligibleUser(), level: 5, data: { activeMembers: 3 } });
        await seedFamily({ bossId: await seedEligibleUser(), level: 5, data: { activeMembers: 3 } });
        await syncLeagueCities("SILVER", new Date(+T0 + DAY));
      });
      expect((await city("SILVER", 2)).surplusDays).toBe(0);
    });
  });

  it("a bid racing a closure: either the bid stands and the city stays open, or the city closes and the bid is refused (edge 5)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      const [f] = await gold(1, u2.id, { level: 7 });
      await testPrisma.familyMember.updateMany({ where: { familyId: f.id }, data: { joinedAt: daysAgo(10) } });
      const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: u2.id });
      const [closed, bid] = await Promise.allSettled([closeCityIfIdle(u2.id, new Date()), placeBid({ racketId: w.racketId, actorId: f.bossId, amount: 2_100_000 })]);
      const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
      const c = await testPrisma.turfCity.findUniqueOrThrow({ where: { id: u2.id } });
      if (bid.status === "fulfilled") expect([c.status, war.status, war.topBidderFamilyId, (closed as PromiseFulfilledResult<{ closed: boolean }>).value.closed]).toEqual(["OPEN", "BIDDING", f.id, false]);
      else expect([c.status, war.status, war.topBid]).toEqual(["CLOSED", "CANCELLED", 0]);
    });
  });

  it("a reopened city's racket says bidding is closed this week and refuses bids (Review Focus 5, H16)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      const [f] = await gold(1, u2.id, { level: 7 });
      const startsAt = nextWarStart(racketDef("docks_numbers")!, new Date(Date.now() + 73 * 3_600_000));   // on the real schedule
      const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: u2.id, startsAt });
      expect(await closeCityIfIdle(u2.id, new Date())).toMatchObject({ closed: true, cleared: [f.id] });
      await testPrisma.turfCity.update({ where: { id: u2.id }, data: { status: "OPEN" } });
      await testPrisma.family.update({ where: { id: f.id }, data: { cityId: u2.id } });
      const view = await getRacketDetailView(w.racketId, f.bossId, new Date(+startsAt - 48 * 3_600_000));   // inside the window
      expect(view.line.bidding.phase).toBe("CLOSED");
      await expect(placeBid({ racketId: w.racketId, actorId: f.bossId, amount: 2_100_000 })).rejects.toThrow("Bidding is not open for this racket.");
    });
  });
});

describe("placement and rebalance (6.4)", () => {
  it("a double placement run places each family once and the rebalance evens it out", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "GOLD", number: 2 });
      await gold(8, "");
      await Promise.all([placeUnplaced("GOLD", T0), placeUnplaced("GOLD", T0)]);
      expect(await testPrisma.family.count({ where: { cityId: "" } })).toBe(0);
      await rebalanceLeague("GOLD", T0);
      const s = await sizesOf("GOLD");
      expect(s.reduce((a, b) => a + b, 0)).toBe(8);
      expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(2);
    });
  });

  it("never moves a family holding a racket or a top bid", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "GOLD", number: 2 });
      const fams = await gold(6, (await city("GOLD", 1)).id);
      await seedRacket("casino_row", { ownerFamilyId: fams[5].id });
      await seedWar({ racketKey: "city_hall", status: "BIDDING", topBid: 9_100_000, topBidderFamilyId: fams[4].id });
      const moved = (await rebalanceLeague("GOLD", T0)).map((m) => m.familyId);
      expect(moved).not.toContain(fams[5].id); expect(moved).not.toContain(fams[4].id);
      expect(moved.length).toBeGreaterThan(0);
    });
  });

  it("a movable family that wins a top bid while its move is planned is either moved (bid refused) or keeps the bid (edge 12)", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "GOLD", number: 2 });
      const fams = await gold(5, (await city("GOLD", 1)).id);
      const f = fams[4];                                                         // most recently placed: the one move
      await testPrisma.familyMember.updateMany({ where: { familyId: f.id }, data: { joinedAt: daysAgo(10) } });
      const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      const [moves, bid] = await Promise.allSettled([rebalanceLeague("GOLD", T0), placeBid({ racketId: w.racketId, actorId: f.bossId, amount: 2_100_000 })]);
      const now = await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } });
      const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
      if (bid.status === "fulfilled") expect([now.cityId, war.topBidderFamilyId]).toEqual([(await city("GOLD", 1)).id, f.id]);
      else expect([now.cityId, war.topBid, now.earnings]).toEqual([(await city("GOLD", 2)).id, 0, 50_000_000]);
      expect(moves.status).toBe("fulfilled");
    });
  });

  it("10 parallel bids on the 10 rackets of one city all commit: placement never makes the city a hot spot", async () => {
    await withCfConfig(ON, async () => {
      const fams = await gold(10, (await city("GOLD", 1)).id, { level: 7 });
      for (const f of fams) await testPrisma.familyMember.updateMany({ where: { familyId: f.id }, data: { joinedAt: daysAgo(10) } });
      const keys = ["docks_numbers", "laundromat_front", "harbor_customs", "neon_strip", "valet_racket", "pawn_row", "union_kickbacks", "racetrack_book", "casino_row", "city_hall"];
      const wars = await Promise.all(keys.map((k) => seedWar({ racketKey: k, status: "BIDDING" })));
      const rs = await Promise.allSettled(wars.map((w, i) => placeBid({ racketId: w.racketId, actorId: fams[i].bossId, amount: 9_100_000 })));
      expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    });
  });
});

describe("the census runs the turf steps once a day (6.4 steps 1–5)", () => {
  it("turf off: activeMembers are counted but no city, placement or move happens (Review Focus 4); turf on: the next day places", async () => {
    await withCfConfig({ enabled: true, turfEnabled: false, familiesPerCity: 1 }, async () => {
      const a = await liveFamily(2); const b = await liveFamily(3);
      expect((await runTurfCensus(T0)).status).toBe("ran");
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: a.id } })).activeMembers).toBe(3);
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE" } })).toBe(1);
      expect(await testPrisma.family.count({ where: { id: { in: [a.id, b.id] }, cityId: { not: "" } } })).toBe(0);
    });
    await withCfConfig({ ...ON, familiesPerCity: 1 }, async () => {
      expect((await runTurfCensus(new Date(+T0 + DAY))).status).toBe("ran");
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE", status: "OPEN" } })).toBe(2);
      expect(await sizesOf("BRONZE")).toEqual([1, 1]);
      expect((await runTurfCensus(new Date(+T0 + DAY + 3_600_000))).status).toBe("skipped");   // edge 1
    });
  });

  it("a crash after a city opened reruns next hour: the city is found, not doubled, and placement finishes (edge 2)", async () => {
    await withCfConfig({ ...ON, familiesPerCity: 1 }, async () => {
      await liveFamily(1); await liveFamily(1);
      const boom = { key: "boom", run: async () => { throw new Error("crash"); } };
      CENSUS_STEPS.splice(2, 0, boom);                                           // after turf_cities, before placement
      await expect(runTurfCensus(T0)).rejects.toThrow("crash");
      CENSUS_STEPS.splice(CENSUS_STEPS.indexOf(boom), 1);
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE" } })).toBe(2);
      expect((await runTurfCensus(new Date(+T0 + 3_600_000))).status).toBe("ran");
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE" } })).toBe(2);
      expect(await sizesOf("BRONZE")).toEqual([1, 1]);
    });
  });

  it("a rebalance move DMs every member of the moved family through the census notices", async () => {
    await withCfConfig({ ...ON, familiesPerCity: 2 }, async () => {
      const fams = [];
      for (let i = 0; i < 5; i++) fams.push(await liveFamily(8));
      const u1 = await city("GOLD", 1);
      for (const f of fams) await testPrisma.family.update({ where: { id: f.id }, data: { cityId: u1.id } });
      const { notices } = await runTurfCensus(T0);
      expect(await sizesOf("GOLD")).toEqual([3, 1, 1]);                          // 3 cities; 5 → 4 → 3, then the ±2 rule stops
      expect(notices.filter((n) => n.type === "turf")).toHaveLength(2);
      expect(notices.every((n) => n.userIds.length === 3)).toBe(true);
    });
  });
});
