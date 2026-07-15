import assert from "node:assert/strict";
import { CRIME_CATALOG } from "../data/crimeCatalog";
import { TAX_CONFIG } from "../utils/economyConfig";

const expectedHeatByTier = {
  petty: 16,
  medium: 20,
  high: 26,
  elite: 32,
  legendary: 40,
} as const;

for (const [tier, expectedHeat] of Object.entries(expectedHeatByTier)) {
  const crime = CRIME_CATALOG.find((entry) => entry.tier === tier);
  assert.ok(crime, `A ${tier} crime exists.`);
  assert.equal(
    Math.round(TAX_CONFIG.crimeHeatGain * crime.heatMultiplier),
    expectedHeat,
    `${tier} crime heat matches the designed progression.`,
  );
}

assert.equal(TAX_CONFIG.heatDecayPerHour, 10);
assert.equal(TAX_CONFIG.layLowHeatReduction, 15);
assert.equal(TAX_CONFIG.layLowCooldownSeconds, 6 * 60 * 60);
assert.equal(TAX_CONFIG.fixerHeatReduction, 35);
assert.equal(TAX_CONFIG.fixerCooldownSeconds, 12 * 60 * 60);
assert.equal(TAX_CONFIG.fixerMinimumHeat, 40);
assert.equal(TAX_CONFIG.robSuccessHeatGain, 15);
assert.equal(TAX_CONFIG.robFailureHeatGain, 10);

const fixerCost = (heat: number) => Math.max(TAX_CONFIG.fixerMinimumFee, Math.ceil(heat) * TAX_CONFIG.fixerFeePerHeat);
assert.equal(fixerCost(40), 160_000, "Fixer fee scales from the minimum heat requirement.");
assert.equal(fixerCost(100), 400_000, "Fixer fee scales at raid-level heat.");

console.log("heat configuration tests passed.");
