import assert from "node:assert/strict";
import {
  getLoadedDiceCondition,
  getLoadedDiceRollConfig,
  loadedDiceShatters,
  LOADED_DICE_FINAL_ROLL,
  LOADED_DICE_REWARD_POOLS,
  LOADED_DICE_ROLL_CONFIGS,
  randomLoadedDiceCash,
  selectLoadedDiceRewardCategory,
} from "../utils/loadedDiceConfig";
import { SHOP_CATALOG } from "../utils/shopCatalog";

const categories = ["COMMON", "UNCOMMON", "RARE", "EPIC", "MYTHIC"] as const;
const catalogKeys = new Set(SHOP_CATALOG.map((item) => item.key));
const forbiddenRewards = new Set([
  "loaded_dice_of_ruin",
  "mystery_box",
  "treasure_map",
  "pandora_box",
]);
const loadedDice = SHOP_CATALOG.find((item) => item.key === "loaded_dice_of_ruin");

assert.ok(loadedDice, "Loaded Dice of Ruin is present in the shop catalog.");
assert.equal(loadedDice.price, 2_500_000, "Loaded Dice uses the balanced relic price.");
assert.equal(loadedDice.consumable, false, "Loaded Dice is reusable until it shatters.");
assert.equal(loadedDice.usable, false, "Loaded Dice is used only through the roll command.");
assert.equal(loadedDice.maxStack, 1, "Only one active Loaded Dice can be owned.");

assert.equal(LOADED_DICE_ROLL_CONFIGS.length, LOADED_DICE_FINAL_ROLL);
assert.equal(getLoadedDiceRollConfig(0).roll, 1);
assert.equal(getLoadedDiceRollConfig(99).roll, LOADED_DICE_FINAL_ROLL);

for (const config of LOADED_DICE_ROLL_CONFIGS) {
  const totalWeight = categories.reduce((sum, category) => sum + config.categoryWeights[category], 0);
  assert.equal(totalWeight, 100, `Roll ${config.roll} reward weights total 100%.`);
  assert.ok(config.shatterChance >= 0 && config.shatterChance <= 100, `Roll ${config.roll} shatter chance is valid.`);

  let lowerBound = 0;
  for (const category of categories) {
    const weight = config.categoryWeights[category];
    if (weight > 0) {
      const sample = (lowerBound + Math.min(weight - 0.001, weight / 2)) / 100;
      assert.equal(selectLoadedDiceRewardCategory(config.roll, sample), category, `Roll ${config.roll} selects ${category}.`);
    }
    lowerBound += weight;
  }

  assert.equal(
    loadedDiceShatters(config.roll, Math.max(0, config.shatterChance / 100 - 0.0001)),
    config.shatterChance > 0,
    `Roll ${config.roll} shatters below its threshold.`,
  );
  if (config.shatterChance < 100) {
    assert.equal(
      loadedDiceShatters(config.roll, config.shatterChance / 100 + 0.0001),
      false,
      `Roll ${config.roll} does not shatter at its exclusive threshold.`,
    );
  }
}

assert.equal(loadedDiceShatters(LOADED_DICE_FINAL_ROLL, 0.999999), true, "Final roll always shatters.");
assert.equal(getLoadedDiceCondition(0), "Pristine");
assert.equal(getLoadedDiceCondition(3), "Hairline Cracks");
assert.equal(getLoadedDiceCondition(5), "Unstable");
assert.equal(getLoadedDiceCondition(7), "Ruinous");
assert.equal(getLoadedDiceCondition(9), "Barely Contained");
assert.equal(getLoadedDiceCondition(11), "Final Throw");

for (const category of categories) {
  const pool = LOADED_DICE_REWARD_POOLS[category];
  assert.ok(pool.minCash > 0 && pool.maxCash >= pool.minCash, `${category} cash range is valid.`);
  assert.ok(pool.itemChance >= 0 && pool.itemChance <= 1, `${category} item chance is valid.`);
  assert.equal(randomLoadedDiceCash(category, 0), pool.minCash, `${category} cash starts at the configured minimum.`);
  assert.equal(randomLoadedDiceCash(category, 0.999999999), pool.maxCash, `${category} cash reaches the configured maximum.`);
  for (const itemKey of pool.itemKeys) {
    assert.ok(catalogKeys.has(itemKey), `${category} reward ${itemKey} exists in the current shop catalog.`);
    assert.ok(!forbiddenRewards.has(itemKey), `${category} reward ${itemKey} cannot create a gambling-item chain.`);
  }
}

let expectedRolls = 0;
let chanceToReachRoll = 1;
for (const config of LOADED_DICE_ROLL_CONFIGS) {
  expectedRolls += chanceToReachRoll;
  chanceToReachRoll *= 1 - config.shatterChance / 100;
}
assert.ok(expectedRolls > 4.9 && expectedRolls < 5.1, `Expected lifespan is about five rolls (${expectedRolls.toFixed(3)}).`);

console.log("loaded dice progression tests passed.");
