export const STARTER_CHICKEN_ITEM_KEY = "chicken";

export type ChickenStatBonus = {
  str: number;
  agi: number;
  def: number;
};

export type ChickenTrait = {
  name: string;
  bonus: ChickenStatBonus;
};

/**
 * Every chicken receives exactly one of these equally likely traits when it
 * hatches. Keep this list as the single source of truth for combat and UI.
 */
export const CHICKEN_TRAITS: readonly ChickenTrait[] = [
  { name: "Aggressive", bonus: { str: 2, agi: 0, def: -1 } },
  { name: "Tank", bonus: { str: 0, agi: -1, def: 2 } },
  { name: "Speedster", bonus: { str: -1, agi: 2, def: 0 } },
  { name: "Balanced", bonus: { str: 1, agi: 1, def: 1 } },
  { name: "Fierce", bonus: { str: 3, agi: 0, def: -2 } },
] as const;

export type StarterChickenMeta = {
  name: string;
  level: number;
  xp: number;
  wins: number;
  strength: number;
  agility: number;
  defense: number;
  trait: string;
  hatchedAt: string;
};

export function getChickenTraitBonus(trait: string | undefined): ChickenStatBonus {
  const match = CHICKEN_TRAITS.find((entry) => entry.name.toLowerCase() === trait?.toLowerCase());
  return match ? { ...match.bonus } : { str: 0, agi: 0, def: 0 };
}

export function chooseChickenTrait(random: () => number = Math.random): ChickenTrait {
  const normalized = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  return CHICKEN_TRAITS[Math.floor(normalized * CHICKEN_TRAITS.length)];
}

export function createStarterChickenMeta(
  username: string,
  random: () => number = Math.random,
  now = new Date(),
): StarterChickenMeta {
  return {
    name: `${username}'s Chicken`,
    level: 0,
    xp: 0,
    wins: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    trait: chooseChickenTrait(random).name,
    hatchedAt: now.toISOString(),
  };
}

export function formatChickenTraitBonus(bonus: ChickenStatBonus): string {
  const parts = [
    ["Str", bonus.str],
    ["Agi", bonus.agi],
    ["Def", bonus.def],
  ] as const;
  return parts
    .filter(([, value]) => value !== 0)
    .map(([label, value]) => `${value > 0 ? "+" : ""}${value} ${label}`)
    .join(", ");
}
