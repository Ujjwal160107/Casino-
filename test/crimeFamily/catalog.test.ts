import { describe, it, expect } from "vitest";
import { CRIME_FAMILY_CONFIG, isCrimeFamilyOpen } from "../../src/utils/economyConfig";
import * as C from "../../src/data/crimeFamilyCatalog";
import { CRIME_PREP_WHITELIST } from "../../src/data/crimePrepWhitelist";
import { SHOP_CATALOG } from "../../src/utils/shopCatalog";
import { withCfConfig } from "../helpers";

describe("crime family catalog", () => {
  it("partitions the 25 prep items across the six roles exactly once (8.2)", () => {
    const keys = C.CAPER_ROLES.flatMap((r) => r.prepKeys);
    expect(keys).toHaveLength(25);
    expect(new Set(keys)).toEqual(new Set(CRIME_PREP_WHITELIST.map((p) => p.key)));
    const consumable = new Set(SHOP_CATALOG.filter((i) => i.consumable).map((i) => i.key));
    for (const r of C.CAPER_ROLES) expect(r.prepKeys.some((k) => !consumable.has(k)), r.key).toBe(true);
  });

  it("orders roles and label pools as 8.2/8.3", () => {
    expect(C.CAPER_ROLES.map((r) => r.key)).toEqual(["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"]);
    for (const r of C.CAPER_ROLES) expect(new Set(r.labels).size).toBe(6);
    expect(C.caperRole("DRIVER").labels).toEqual(["Harbor Bypass", "Canal Street", "Old Rail Road", "Market Alley", "Bridge Ramp", "Tunnel 9"]);
    expect(C.caperRole("MUSCLE").prepKeys).toEqual(["wooden_rifle", "iron_rifle", "sniper_rifle", "wolf_fang_dagger"]);
  });

  it("pins the tier table (8.1)", () => {
    expect(C.CAPER_TIERS.map((t) => [t.key, t.levelToPlan, t.crewMin, t.crewMax, t.poolPerSeat, t.stake, t.bustFine, t.heatCeiling, t.patrolBase])).toEqual([
      ["pawnshop", 1, 3, 4, 350_000, 50_000, 150_000, 70, 0.10],
      ["payroll", 3, 4, 5, 550_000, 100_000, 300_000, 60, 0.15],
      ["racetrack", 5, 5, 6, 850_000, 175_000, 500_000, 50, 0.20],
      ["diamond", 8, 5, 6, 1_200_000, 300_000, 750_000, 40, 0.25],
    ]);
    expect(C.CAPER_TIERS.map((t) => t.jail)).toEqual([null, { chance: 0.2, seconds: 1200 }, { chance: 0.35, seconds: 2700 }, { chance: 0.5, seconds: 3600 }]);
    expect(C.CAPER_TIERS.map((t) => t.seatGate)).toEqual([
      { shifts: 20, fortunaAgeDays: 14, netWorth: 2_000_000 }, { shifts: 60, fortunaAgeDays: 30, netWorth: 8_000_000 },
      { shifts: 150, fortunaAgeDays: 30, netWorth: 20_000_000 }, { shifts: 300, fortunaAgeDays: 45, netWorth: 40_000_000 },
    ]);
    expect(C.CAPER_TIERS.map((t) => [t.heat.clean, t.heat.messy, t.heat.bust, t.xp.clean, t.xp.messy, t.xp.bust])).toEqual([
      [20, 30, 40, 150, 60, 20], [25, 35, 45, 225, 90, 30], [30, 40, 50, 300, 120, 40], [40, 50, 60, 375, 150, 50],
    ]);
    expect(C.CAPER_TIERS.map((t) => [t.required.length, t.optional])).toEqual([[3, "DRIVER"], [4, "MUSCLE"], [5, "HACKER"], [5, "HACKER"]]);
  });

  it("pins rackets (9.1): 10 rackets, 6,400,000 a day", () => {
    expect(C.RACKETS.reduce((s, r) => s + r.incomePerCycle, 0)).toBe(6_400_000);
    expect(C.RACKETS.map((r) => [r.key, r.class, r.warDow, r.warHourUtc])).toEqual([
      ["docks_numbers", "CORNER", 1, 18], ["laundromat_front", "CORNER", 2, 12], ["harbor_customs", "DISTRICT", 2, 18],
      ["neon_strip", "DISTRICT", 3, 1], ["valet_racket", "CORNER", 3, 18], ["pawn_row", "CORNER", 4, 1],
      ["union_kickbacks", "DISTRICT", 4, 18], ["racetrack_book", "DISTRICT", 5, 12], ["casino_row", "CROWN", 6, 18], ["city_hall", "CROWN", 0, 12],
    ]);
    expect(C.RACKET_CLASSES.CROWN).toMatchObject({ baseline: 80, minFamilyLevel: 7, xpMultiplier: 2 });
  });

  it("pins levels (10.1): fees L2..L10 total 172,000,000", () => {
    expect(C.FAMILY_LEVELS.map((l) => l.xpToReach)).toEqual([0, 1000, 3000, 6000, 10000, 16000, 24000, 34000, 46000, 60000]);
    expect(C.FAMILY_LEVELS.reduce((s, l) => s + l.fee, 0)).toBe(172_000_000);
    expect(C.FAMILY_LEVELS.map((l) => l.memberCap)).toEqual([10, 12, 14, 16, 18, 20, 23, 25, 28, 30]);
    expect(C.FAMILY_LEVELS.map((l) => l.racketCap)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    expect(C.FAMILY_LEVELS.map((l) => l.caperCooldownSeconds)).toEqual([10800, 10800, 10800, 9900, 9900, 9000, 9000, 9000, 7200, 7200]);
    expect(C.FAMILY_LEVELS.map((l) => l.tierUnlocked)).toEqual([1, null, 2, null, 3, null, null, 4, null, null]);
    expect(C.levelDef(10).crestKey).toBe("crest_4");
  });

  it.each([
    ["found", { discordAgeDays: 180, fortunaAgeDays: 30, shifts: 60, netWorth: 15_000_000, tenureSeconds: null, heatBelow: 70, notJailed: true, notInFamily: true, activeMember: false, hop: "found", prepItem: false }],
    ["family_join", { discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: 1_000_000, tenureSeconds: null, heatBelow: null, notJailed: true, notInFamily: false, activeMember: false, hop: "join", prepItem: false }],
    ["caper_t4", { discordAgeDays: 90, fortunaAgeDays: 45, shifts: 300, netWorth: 40_000_000, tenureSeconds: 259_200, heatBelow: 40, notJailed: true, notInFamily: false, activeMember: false, hop: null, prepItem: true }],
    ["war", { discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: null, tenureSeconds: 259_200, heatBelow: 100, notJailed: true, notInFamily: false, activeMember: false, hop: null, prepItem: false }],
    ["racket", { discordAgeDays: 90, fortunaAgeDays: null, shifts: 20, netWorth: null, tenureSeconds: 259_200, heatBelow: null, notJailed: false, notInFamily: false, activeMember: true, hop: null, prepItem: false }],
    ["payday", { discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: null, tenureSeconds: 604_800, heatBelow: null, notJailed: false, notInFamily: false, activeMember: true, hop: null, prepItem: false }],
  ] as const)("gate %s matches 12.1", (gate, def) => {
    expect(C.ELIGIBILITY_GATES[gate]).toEqual(def);
  });

  it("pins the config numbers the families layer uses", () => {
    expect(CRIME_FAMILY_CONFIG).toMatchObject({ enabled: false, turfEnabled: false, allowGuildIds: null, createFee: 10_000_000, renameFee: 2_000_000, duesPerLevel: 40_000, depositMin: 10_000, depositDailyCap: 25_000_000, vaultTaxRate: 0.05, paydayMinEarnings: 500_000, paydayGrossCap: 1_000_000 });
  });

  it("opens only when enabled and the guild is allowed", async () => {
    expect(isCrimeFamilyOpen("g1")).toBe(false);
    await withCfConfig({ enabled: true }, async () => {
      expect(isCrimeFamilyOpen("g1")).toBe(true);
    });
    await withCfConfig({ enabled: true, allowGuildIds: ["g1"] }, async () => {
      expect(isCrimeFamilyOpen("g1")).toBe(true);
      expect(isCrimeFamilyOpen("g2")).toBe(false);
    });
  });

  it("A20: a DM press follows enabled; allowGuildIds limits only servers", async () => {
    expect(isCrimeFamilyOpen(null)).toBe(false); // enabled false by default in tests
    await withCfConfig({ enabled: true, allowGuildIds: ["g1"] }, async () => {
      expect(isCrimeFamilyOpen(null)).toBe(true);
      expect(isCrimeFamilyOpen(undefined)).toBe(true);
      expect(isCrimeFamilyOpen("g2")).toBe(false);
    });
    expect(Object.values(C.ELIGIBILITY_GATES).some((g) => "guild" in g)).toBe(false);
  });
});
