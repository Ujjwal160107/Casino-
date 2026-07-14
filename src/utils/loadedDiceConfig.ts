export const LOADED_DICE_ITEM_KEY = "loaded_dice_of_ruin";
export const LOADED_DICE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const LOADED_DICE_FINAL_ROLL = 11;

export type LoadedDiceRewardCategory = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "MYTHIC";

export interface LoadedDiceRollConfig {
  roll: number;
  categoryWeights: Readonly<Record<LoadedDiceRewardCategory, number>>;
  shatterChance: number;
}

export interface LoadedDiceRewardPool {
  minCash: number;
  maxCash: number;
  itemChance: number;
  itemKeys: readonly string[];
}

export const LOADED_DICE_ROLL_CONFIGS: readonly LoadedDiceRollConfig[] = [
  { roll: 1, categoryWeights: { COMMON: 65, UNCOMMON: 27, RARE: 7, EPIC: 1, MYTHIC: 0 }, shatterChance: 5 },
  { roll: 2, categoryWeights: { COMMON: 55, UNCOMMON: 29, RARE: 13, EPIC: 3, MYTHIC: 0 }, shatterChance: 8 },
  { roll: 3, categoryWeights: { COMMON: 45, UNCOMMON: 30, RARE: 19, EPIC: 5, MYTHIC: 1 }, shatterChance: 13 },
  { roll: 4, categoryWeights: { COMMON: 36, UNCOMMON: 29, RARE: 24, EPIC: 9, MYTHIC: 2 }, shatterChance: 20 },
  { roll: 5, categoryWeights: { COMMON: 28, UNCOMMON: 27, RARE: 29, EPIC: 12, MYTHIC: 4 }, shatterChance: 30 },
  { roll: 6, categoryWeights: { COMMON: 21, UNCOMMON: 23, RARE: 32, EPIC: 18, MYTHIC: 6 }, shatterChance: 42 },
  { roll: 7, categoryWeights: { COMMON: 15, UNCOMMON: 20, RARE: 33, EPIC: 23, MYTHIC: 9 }, shatterChance: 58 },
  { roll: 8, categoryWeights: { COMMON: 10, UNCOMMON: 17, RARE: 33, EPIC: 27, MYTHIC: 13 }, shatterChance: 75 },
  { roll: 9, categoryWeights: { COMMON: 7, UNCOMMON: 13, RARE: 30, EPIC: 30, MYTHIC: 20 }, shatterChance: 90 },
  { roll: 10, categoryWeights: { COMMON: 4, UNCOMMON: 8, RARE: 28, EPIC: 32, MYTHIC: 28 }, shatterChance: 97 },
  { roll: 11, categoryWeights: { COMMON: 0, UNCOMMON: 5, RARE: 20, EPIC: 35, MYTHIC: 40 }, shatterChance: 100 },
] as const;

export const LOADED_DICE_REWARD_POOLS: Readonly<Record<LoadedDiceRewardCategory, LoadedDiceRewardPool>> = {
  COMMON: {
    minCash: 75_000,
    maxCash: 150_000,
    itemChance: 0.35,
    itemKeys: ["bandage", "lucky_coin", "coffee_thermos", "thief_gloves", "training_whistle"],
  },
  UNCOMMON: {
    minCash: 200_000,
    maxCash: 450_000,
    itemChance: 0.40,
    itemKeys: [
      "energy_drink",
      "stress_pills",
      "padlock",
      "calculator_pro",
      "focus_notes",
      "repair_coupon",
      "lab_kit",
      "guard_vest",
    ],
  },
  RARE: {
    minCash: 600_000,
    maxCash: 1_250_000,
    itemChance: 0.50,
    itemKeys: [
      "lucky_tie",
      "warranty_card",
      "focus_headphones",
      "echo_whistle",
      "emergency_pager",
      "celestial_harp",
      "rare_blueprint",
      "blackmarket_resume",
      "phoenix_serum",
    ],
  },
  EPIC: {
    minCash: 1_500_000,
    maxCash: 3_500_000,
    itemChance: 0.60,
    itemKeys: [
      "crown_of_greed",
      "devil_contract",
      "soul_ledger",
      "corporate_blessing",
      "legendary_blueprint",
      "hunters_compass",
      "fortuna_bracelet",
      "royal_cape",
      "sniper_rifle",
    ],
  },
  MYTHIC: {
    minCash: 5_000_000,
    maxCash: 12_000_000,
    itemChance: 0.70,
    itemKeys: ["money_rain_entrance", "platinum_crown", "void_wings", "legendary_rifle", "celestial_halo"],
  },
};

const CATEGORY_ORDER: readonly LoadedDiceRewardCategory[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "MYTHIC"];

export function getLoadedDiceRollConfig(rollNumber: number): LoadedDiceRollConfig {
  const safeRoll = Math.min(Math.max(Math.floor(rollNumber), 1), LOADED_DICE_FINAL_ROLL);
  return LOADED_DICE_ROLL_CONFIGS[safeRoll - 1];
}

export function selectLoadedDiceRewardCategory(
  rollNumber: number,
  sample: number,
): LoadedDiceRewardCategory {
  const weights = getLoadedDiceRollConfig(rollNumber).categoryWeights;
  const roll = clampSample(sample) * 100;
  let cumulative = 0;

  for (const category of CATEGORY_ORDER) {
    cumulative += weights[category];
    if (roll < cumulative) return category;
  }
  return "MYTHIC";
}

export function loadedDiceShatters(rollNumber: number, sample: number): boolean {
  return clampSample(sample) * 100 < getLoadedDiceRollConfig(rollNumber).shatterChance;
}

export function randomLoadedDiceCash(category: LoadedDiceRewardCategory, sample: number): number {
  const pool = LOADED_DICE_REWARD_POOLS[category];
  return pool.minCash + Math.floor(clampSample(sample) * (pool.maxCash - pool.minCash + 1));
}

export function getLoadedDiceCondition(completedRolls: number): string {
  if (completedRolls >= 11) return "Final Throw";
  if (completedRolls >= 9) return "Barely Contained";
  if (completedRolls >= 7) return "Ruinous";
  if (completedRolls >= 5) return "Unstable";
  if (completedRolls >= 3) return "Hairline Cracks";
  return "Pristine";
}

function clampSample(sample: number): number {
  if (!Number.isFinite(sample)) return 0;
  return Math.min(Math.max(sample, 0), 1 - Number.EPSILON);
}
