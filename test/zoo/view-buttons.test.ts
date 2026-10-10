import { describe, it, expect } from "vitest";
import { buildZooPayload } from "../../src/commands/games/zoo";
import { ANIMAL_CATALOG, RARITY_INCOME_PER_DAY } from "../../src/utils/animalCatalog";

const defs = ANIMAL_CATALOG.slice(0, 4);
const view = {
  slots: defs.map((def) => ({
    animalKey: def.key,
    def,
    count: 1,
    fedCount: 1,
    hungryCount: 0,
    incomePerDay: RARITY_INCOME_PER_DAY[def.rarity],
    feedCostPerDay: RARITY_INCOME_PER_DAY[def.rarity],
    soonestDeathMs: null,
  })),
  maxSlots: 10,
  incomePerDay: 0,
  feedBillPerDay: 0,
  claimable: false,
  nextClaim: null,
  hungryCount: 0,
  zooName: "City Zoo",
  zooKey: "city_zoo",
  nextTier: null,
  died: [],
  evicted: 0,
} as any;

describe("zoo view", () => {
  it("keeps every species' Remove All button next to its thumbnail", () => {
    const { components, files } = buildZooPayload("owner", view, null, 1);
    const json = JSON.stringify(components[0].toJSON());

    // The art is what used to take the section's only accessory slot.
    expect(files.length).toBeGreaterThan(0);
    for (const def of defs) expect(json).toContain(`zoo_remove:${def.key}:owner`);
  });
});
