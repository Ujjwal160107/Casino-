/**
 * Regression check for the hunt "silent reply" bug.
 *
 * Builds the worst-case hunt result payload (5 distinct species, zoo owned,
 * recipe unlocks) and counts total ComponentsV2 components. Discord rejects
 * any message with more than 40 total components (50035 Invalid Form Body),
 * which the global message handler swallows — the player sees nothing while
 * their cooldown burns.
 *
 * Run: npx ts-node --transpile-only src/scripts/checkHuntPayload.ts
 */
import { buildHuntResultPayload } from "../commands/games/hunt";
import { ANIMAL_CATALOG } from "../utils/animalCatalog";
import type { HuntGroup } from "../services/huntService";

function countComponents(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let count = 1;
  for (const child of node.components ?? []) count += countComponents(child);
  if (node.accessory) count += countComponents(node.accessory);
  return count;
}

// Worst case: 5 distinct species (legendary rifle rolls 4 + echo whistle extra)
const defs = ANIMAL_CATALOG.slice(0, 5);
const groups: HuntGroup[] = defs.map((def) => ({
  animalKey: def.key,
  count: 3,
  def,
  ids: [],
}));

const payload = buildHuntResultPayload(
  "123456789012345678",
  groups,
  "legendary rifle",
  ["Fox Fur Cloak"], // recipe unlock adds separator + text display
  true, // zoo owned -> 4 buttons per group row
);

const total = payload.components.reduce(
  (sum, c: any) => sum + countComponents(c.toJSON()),
  0,
);

console.log(`Groups: ${groups.length}, zoo: yes, recipes: 1`);
console.log(`Total components: ${total} (Discord limit: 40)`);
console.log(`Attachments: ${payload.files.length} (Discord limit: 10)`);
if (total > 40) {
  console.log("FAIL: payload EXCEEDS the 40-component limit -> 50035 Invalid Form Body");
  process.exit(1);
} else {
  console.log("PASS: payload is within the 40-component limit");
}
