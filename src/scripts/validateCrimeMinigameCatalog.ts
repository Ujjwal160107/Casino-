import { validateCrimeMinigameCatalog } from "../data/crimeMinigameCatalog";

const errors = validateCrimeMinigameCatalog();
if (errors.length > 0) {
  console.error("Crime minigame catalog validation FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("Crime minigame catalog validation passed.");
