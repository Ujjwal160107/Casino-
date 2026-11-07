import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { ensureCity, seedCityRackets, seedTurf } from "../../src/services/crimeFamily/turfCities";
import { openWarPeriods } from "../../src/services/crimeFamily/warService";
import { getTurfMapView, viewerCity } from "../../src/services/crimeFamily/turfQueries";
import { nextWarStart } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import { testPrisma, seedEligibleUser, seedFamily, seedTurfCity, resetFamilies, ensureUniqueIndexes } from "../helpers";

const H = 3600_000;
beforeAll(() => ensureUniqueIndexes(["TurfCity", "Racket", "War", "Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("seedTurf (amendment 6.3, Appendix B)", () => {
  it("creates city #1 of each league with its 10 rackets at the league's income, all with the Street", async () => {
    await seedTurf();
    const cities = await testPrisma.turfCity.findMany({ orderBy: { league: "asc" } });
    expect(cities.map((c) => [c.league, c.number, c.status])).toEqual([["BRONZE", 1, "OPEN"], ["GOLD", 1, "OPEN"], ["SILVER", 1, "OPEN"]]);
    for (const [league, total] of [["BRONZE", 1_800_000], ["SILVER", 4_300_000], ["GOLD", 6_400_000]] as const) {
      const city = cities.find((c) => c.league === league)!;
      const rows = await testPrisma.racket.findMany({ where: { cityId: city.id } });
      expect(rows).toHaveLength(10);
      expect(rows.reduce((s, r) => s + r.incomePerCycle, 0)).toBe(total);
      expect(rows.every((r) => r.league === league && r.ownerFamilyId === "" && r.openedPeriodKey === "")).toBe(true);
    }
  });

  it("a rerun (twice at once) updates definitions but never ownership, timers, strikes or the opened period", async () => {
    await seedTurf();
    const gold = await testPrisma.turfCity.findUniqueOrThrow({ where: { league_number: { league: "GOLD", number: 1 } } });
    const when = new Date("2026-10-01T00:00:00Z");
    const where = { cityId_key: { cityId: gold.id, key: "pawn_row" } };
    await testPrisma.racket.update({ where, data: { ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2, openedPeriodKey: "2026-W40", name: "Old Name", incomePerCycle: 1 } });
    await Promise.all([seedTurf(), seedTurf()]);
    expect(await testPrisma.racket.count()).toBe(30);
    expect(await testPrisma.racket.findUnique({ where })).toMatchObject({
      name: "Pawn Row Fencing", incomePerCycle: 300_000, ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2, openedPeriodKey: "2026-W40",
    });
  });

  it("ensureCity twice at once makes one city with one set of rackets", async () => {
    await Promise.all([ensureCity("SILVER", 2), ensureCity("SILVER", 2)]);
    const c = await testPrisma.turfCity.findMany({ where: { league: "SILVER", number: 2 } });
    expect(c).toHaveLength(1);
    expect(await testPrisma.racket.count({ where: { cityId: c[0].id } })).toBe(10);
  });
});

describe("openWarPeriods per city (6.7)", () => {
  it("opens each racket's war once per week in every OPEN city and none in a CLOSED one", async () => {
    await seedTurf();
    const closed = await seedTurfCity({ league: "GOLD", number: 2, status: "CLOSED" });
    await seedCityRackets(closed);
    const valet = racketDef("valet_racket")!;
    const inWindow = new Date(+nextWarStart(valet, new Date(Date.now() + 73 * H)) - 48 * H);
    // Call through (a bare spyOn on Prisma's model proxy returns undefined), and put the original back after.
    const original = prisma.war.upsert;
    const real = original.bind(prisma.war);
    const upsert = vi.spyOn(prisma.war, "upsert").mockImplementation(((args: any) => real(args)) as any);
    try {
      await openWarPeriods(inWindow);
      const valetUpserts = upsert.mock.calls.filter(([a]) => a.create.racketKey === "valet_racket").length;
      expect(valetUpserts).toBe(3);
      await openWarPeriods(new Date(+inWindow + 60_000));
      expect(upsert.mock.calls.filter(([a]) => a.create.racketKey === "valet_racket").length).toBe(3);   // second tick writes nothing
    } finally {
      upsert.mockRestore();
      Object.assign(prisma.war, { upsert: original });   // mockRestore writes undefined back on Prisma's model proxy
    }
    const wars = await testPrisma.war.findMany({ where: { racketKey: "valet_racket" } });
    expect(wars).toHaveLength(3);
    expect(wars.some((w) => w.cityId === closed.id)).toBe(false);
    const rows = await testPrisma.racket.findMany({ where: { key: "valet_racket", cityId: { not: closed.id } } });
    expect(rows.every((r) => r.openedPeriodKey === wars[0].periodKey)).toBe(true);
  });
});

describe("the viewer's city (H10)", () => {
  it("a placed family sees its city; an unplaced one the city it would join; a non-member Low Town #1", async () => {
    await seedTurf();
    const s2 = await ensureCity("SILVER", 2);
    const placed = await seedEligibleUser(); const unplaced = await seedEligibleUser(); const stranger = await seedEligibleUser();
    await seedFamily({ bossId: placed, level: 5, data: { cityId: s2.id, activeMembers: 3 } });
    for (let k = 0; k < 2; k++) await seedFamily({ bossId: await seedEligibleUser(), level: 4, data: { cityId: (await testPrisma.turfCity.findFirstOrThrow({ where: { league: "SILVER", number: 1 } })).id, activeMembers: 3 } });
    await seedFamily({ bossId: unplaced, level: 6 });
    expect(await viewerCity(placed)).toMatchObject({ placed: true, city: { id: s2.id, label: "Midtown #2" } });
    expect(await viewerCity(unplaced)).toMatchObject({ placed: false, city: { id: s2.id } });   // #2 holds 1 active family, #1 holds 2
    expect(await viewerCity(stranger)).toMatchObject({ placed: false, family: null, city: { league: "BRONZE", number: 1, label: "Low Town #1" } });
    const view = await getTurfMapView(stranger, null, new Date());
    expect(view.city.label).toBe("Low Town #1");
    expect(view.rackets.map((r) => r.income)).toEqual(view.rackets.map((r) => ({ CORNER: 100_000, DISTRICT: 200_000, CROWN: 300_000 })[r.class]));
  });
});
