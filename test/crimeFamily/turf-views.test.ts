import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getTurfMapView, getRacketDetailView, getWarBoardView } from "../../src/services/crimeFamily/turfQueries";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, seedRacket, seedWar, seedContribution } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(async () => { await resetFamilies(); await seedRackets(); });

describe("turf views", () => {
  it("the map lists 10 rackets in catalog order with owners, live bids and the next war", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), name: "Velvet Ante", tag: "VLA" });
    await seedRacket("pawn_row", { ownerFamilyId: f.id });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING", topBid: 2_100_000, topBidderFamilyId: f.id });
    const v = await getTurfMapView(new Date());
    expect(v.rackets.map((r) => r.key)[0]).toBe("docks_numbers");
    expect(v.rackets.find((r) => r.key === "pawn_row")!.ownerLabel).toBe("[VLA] Velvet Ante");
    expect(v.rackets.find((r) => r.key === "city_hall")!.ownerLabel).toBe("the Street");
    expect(v.rackets.find((r) => r.key === "docks_numbers")!.war).toMatchObject({ status: "BIDDING", topBid: 2_100_000, topBidderLabel: "[VLA] Velvet Ante" });
  });

  it("racket detail gives the minimum bid and the viewer's blockers", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss, level: 1, earnings: 9e6 });
    await seedWar({ racketKey: "harbor_customs", status: "BIDDING" });
    expect(await getRacketDetailView("harbor_customs", boss, new Date())).toMatchObject({ floor: 4_550_000, minBid: 4_550_000, canBid: false, blockers: ["District rackets need family level 4."] });
    const other = await seedFamily({ bossId: await seedEligibleUser(), earnings: 9e6 });
    await seedWar({ racketKey: "pawn_row", status: "BIDDING", topBid: 2_100_000, topBidderFamilyId: other.id });
    expect(await getRacketDetailView("pawn_row", boss, new Date())).toMatchObject({ minBid: 2_310_000, canBid: true, blockers: [] });
  });

  it("in the hour after a no-bid war is cancelled, the line says bidding closed and points at next week's window", async () => {
    const now = new Date("2026-11-04T17:30:00Z"); // valet_racket wars Wed 18:00 UTC; bidding closed at 17:00
    await seedWar({ racketKey: "valet_racket", status: "CANCELLED", startsAt: new Date("2026-11-04T18:00:00Z") });
    const { line } = await getRacketDetailView("valet_racket", await seedEligibleUser(), now);
    expect(line).toMatchObject({ war: null, nextWarAt: new Date("2026-11-04T18:00:00Z"), bidding: { phase: "CLOSED", nextOpensAt: new Date("2026-11-08T18:00:00Z") } });
  });

  it("the board view ranks hitters and flags the blackout", async () => {
    const a = await seedFamily({ bossId: await seedEligibleUser() });
    const w = await seedWar({ racketKey: "casino_row", status: "ACTIVE", startsAt: new Date(Date.now() - 51 * 60_000), topBid: 9_100_000, topBidderFamilyId: a.id, defenderFamilyId: "" });
    for (const [i, p] of [10, 30, 20].entries()) await seedContribution({ warId: w.id, familyId: a.id, userId: `u${i}`, side: "ATK", hits: 3, correctHits: p / 10, points: p });
    const v = await getWarBoardView(w.id, new Date());
    expect(v).toMatchObject({ blackout: true, defender: { familyId: "", label: "the Street" }, hits: { atk: 9, def: 0 } });
    expect(v.top.atk.map((t) => t.points)).toEqual([30, 20, 10]);
    expect(v.scores.docks).toEqual({ atk: 0, def: 80 });
  });
});
