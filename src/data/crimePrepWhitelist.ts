export type CrimePrepSource = "shop" | "hunt_craft";

export type CrimePrepCategory = "GENERAL" | "JOB" | "UNI" | "HUNT" | "COCK" | "CRAFT";

export interface CrimePrepItem {
  key: string;
  name: string;
  category: CrimePrepCategory;
  source: CrimePrepSource;
  craftRecipeKey?: string;
  successBonus: number;
  payoutBonus: number;
  failFineGuard?: number;
}

export const CRIME_PREP_WHITELIST: CrimePrepItem[] = [
  { key: "thief_gloves", name: "Thieves Gloves", category: "GENERAL", source: "shop", successBonus: 0.12, payoutBonus: 0.08 },
  { key: "counterfeit_kit", name: "Counterfeit Kit", category: "GENERAL", source: "shop", successBonus: 0.10, payoutBonus: 0.10 },
  { key: "lucky_coin", name: "Lucky Coin", category: "GENERAL", source: "shop", successBonus: 0.08, payoutBonus: 0.05 },
  { key: "eclipse_mask", name: "Eclipse Mask", category: "GENERAL", source: "shop", successBonus: 0.14, payoutBonus: 0.12 },
  { key: "blackmarket_resume", name: "Black Market Resume", category: "JOB", source: "shop", successBonus: 0.12, payoutBonus: 0.06 },
  { key: "business_briefcase", name: "Business Briefcase", category: "JOB", source: "shop", successBonus: 0.10, payoutBonus: 0.08 },
  { key: "legal_case_file", name: "Legal Case File", category: "JOB", source: "shop", successBonus: 0.09, payoutBonus: 0.07 },
  { key: "mechanic_toolkit", name: "Mechanic Toolkit", category: "JOB", source: "shop", successBonus: 0.08, payoutBonus: 0.06 },
  { key: "corporate_blessing", name: "Corporate Blessing", category: "JOB", source: "shop", successBonus: 0.15, payoutBonus: 0.10 },
  { key: "cheat_sheet", name: "Cheat Sheet", category: "UNI", source: "shop", successBonus: 0.13, payoutBonus: 0.05 },
  { key: "lab_kit", name: "Lab Kit", category: "UNI", source: "shop", successBonus: 0.11, payoutBonus: 0.08 },
  { key: "calculator_pro", name: "Calculator Pro", category: "UNI", source: "shop", successBonus: 0.09, payoutBonus: 0.06 },
  { key: "wooden_rifle", name: "Wooden Rifle", category: "HUNT", source: "shop", successBonus: 0.08, payoutBonus: 0.05 },
  { key: "iron_rifle", name: "Iron Rifle", category: "HUNT", source: "shop", successBonus: 0.10, payoutBonus: 0.07 },
  { key: "sniper_rifle", name: "Sniper Rifle", category: "HUNT", source: "shop", successBonus: 0.14, payoutBonus: 0.09 },
  { key: "camouflage_kit", name: "Camouflage Kit", category: "HUNT", source: "shop", successBonus: 0.12, payoutBonus: 0.06 },
  { key: "hunting_permit", name: "Hunting Permit", category: "HUNT", source: "shop", successBonus: 0.09, payoutBonus: 0.05 },
  { key: "iron_spurs", name: "Iron Spurs", category: "COCK", source: "shop", successBonus: 0.10, payoutBonus: 0.08 },
  { key: "guard_vest", name: "Guard Vest", category: "COCK", source: "shop", successBonus: 0.08, payoutBonus: 0.06 },
  {
    key: "python_skin_cloak",
    name: "Python Skin Cloak",
    category: "CRAFT",
    source: "hunt_craft",
    craftRecipeKey: "python_skin_cloak",
    successBonus: 0.12,
    payoutBonus: 0.07,
  },
  {
    key: "fox_tail_talisman",
    name: "Fox Tail Talisman",
    category: "CRAFT",
    source: "hunt_craft",
    craftRecipeKey: "fox_tail_talisman",
    successBonus: 0.05,
    payoutBonus: 0,
    failFineGuard: 0.2,
  },
  {
    key: "wolf_fang_dagger",
    name: "Wolf Fang Dagger",
    category: "CRAFT",
    source: "hunt_craft",
    craftRecipeKey: "wolf_fang_dagger",
    successBonus: 0.10,
    payoutBonus: 0.10,
  },
  {
    key: "rabbit_foot_charm",
    name: "Rabbit Foot Charm",
    category: "CRAFT",
    source: "hunt_craft",
    craftRecipeKey: "rabbit_foot_charm",
    successBonus: 0.06,
    payoutBonus: 0.04,
  },
  {
    key: "arctic_wolf_spirit_charm",
    name: "Arctic Wolf Spirit Charm",
    category: "CRAFT",
    source: "hunt_craft",
    craftRecipeKey: "arctic_wolf_spirit_charm",
    successBonus: 0.12,
    payoutBonus: 0.08,
  },
  {
    key: "komodo_venom_flask",
    name: "Komodo Venom Flask",
    category: "CRAFT",
    source: "hunt_craft",
    craftRecipeKey: "komodo_venom_flask",
    successBonus: 0.11,
    payoutBonus: 0.09,
  },
];

export const CRIME_PREP_CRAFT_KEYS = new Set(
  CRIME_PREP_WHITELIST.filter((i) => i.source === "hunt_craft").map((i) => i.key),
);

const prepByKey = new Map(CRIME_PREP_WHITELIST.map((i) => [i.key, i]));

export function getCrimePrepItem(key: string): CrimePrepItem | undefined {
  return prepByKey.get(key);
}

export function validateCrimeRequiredItems(keys: string[]): boolean {
  return keys.every((k) => prepByKey.has(k));
}
