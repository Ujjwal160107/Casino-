export type AnimalRarity = "Common" | "Uncommon" | "Rare" | "Legendary";

export interface AnimalDefinition {
  key: string;
  name: string;
  rarity: AnimalRarity;
  sellValue: number;
  zooIncomePerHour: number;
  parts: string[];
  emojiKey: string;
  emoji: string;
  asset?: string;
}

export const RIFLE_TIERS: Record<string, {
  cooldownSeconds: number;
  minAnimals: number;
  maxAnimals: number;
  weights: Record<AnimalRarity, number>;
}> = {
  "wooden rifle":   { cooldownSeconds: 8 * 3600, minAnimals: 1, maxAnimals: 1, weights: { Common: 1.00, Uncommon: 0,    Rare: 0,    Legendary: 0    } },
  "iron rifle":     { cooldownSeconds: 6 * 3600, minAnimals: 1, maxAnimals: 2, weights: { Common: 0.70, Uncommon: 0.30, Rare: 0,    Legendary: 0    } },
  "sniper rifle":   { cooldownSeconds: 4 * 3600, minAnimals: 1, maxAnimals: 3, weights: { Common: 0.50, Uncommon: 0.35, Rare: 0.15, Legendary: 0    } },
  "legendary rifle":{ cooldownSeconds: 2 * 3600, minAnimals: 2, maxAnimals: 4, weights: { Common: 0.30, Uncommon: 0.35, Rare: 0.25, Legendary: 0.10 } },
};

export const RIFLE_PRIORITY = ["legendary rifle", "sniper rifle", "iron rifle", "wooden rifle"] as const;

export const RARITY_INCOME: Record<AnimalRarity, number> = {
  Common:    500,
  Uncommon:  2_000,
  Rare:      8_000,
  Legendary: 25_000,
};

// OWO-style: how many units of each rarity drop per hunt (min/max)
// Common drops more units; Legendary always drops 1
export const RARITY_QUANTITIES: Record<AnimalRarity, { min: number; max: number }> = {
  Common:    { min: 3, max: 6 },
  Uncommon:  { min: 1, max: 3 },
  Rare:      { min: 1, max: 2 },
  Legendary: { min: 1, max: 1 },
};

export const RARITY_COLOR: Record<AnimalRarity, string> = {
  Common: "⬜",
  Uncommon: "🟩",
  Rare: "🟦",
  Legendary: "🟨",
};

export type ZooTierKey = "mini_zoo" | "city_zoo" | "world_zoo";

export interface ZooTier {
  key: ZooTierKey;
  /** Distinct species the zoo may house. Always equals the sum of `mix`. */
  types: number;
  /** How many distinct species of each rarity may be housed. */
  mix: Record<AnimalRarity, number>;
}

// Three limits apply together: type cap, rarity mix, and per-species stack.
// Only a World Zoo may house a Legendary — that exclusivity is the reason to
// make the last upgrade, independent of the income arithmetic.
export const ZOO_TIERS: Record<ZooTierKey, ZooTier> = {
  mini_zoo:  { key: "mini_zoo",  types: 5,  mix: { Common: 3, Uncommon: 2, Rare: 0, Legendary: 0 } },
  city_zoo:  { key: "city_zoo",  types: 10, mix: { Common: 4, Uncommon: 4, Rare: 2, Legendary: 0 } },
  world_zoo: { key: "world_zoo", types: 12, mix: { Common: 4, Uncommon: 4, Rare: 3, Legendary: 1 } },
};

/** Copies of the same species a zoo may hold. Falls as rarity rises. */
export const RARITY_STACK_LIMIT: Record<AnimalRarity, number> = {
  Common:    4,
  Uncommon:  3,
  Rare:      3,
  Legendary: 1,
};

/** Paid per fed, housed animal on each daily claim. Replaces hourly accrual. */
export const RARITY_INCOME_PER_DAY: Record<AnimalRarity, number> = {
  Common:    4_000,
  Uncommon:  16_000,
  Rare:      60_000,
  Legendary: 200_000,
};

/** Cost of one feed unit, which keeps one animal fed for one day. */
export const RARITY_FEED_COST: Record<AnimalRarity, number> = {
  Common:    1_500,
  Uncommon:  6_000,
  Rare:      22_000,
  Legendary: 75_000,
};

/** Shop catalogKey of the feed that works on each rarity. */
export const RARITY_FEED_KEY: Record<AnimalRarity, string> = {
  Common:    "common_feed",
  Uncommon:  "uncommon_feed",
  Rare:      "rare_feed",
  Legendary: "legendary_feed",
};

export const FED_WINDOW_MS = 24 * 3_600_000;
export const HUNGER_GRACE_MS = 72 * 3_600_000;

// Derived so callers that only need the type cap (propertyService, zoo.ts,
// collapseMultiZoos) keep working unchanged.
export const ZOO_CAPACITY: Record<string, number> = Object.fromEntries(
  Object.values(ZOO_TIERS).map((t) => [t.key, t.types]),
);

export const ZOO_PROPERTY_DEFS: { key: string; name: string; description: string; price: number }[] = [
  { key: "mini_zoo",  name: "Mini Zoo",  description: "A small zoo that can house up to 5 animal types.",   price: 1_800_000  },
  { key: "city_zoo",  name: "City Zoo",  description: "A city zoo that can house up to 10 animal types.",   price: 15_000_000 },
  { key: "world_zoo", name: "World Zoo", description: "A world-class zoo that can house up to 16 animal types.", price: 75_000_000 },
];

export const PART_VALUES: Record<string, number> = {
  // Common parts — total should sit below Common sellValue (~20k per animal)
  fur:      6_000,
  meat:     5_000,
  feathers: 5_500,
  tail:     4_000,
  // Uncommon parts — below ~75k
  venison:  18_000,
  antlers:  22_000,
  hide:     15_000,
  tusk:     30_000,
  pelt:     25_000,
  fang:     22_000,
  talons:   20_000,
  // Rare parts — below ~300k
  skin:     80_000,
  teeth:    90_000,
  claws:    100_000,
  // Legendary parts — below ~900k
  scales:   300_000,
  venom:    380_000,
  fangs:    340_000,
};

export const ANIMAL_CATALOG: AnimalDefinition[] = [
  // Common — zoo: 500/hr = 12,000/day. Sell < 1 day of zoo income.
  { key: "rabbit",       name: "Rabbit",       rarity: "Common",    sellValue: 8_000,      zooIncomePerHour: 500,    parts: ["meat", "fur"],               emojiKey: "rabbit",       emoji: "🐰", asset: "rabbit" },
  { key: "squirrel",     name: "Squirrel",     rarity: "Common",    sellValue: 6_000,      zooIncomePerHour: 500,    parts: ["fur"],                       emojiKey: "squirrel",     emoji: "🐿️", asset: "squirel" },
  { key: "fox",          name: "Fox",          rarity: "Common",    sellValue: 10_000,     zooIncomePerHour: 500,    parts: ["fur", "tail"],               emojiKey: "fox",          emoji: "🦊", asset: "fox" },
  { key: "duck",         name: "Duck",         rarity: "Common",    sellValue: 7_000,      zooIncomePerHour: 500,    parts: ["feathers", "meat"],          emojiKey: "duck",         emoji: "🦆", asset: "duck" },
  // Uncommon — zoo: 2,000/hr = 48,000/day. Sell < 2 days.
  { key: "deer",         name: "Deer",         rarity: "Uncommon",  sellValue: 60_000,     zooIncomePerHour: 2_000,  parts: ["venison", "antlers", "hide"], emojiKey: "deer",         emoji: "🦌", asset: "deer" },
  { key: "boar",         name: "Boar",         rarity: "Uncommon",  sellValue: 65_000,     zooIncomePerHour: 2_000,  parts: ["tusk", "meat"],              emojiKey: "boar",         emoji: "🐗", asset: "boar" },
  { key: "wolf",         name: "Wolf",         rarity: "Uncommon",  sellValue: 70_000,     zooIncomePerHour: 2_000,  parts: ["pelt", "fang"],              emojiKey: "wolf",         emoji: "🐺", asset: "wolf" },
  { key: "eagle",        name: "Eagle",        rarity: "Uncommon",  sellValue: 75_000,     zooIncomePerHour: 2_000,  parts: ["feathers", "talons"],        emojiKey: "eagle",        emoji: "🦅", asset: "eagle" },
  // Rare — zoo: 8,000/hr = 192,000/day. Sell < 2 days.
  { key: "black_bear",   name: "Black Bear",   rarity: "Rare",      sellValue: 280_000,    zooIncomePerHour: 8_000,  parts: ["pelt", "claws"],             emojiKey: "black_bear",   emoji: "🐻", asset: "bear" },
  { key: "snow_leopard", name: "Snow Leopard", rarity: "Rare",      sellValue: 320_000,    zooIncomePerHour: 8_000,  parts: ["pelt"],                      emojiKey: "snow_leopard", emoji: "🐆", asset: "snow leopard" },
  { key: "crocodile",    name: "Crocodile",    rarity: "Rare",      sellValue: 260_000,    zooIncomePerHour: 8_000,  parts: ["hide", "teeth"],             emojiKey: "crocodile",    emoji: "🐊", asset: "crocodile" },
  { key: "python",       name: "Python",       rarity: "Rare",      sellValue: 240_000,    zooIncomePerHour: 8_000,  parts: ["skin"],                      emojiKey: "python",       emoji: "🐍", asset: "python" },
  // Legendary — zoo: 25,000/hr = 600,000/day. Sell < 2 days.
  { key: "white_tiger",   name: "White Tiger",   rarity: "Legendary", sellValue: 900_000,   zooIncomePerHour: 25_000, parts: ["pelt", "fangs"],             emojiKey: "white_tiger",   emoji: "🐯", asset: "white tiger" },
  { key: "komodo_dragon", name: "Komodo Dragon", rarity: "Legendary", sellValue: 1_000_000, zooIncomePerHour: 25_000, parts: ["scales", "venom"],           emojiKey: "komodo_dragon", emoji: "🦎", asset: "komodo dragonm" },
  { key: "arctic_wolf",   name: "Arctic Wolf",   rarity: "Legendary", sellValue: 950_000,   zooIncomePerHour: 25_000, parts: ["fur", "fangs"],              emojiKey: "arctic_wolf",   emoji: "🐺", asset: "artic wolf" },
  { key: "golden_eagle",  name: "Golden Eagle",  rarity: "Legendary", sellValue: 850_000,   zooIncomePerHour: 25_000, parts: ["feathers", "talons"],        emojiKey: "golden_eagle",  emoji: "🦅", asset: "golden eagle" },
];

export function getAnimal(key: string): AnimalDefinition | undefined {
  return ANIMAL_CATALOG.find(a => a.key === key);
}

export function getAnimalsByRarity(rarity: AnimalRarity): AnimalDefinition[] {
  return ANIMAL_CATALOG.filter(a => a.rarity === rarity);
}

export function rollRarity(weights: Record<AnimalRarity, number>): AnimalRarity {
  const roll = Math.random();
  let cumulative = 0;
  for (const rarity of ["Common", "Uncommon", "Rare", "Legendary"] as AnimalRarity[]) {
    cumulative += weights[rarity];
    if (roll < cumulative) return rarity;
  }
  return "Common";
}
