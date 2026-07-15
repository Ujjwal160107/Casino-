import assert from "node:assert/strict";
import {
  CHICKEN_TRAITS,
  chooseChickenTrait,
  createStarterChickenMeta,
  getChickenTraitBonus,
  STARTER_CHICKEN_ITEM_KEY,
} from "../utils/chickenConfig";
import { COCK_SYSTEM_ITEMS } from "../utils/shopCatalog";

function run(): void {
  assert.equal(CHICKEN_TRAITS.length, 5, "starter chickens should have five possible traits");
  assert.equal(chooseChickenTrait(() => 0).name, "Aggressive");
  assert.equal(chooseChickenTrait(() => 0.999999).name, "Fierce");
  assert.deepEqual(getChickenTraitBonus("Balanced"), { str: 1, agi: 1, def: 1 });
  assert.deepEqual(getChickenTraitBonus("unknown"), { str: 0, agi: 0, def: 0 });

  const hatchedAt = new Date("2026-07-15T00:00:00.000Z");
  const chicken = createStarterChickenMeta("Fortuna", () => 0.4, hatchedAt);
  assert.deepEqual(chicken, {
    name: "Fortuna's Chicken",
    level: 0,
    xp: 0,
    wins: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    trait: "Speedster",
    hatchedAt: hatchedAt.toISOString(),
  });

  const catalogItem = COCK_SYSTEM_ITEMS.find((item) => item.key === STARTER_CHICKEN_ITEM_KEY);
  assert.ok(catalogItem, "the system chicken catalog item should exist");
  assert.equal(catalogItem?.price, 0, "starter chickens must never require a purchase");
  assert.equal(catalogItem?.maxStack, 1, "each player should have only one active chicken");

  console.log("Starter chicken checks passed.");
}

run();
