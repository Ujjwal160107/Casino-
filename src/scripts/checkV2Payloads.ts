/**
 * ComponentsV2 payload audit. Discord rejects messages with > 40 total
 * components or > 4000 chars of text (50035 Invalid Form Body) — swallowed
 * silently by the global handler, so we gate on it here.
 *
 * Run: npx ts-node --transpile-only src/scripts/checkV2Payloads.ts
 */
import { buildHuntResultPayload } from "../commands/games/hunt";
import { buildHuntStoreMessage } from "../commands/economy/shop";
import { buildZooPayload } from "../commands/games/zoo";
import { ANIMAL_CATALOG, RARITY_INCOME_PER_DAY, ZOO_TIERS } from "../utils/animalCatalog";
import type { HuntGroup } from "../services/huntService";
import type { ZooSlot } from "../services/zooService";
import { statusContainer, plainContainer } from "../utils/componentsV2";
import { nextStepHint } from "../config/nextSteps";

let failures = 0;

function countComponents(node: any): number {
    if (!node || typeof node !== "object") return 0;
    let count = 1;
    for (const child of node.components ?? []) count += countComponents(child);
    if (node.accessory) count += countComponents(node.accessory);
    return count;
}

function countChars(node: any): number {
    if (!node || typeof node !== "object") return 0;
    let chars = typeof node.content === "string" ? node.content.length : 0;
    for (const child of node.components ?? []) chars += countChars(child);
    if (node.accessory) chars += countChars(node.accessory);
    return chars;
}

function check(label: string, payload: { components: any[]; files?: any[] }) {
    const json = payload.components.map((c: any) => (typeof c.toJSON === "function" ? c.toJSON() : c));
    const components = json.reduce((sum: number, c: any) => sum + countComponents(c), 0);
    const chars = json.reduce((sum: number, c: any) => sum + countChars(c), 0);
    const files = payload.files?.length ?? 0;
    const ok = components <= 40 && chars <= 4000 && files <= 10;
    console.log(`${ok ? "PASS" : "FAIL"}: ${label} — ${components}/40 components, ${chars}/4000 chars, ${files}/10 files`);
    if (!ok) failures++;
}

// --- Kit sanity: worst-case long status message with a hint ---
const longDesc = "x".repeat(600);
check("statusContainer(success, long desc, hint)", {
    components: [statusContainer("success", "A Long Title For Auditing", longDesc, { hint: nextStepHint("deposit") })],
});
check("plainContainer x3 blocks", { components: [plainContainer("## A", "B".repeat(1000), "-# c")] });

// --- Hunt worst case: 5 species, zoo owned, recipe unlock (regression from checkHuntPayload) ---
const defs = ANIMAL_CATALOG.slice(0, 5);
const groups: HuntGroup[] = defs.map((def) => ({ animalKey: def.key, count: 3, def, ids: [] }));
check(
    "hunt worst case",
    buildHuntResultPayload("123456789012345678", groups, "legendary rifle", ["Fox Fur Cloak"], true),
);

// --- Zoo worst case: a full World Zoo (16 distinct types), all hungry, plus
// died/evicted lines and the Feed All button — every optional line/button at
// once, since that's the actual worst case for both the component and char
// budgets (hunger/death/eviction text lands inside existing components, but
// Feed All is a real extra component in the action row). ---
const zooDefs = ANIMAL_CATALOG.slice(0, 16);
const zooSlots: ZooSlot[] = zooDefs.map((def) => ({
    animalKey: def.key,
    def,
    count: 3,
    fedCount: 0,
    hungryCount: 3,
    incomePerDay: RARITY_INCOME_PER_DAY[def.rarity] * 3,
    feedCostPerDay: RARITY_INCOME_PER_DAY[def.rarity],
    soonestDeathMs: 12 * 3_600_000,
}));
check(
    "zoo worst case (16 types, all hungry, died + evicted)",
    buildZooPayload(
        "123456789012345678",
        {
            slots: zooSlots,
            maxSlots: ZOO_TIERS.city_zoo.types,
            incomePerDay: 0,
            feedBillPerDay: zooSlots.reduce((s, z) => s + z.feedCostPerDay, 0),
            claimable: false,
            nextClaim: new Date(Date.now() + 12 * 3_600_000),
            hungryCount: zooSlots.reduce((s, z) => s + z.hungryCount, 0),
            zooName: "City Zoo",
            zooKey: "city_zoo",
            nextTier: { key: "world_zoo", name: "World Zoo", price: 75_000_000 },
            died: [
                { animalKey: zooDefs[0].key, count: 2 },
                { animalKey: zooDefs[1].key, count: 1 },
            ],
            evicted: 4,
        },
        null,
    ),
);

// --- Hunt Store: nine numbered slots + the zoo feed shelf. The shelf is text
// inside the existing container rather than four more buttons precisely
// because of this budget — pin it so a later slot/button addition can't push
// the panel over 40 silently. ---
check("hunt store (9 slots + zoo feed shelf)", buildHuntStoreMessage("123456789012345678"));

if (failures > 0) {
    console.log(`\n${failures} payload(s) exceed Discord limits`);
    process.exit(1);
}
console.log("\nAll payloads within Discord limits");
