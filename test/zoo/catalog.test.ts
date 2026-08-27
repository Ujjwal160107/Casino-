import { describe, it, expect } from "vitest";
import {
  ZOO_TIERS,
  ZOO_CAPACITY,
  RARITY_STACK_LIMIT,
  RARITY_INCOME_PER_DAY,
  RARITY_FEED_COST,
  RARITY_FEED_KEY,
  AnimalRarity,
} from "../../src/utils/animalCatalog";

const RARITIES: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

function headcount(tierKey: keyof typeof ZOO_TIERS): number {
  const tier = ZOO_TIERS[tierKey];
  return RARITIES.reduce((sum, r) => sum + tier.mix[r] * RARITY_STACK_LIMIT[r], 0);
}

function grossPerDay(tierKey: keyof typeof ZOO_TIERS): number {
  const tier = ZOO_TIERS[tierKey];
  return RARITIES.reduce((sum, r) => sum + tier.mix[r] * RARITY_STACK_LIMIT[r] * RARITY_INCOME_PER_DAY[r], 0);
}

function feedPerDay(tierKey: keyof typeof ZOO_TIERS): number {
  const tier = ZOO_TIERS[tierKey];
  return RARITIES.reduce((sum, r) => sum + tier.mix[r] * RARITY_STACK_LIMIT[r] * RARITY_FEED_COST[r], 0);
}

describe("zoo tiers", () => {
  it("each tier's rarity mix sums to its type cap", () => {
    for (const key of Object.keys(ZOO_TIERS) as (keyof typeof ZOO_TIERS)[]) {
      const tier = ZOO_TIERS[key];
      const sum = RARITIES.reduce((s, r) => s + tier.mix[r], 0);
      expect(sum, `${key} mix must sum to types`).toBe(tier.types);
    }
  });

  it("only the World Zoo can house a Legendary", () => {
    expect(ZOO_TIERS.mini_zoo.mix.Legendary).toBe(0);
    expect(ZOO_TIERS.city_zoo.mix.Legendary).toBe(0);
    expect(ZOO_TIERS.world_zoo.mix.Legendary).toBe(1);
  });

  it("max headcount matches the spec", () => {
    expect(headcount("mini_zoo")).toBe(18);
    expect(headcount("city_zoo")).toBe(34);
    expect(headcount("world_zoo")).toBe(38);
  });

  it("gross daily income matches the spec", () => {
    expect(grossPerDay("mini_zoo")).toBe(144_000);
    expect(grossPerDay("city_zoo")).toBe(616_000);
    expect(grossPerDay("world_zoo")).toBe(996_000);
  });

  it("daily feed bill matches the spec", () => {
    expect(feedPerDay("mini_zoo")).toBe(54_000);
    expect(feedPerDay("city_zoo")).toBe(228_000);
    expect(feedPerDay("world_zoo")).toBe(369_000);
  });

  it("net daily income matches the spec", () => {
    expect(grossPerDay("mini_zoo") - feedPerDay("mini_zoo")).toBe(90_000);
    expect(grossPerDay("city_zoo") - feedPerDay("city_zoo")).toBe(388_000);
    expect(grossPerDay("world_zoo") - feedPerDay("world_zoo")).toBe(627_000);
  });

  it("ZOO_CAPACITY stays in sync with the tier type caps", () => {
    expect(ZOO_CAPACITY.mini_zoo).toBe(5);
    expect(ZOO_CAPACITY.city_zoo).toBe(10);
    expect(ZOO_CAPACITY.world_zoo).toBe(12);
  });

  it("every rarity has a feed item key", () => {
    for (const r of RARITIES) {
      expect(RARITY_FEED_KEY[r]).toMatch(/_feed$/);
    }
  });
});
