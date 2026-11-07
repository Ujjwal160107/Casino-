// test/crimeFamily/league-math.test.ts
import { describe, it, expect } from "vitest";
import { FAMILY_LEVELS, LEAGUE_RACKET_INCOME, RACKETS, TURF_LEAGUES, WAR_RULES, cityLabel, leagueDef, leagueOf, type RacketClass } from "../../src/data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG as C } from "../../src/utils/economyConfig";
import { citiesFor, nextCensusAt, pickPlacementCity, planRebalance, type RebalanceFamily } from "../../src/services/crimeFamily/leagueRules";
import { CF_SCHEDULES } from "../../src/services/crimeFamily/scheduler";

const t = (iso: string) => new Date(iso);
/** n families in one city, placed one minute apart (index 0 oldest). */
const fams = (cityId: string, n: number, movable = true, from = 0): RebalanceFamily[] =>
  Array.from({ length: n }, (_, i) => ({ familyId: `${cityId}-${from + i}`, cityId, placedAt: new Date(Date.UTC(2026, 10, 1, 0, from + i)), movable }));
const sizes = (cities: string[], f: RebalanceFamily[], moves: { familyId: string; to: string }[]) => {
  const at = new Map(f.map((x) => [x.familyId, x.cityId]));
  for (const m of moves) at.set(m.familyId, m.to);
  return cities.map((c) => [...at.values()].filter((v) => v === c).length);
};

describe("leagues (A5, A25, A26)", () => {
  it("maps levels 1–10 onto Bronze, Silver and Gold", () => {
    expect(FAMILY_LEVELS.map((l) => leagueOf(l.level).key)).toEqual(["BRONZE", "BRONZE", "BRONZE", "SILVER", "SILVER", "SILVER", "GOLD", "GOLD", "GOLD", "GOLD"]);
    expect(() => leagueOf(11)).toThrow("Unknown family level 11");
    expect(TURF_LEAGUES.map((l) => [l.cityName, l.crestKey])).toEqual([["Low Town", "crest_1"], ["Midtown", "crest_2"], ["Uptown", "crest_3"]]);
    expect(cityLabel("GOLD", 2)).toBe("Uptown #2");
    expect(() => leagueDef("PLATINUM")).toThrow("Unknown league PLATINUM");
  });

  it("each league's city pays 1.8M / 4.3M / 6.4M a day", () => {
    const cityTotal = (k: keyof typeof LEAGUE_RACKET_INCOME) => RACKETS.reduce((s, r) => s + LEAGUE_RACKET_INCOME[k][r.class as RacketClass], 0);
    expect([cityTotal("BRONZE"), cityTotal("SILVER"), cityTotal("GOLD")]).toEqual([1_800_000, 4_300_000, 6_400_000]);
  });

  it("each league's best holding equals the old maximum at its levels: 300k, 1.3M, 2.6M", () => {
    const best = (lg: (typeof TURF_LEAGUES)[number]) => {
      const cap = FAMILY_LEVELS.find((l) => l.level === lg.maxLevel)!.racketCap;
      const inc = LEAGUE_RACKET_INCOME[lg.key];
      const crowns = Math.min(WAR_RULES.crownCap, cap);
      return crowns * inc.CROWN + (cap - crowns) * Math.max(inc.DISTRICT, inc.CORNER);
    };
    expect(TURF_LEAGUES.map(best)).toEqual([300_000, 1_300_000, 2_600_000]);
  });
});

describe("cities and placement (6.3, 6.4)", () => {
  it.each([[0, 1], [1, 1], [40, 1], [41, 2], [80, 2], [81, 3], [4000, 100]])("citiesFor(%i) = %i", (n, want) => expect(citiesFor(n)).toBe(want));

  it("places into the emptiest city, ties to the lowest number; none when no city is open", () => {
    expect(pickPlacementCity([{ cityId: "a", number: 1, size: 5 }, { cityId: "b", number: 2, size: 3 }, { cityId: "c", number: 3, size: 3 }])?.cityId).toBe("b");
    expect(pickPlacementCity([])).toBeNull();
  });

  it("the next census is the next 00:10 UTC (H8), matching the census cron", () => {
    expect(nextCensusAt(t("2026-11-06T00:05:00Z"))).toEqual(t("2026-11-06T00:10:00Z"));
    expect(nextCensusAt(t("2026-11-06T00:10:00Z"))).toEqual(t("2026-11-07T00:10:00Z"));
    expect(nextCensusAt(t("2026-11-06T13:00:00Z"))).toEqual(t("2026-11-07T00:10:00Z"));
    expect(CF_SCHEDULES.find((s) => s.jobs.some((j) => j.name === "runTurfCensus"))?.cron).toBe("10 * * * *");
  });
});

describe("rebalance (A43, H6)", () => {
  const two = [{ cityId: "u1", number: 1 }, { cityId: "u2", number: 2 }];

  it("41 families in two cities end at 22 / 19, moving the most recently placed", () => {
    const f = [...fams("u1", 40), ...fams("u2", 1, true, 40)];
    const moves = planRebalance(two, f);
    expect(sizes(["u1", "u2"], f, moves)).toEqual([22, 19]);
    expect(moves.map((m) => m.familyId)).toEqual(Array.from({ length: 18 }, (_, i) => `u1-${39 - i}`));
    expect(moves.every((m) => m.from === "u1" && m.to === "u2")).toBe(true);
  });

  it("never moves a family with turf at stake; a full city of them stays full", () => {
    expect(planRebalance(two, [...fams("u1", 30, false), ...fams("u2", 0)])).toEqual([]);
    const f = [...fams("u1", 28, false), ...fams("u1", 2, true, 28)];
    expect(sizes(["u1", "u2"], f, planRebalance(two, f))).toEqual([28, 2]);
  });

  it("stops with every city within ±slack of the average, or with no movable family left above it", () => {
    const three = [...two, { cityId: "u3", number: 3 }];
    for (const [a, b, c] of [[60, 0, 0], [45, 30, 5], [10, 10, 11], [0, 0, 7]]) {
      const f = [...fams("u1", a), ...fams("u2", b, true, 100), ...fams("u3", c, true, 200)];
      const out = sizes(["u1", "u2", "u3"], f, planRebalance(three, f));
      const avg = (a + b + c) / 3;
      expect(out.reduce((s, x) => s + x, 0)).toBe(a + b + c);
      expect(Math.max(...out) - Math.min(...out) < C.cityRebalanceSlack || out.every((x) => Math.abs(x - avg) <= C.cityRebalanceSlack)).toBe(true);
    }
  });

  it("adds the league config keys", () => {
    expect(C).toMatchObject({ familiesPerCity: 40, citySurplusDaysToClose: 14, cityRebalanceSlack: 2 });
  });
});
