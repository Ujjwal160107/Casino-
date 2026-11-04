import { describe, it, expect } from "vitest";
import { patrolChance, resolveCaperOutcome, splitCaperPool, bestRoleBonus, crewEdge, type CaperOutcome } from "../../src/services/crimeFamily/caperMath";
import { caperTier, CAPER_ROLES, type CaperTierDef } from "../../src/data/crimeFamilyCatalog";
import { CRIME_PREP_WHITELIST } from "../../src/data/crimePrepWhitelist";
import { rollUnit } from "../../src/services/crimeFamily/random";

const bonus = (k: string) => CRIME_PREP_WHITELIST.find((p) => p.key === k)!.successBonus;

describe("patrol chance and outcome (8.5)", () => {
  it("computes q with the heat term and the 0.60 cap", () => {
    expect(patrolChance(0.10, 0.10, 0)).toBe(0.09);
    expect(patrolChance(0.10, 0, 69)).toBe(0.238);
    expect(patrolChance(0.25, 0.8 / 6, 39)).toBe(0.294667);
    expect(patrolChance(0.25, 0, 200)).toBe(0.6);
  });
  it.each([[3, 0, "CLEAN"], [3, 1, "MESSY"], [3, 2, "BUST"], [4, 1, "MESSY"], [4, 2, "BUST"], [5, 2, "MESSY"], [5, 3, "BUST"], [6, 2, "MESSY"], [6, 3, "BUST"], [5, 5, "BUST"]] as const)(
    "n=%i with %i misses → %s", (n, misses, want) => expect(resolveCaperOutcome({ n, misses, roll: 0.5, base: 0.1, edge: 0, hottestHeat: 0 })).toBe(want));
  it("a perfect run is MESSY below q and CLEAN at q", () => {
    expect(resolveCaperOutcome({ n: 4, misses: 0, roll: 0.0899, base: 0.1, edge: 0.1, hottestHeat: 0 })).toBe("MESSY");
    expect(resolveCaperOutcome({ n: 4, misses: 0, roll: 0.09, base: 0.1, edge: 0.1, hottestHeat: 0 })).toBe("CLEAN");
  });
  it("rollUnit maps an integer draw to [0, 1) in 1/10,000 steps", () => {
    expect(rollUnit(() => 900)).toBe(0.09);
    expect(rollUnit(() => 9_999)).toBe(0.9999);
  });
});

describe("splitCaperPool (8.6)", () => {
  const all = (n: number) => Array(n).fill(true);
  it.each([
    [1, 3, "CLEAN", 1_050_000, 840_000, 105_000, 280_000], [1, 4, "CLEAN", 1_400_000, 1_120_000, 140_000, 280_000],
    [2, 4, "CLEAN", 2_200_000, 1_760_000, 220_000, 440_000], [2, 5, "CLEAN", 2_750_000, 2_200_000, 275_000, 440_000],
    [3, 5, "CLEAN", 4_250_000, 3_400_000, 425_000, 680_000], [3, 6, "CLEAN", 5_100_000, 4_080_000, 510_000, 680_000],
    [4, 5, "CLEAN", 6_000_000, 4_800_000, 600_000, 960_000], [4, 6, "CLEAN", 7_200_000, 5_760_000, 720_000, 960_000],
    [1, 3, "MESSY", 367_500, 294_000, 36_750, 98_000], [1, 4, "MESSY", 490_000, 392_000, 49_000, 98_000],
    [2, 4, "MESSY", 770_000, 616_000, 77_000, 154_000], [2, 5, "MESSY", 962_500, 770_000, 96_250, 154_000],
    [3, 5, "MESSY", 1_487_500, 1_190_000, 148_750, 238_000], [3, 6, "MESSY", 1_785_000, 1_428_000, 178_500, 238_000],
    [4, 5, "MESSY", 2_100_000, 1_680_000, 210_000, 336_000], [4, 6, "MESSY", 2_520_000, 2_016_000, 252_000, 336_000],
  ] as const)("T%i n=%i %s", (tier, n, outcome, pool, crewShare, vaultCut, cut) => {
    expect(splitCaperPool({ poolPerSeat: caperTier(tier).poolPerSeat, n, outcome, locked: all(n) }))
      .toEqual({ pool, crewShare, vaultCut, cutPerSeat: cut, cuts: Array(n).fill(cut) });
  });
  it("BUST mints nothing; an unlocked seat gets 0; remainders are never minted", () => {
    expect(splitCaperPool({ poolPerSeat: 350_000, n: 3, outcome: "BUST", locked: all(3) }).cuts).toEqual([0, 0, 0]);
    expect(splitCaperPool({ poolPerSeat: 350_000, n: 3, outcome: "MESSY", locked: [true, false, true] }).cuts).toEqual([98_000, 0, 98_000]);
    const odd = splitCaperPool({ poolPerSeat: 100_001, n: 3, outcome: "CLEAN", locked: all(3) });
    expect(odd).toMatchObject({ pool: 300_003, crewShare: 240_002, vaultCut: 30_000, cutPerSeat: 80_000 });
    expect(odd.cuts.reduce((a, b) => a + b, 0) + odd.vaultCut).toBeLessThanOrEqual(Math.floor(odd.pool * 0.9));
  });
});

describe("edge (8.2)", () => {
  const extremes = (pick: (xs: number[]) => number) => CAPER_ROLES.map((r) => pick(r.prepKeys.map(bonus)));
  it("best owned bonus per role; none owned → 0", () => {
    expect(bestRoleBonus("SAFECRACKER", new Set(["thief_gloves", "cheat_sheet", "iron_rifle"]))).toBe(0.13);
    expect(bestRoleBonus("DRIVER", new Set(["thief_gloves"]))).toBe(0);
  });
  it("matches the spec's weakest and best crew edges", () => {
    const lo = extremes((x) => Math.min(...x)); const hi = extremes((x) => Math.max(...x));
    expect(crewEdge(lo.slice(0, 3))).toBeCloseTo(0.0733, 4);
    expect(crewEdge(lo)).toBeCloseTo(0.08, 10);
    expect([3, 4, 5, 6].map((n) => +crewEdge(hi.slice(0, n)).toFixed(4))).toEqual([0.1333, 0.13, 0.132, 0.1333]);
    expect(crewEdge([])).toBe(0);
  });
});

// C12: the 8.10 tables, recomputed from the catalog. A config change fails here and forces a docs update.
function caperEv(t: CaperTierDef, n: number, p: number, edge: number) {
  const choose = (k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const q = patrolChance(t.patrolBase, edge, 0);
  const bustAt = n <= 4 ? 2 : 3;
  let pMessy = Math.pow(p, n) * q, pBust = 0;
  for (let k = 1; k <= n; k++) { const pk = choose(k) * Math.pow(1 - p, k) * Math.pow(p, n - k); if (k >= bustAt) pBust += pk; else pMessy += pk; }
  const pClean = Math.pow(p, n) * (1 - q);
  const split = (o: CaperOutcome) => splitCaperPool({ poolPerSeat: t.poolPerSeat, n, outcome: o, locked: Array(n).fill(true) });
  const gross = split("CLEAN").cutPerSeat * pClean + split("MESSY").cutPerSeat * pMessy;
  const fine = t.bustFine * pBust;
  const net = gross - t.stake - fine;
  return [`${(pClean * 100).toFixed(2)}%`, `${(pMessy * 100).toFixed(2)}%`, `${(pBust * 100).toFixed(2)}%`, Math.round(gross), Math.round(fine), Math.round(net), Math.round(2 * net),
    Math.round(split("CLEAN").vaultCut * pClean + split("MESSY").vaultCut * pMessy)];
}

describe("expected value (8.10)", () => {
  it("realistic play, p = 0.90, edge 0.10", () => {
    expect([[1, 3], [1, 4], [2, 4], [2, 5], [3, 5], [3, 6], [4, 5], [4, 6]].map(([t, n]) => caperEv(caperTier(t), n, 0.9, 0.1))).toEqual([
      ["66.34%", "30.86%", "2.80%", 215_993, 4_200, 161_793, 323_586, 80_997],
      ["59.71%", "35.06%", "5.23%", 201_538, 7_845, 143_693, 287_386, 100_769],
      ["56.75%", "38.02%", "5.23%", 308_258, 15_690, 192_568, 385_137, 154_129],
      ["51.08%", "48.07%", "0.86%", 298_763, 2_568, 196_195, 392_390, 186_727],
      ["48.42%", "50.72%", "0.86%", 449_980, 4_280, 270_700, 541_400, 281_237],
      ["43.58%", "54.84%", "1.58%", 426_843, 7_925, 243_918, 487_836, 320_132],
      ["45.76%", "53.38%", "0.86%", 618_685, 6_420, 312_265, 624_530, 386_678],
      ["41.19%", "57.23%", "1.58%", 587_679, 11_887, 275_792, 551_584, 440_759],
    ]);
  });
  it("strong crew, p = 0.95: net per caper", () => {
    expect([[1, 4], [2, 5], [3, 6], [4, 6]].map(([t, n]) => caperEv(caperTier(t), n, 0.95, 0.1)[5])).toEqual([179_422, 244_900, 327_781, 389_069]);
  });
  it("perfect play stays at or under 1,200,000/day per account including the payday cap (D50, 11.4)", () => {
    expect([[1, 3], [2, 5], [3, 6], [4, 6]].map(([t, n]) => caperEv(caperTier(t), n, 1, 0.1)[6])).toEqual([427_240, 602_780, 850_880, 1_039_200]);
    const worst = caperEv(caperTier(4), 6, 1, 0.8 / 6)[6] as number;
    expect(worst).toBe(1_049_600);
    expect(worst + Math.floor((1_000_000 * 0.95) / 7)).toBeLessThanOrEqual(1_200_000);
  });
});
