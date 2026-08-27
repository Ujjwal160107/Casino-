import { describe, it, expect } from "vitest";
import {
  RIFLE_TIERS,
  MAX_RARE_WEIGHT,
  MAX_LEGENDARY_WEIGHT,
  applyHuntBuffs,
  AnimalRarity,
} from "../../src/utils/animalCatalog";

const RARITIES: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

describe("rifle tiers", () => {
  it("every tier's weights sum to 1", () => {
    for (const [name, tier] of Object.entries(RIFLE_TIERS)) {
      const sum = RARITIES.reduce((s, r) => s + tier.weights[r], 0);
      expect(sum, `${name} weights`).toBeCloseTo(1, 10);
    }
  });

  it("only the legendary rifle can roll a Legendary", () => {
    expect(RIFLE_TIERS["wooden rifle"].weights.Legendary).toBe(0);
    expect(RIFLE_TIERS["iron rifle"].weights.Legendary).toBe(0);
    expect(RIFLE_TIERS["sniper rifle"].weights.Legendary).toBe(0);
    expect(RIFLE_TIERS["legendary rifle"].weights.Legendary).toBe(0.02);
  });

  it("iron stays at one roll so the sniper's second roll is the upgrade", () => {
    expect(RIFLE_TIERS["iron rifle"].maxRolls).toBe(1);
    expect(RIFLE_TIERS["sniper rifle"].maxRolls).toBe(2);
    expect(RIFLE_TIERS["legendary rifle"].maxRolls).toBe(2);
  });
});

describe("applyHuntBuffs", () => {
  const base = RIFLE_TIERS["legendary rifle"].weights;

  it("returns the base weights when nothing is active", () => {
    expect(applyHuntBuffs(base, {})).toEqual(base);
  });

  it("caps Legendary at 5% with every buff stacked", () => {
    const out = applyHuntBuffs(base, {
      camouflage: true,
      compass: "risky",
      rareBonus: 0.06,
      legendaryBonus: 0.02,
    });
    expect(out.Legendary).toBeLessThanOrEqual(MAX_LEGENDARY_WEIGHT);
    expect(out.Legendary).toBe(MAX_LEGENDARY_WEIGHT);
  });

  it("caps Rare at 20% with every buff stacked", () => {
    const out = applyHuntBuffs(base, {
      camouflage: true,
      compass: "risky",
      rareBonus: 0.06,
      legendaryBonus: 0.02,
    });
    expect(out.Rare).toBe(MAX_RARE_WEIGHT);
  });

  it("never produces a negative Common weight", () => {
    const out = applyHuntBuffs(base, { camouflage: true, compass: "risky", rareBonus: 0.5, legendaryBonus: 0.5 });
    expect(out.Common).toBeGreaterThanOrEqual(0);
  });

  it("safe compass shifts Common into Uncommon only", () => {
    const out = applyHuntBuffs(base, { compass: "safe" });
    expect(out.Uncommon).toBeCloseTo(base.Uncommon + 0.15, 10);
    expect(out.Legendary).toBe(base.Legendary);
  });
});
