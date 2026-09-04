/**
 * Validates the slash command registry against Discord's rules and against the
 * router, so a bad definition fails here rather than at boot in production.
 *
 * Checks:
 *   1. Every spec builds into a valid Discord command (name/description limits,
 *      required options ordered before optional ones).
 *   2. Every spec name matches a `case` label in commandRouter.ts -- a spec
 *      without one would register fine and then answer "Unknown Command".
 *   3. The total stays under Discord's 100 global command cap.
 *
 * Run: npx ts-node --transpile-only src/scripts/validateSlashCommands.ts
 */
import fs from "fs";
import path from "path";
import { buildCommand, SPECS } from "../slash/registry";

const DISCORD_GLOBAL_COMMAND_CAP = 100;

let failures = 0;
const fail = (msg: string) => {
    console.log(`  FAIL  ${msg}`);
    failures++;
};

console.log(`Validating ${SPECS.length} slash command specs\n`);

console.log("1. Discord command definitions");
for (const spec of SPECS) {
    try {
        buildCommand(spec).toJSON();
    } catch (err: any) {
        fail(`/${spec.name}: ${err.message}`);
    }
}
if (!failures) console.log("  all definitions build");

console.log("\n2. Router coverage");
const router = fs.readFileSync(path.join(__dirname, "..", "commandRouter.ts"), "utf8");
const cases = new Set([...router.matchAll(/case\s+"([^"]+)"/g)].map((m) => m[1]));
for (const spec of SPECS) {
    if (!cases.has(spec.name)) {
        fail(`/${spec.name} has no matching case in commandRouter.ts`);
    }
}

const names = SPECS.map((s) => s.name);
const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
for (const d of new Set(duplicates)) fail(`duplicate spec name: ${d}`);

console.log("\n3. Global command cap");
if (SPECS.length > DISCORD_GLOBAL_COMMAND_CAP) {
    fail(`${SPECS.length} commands exceeds Discord's cap of ${DISCORD_GLOBAL_COMMAND_CAP}`);
} else {
    console.log(`  ${SPECS.length}/${DISCORD_GLOBAL_COMMAND_CAP} used`);
}

if (failures > 0) {
    console.log(`\n${failures} problem(s) found`);
    process.exit(1);
}
console.log("\nAll slash command specs are valid.");
