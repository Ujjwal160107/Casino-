import { validateCrimeRequiredItems } from "./crimePrepWhitelist";

export type CrimeTier = "petty" | "medium" | "high" | "elite" | "legendary";

export type CrimeTag =
  | "GENERAL" | "JOB" | "UNI" | "HUNT" | "COCK"
  | "THEFT" | "FRAUD" | "SMUGGLE" | "FIX" | "SCAM"
  | "HEIST" | "NARCOTICS" | "LAUNDER" | "LUCK";

export interface CrimeDefinition {
  key: string;
  name: string;
  tier: CrimeTier;
  tags: CrimeTag[];
  baseSuccess: number;
  payoutMin: number;
  payoutMax: number;
  fineMin: number;
  fineMax: number;
  heatMultiplier: number;
  weight: number;
  prepSlots: 1 | 3;
  requiredItems: string[];
  winMessages: string[];
  failMessages: string[];
}

const DEFAULT_WIN = [
  "You pulled it off and pocketed **{amount}**.",
  "Clean getaway — **{amount}** is yours.",
  "The job paid **{amount}**.",
];

const DEFAULT_FAIL = [
  "Security had receipts. The fine cost you **{amount}**.",
  "The job went sideways. Damage control drained **{amount}**.",
  "You got caught and paid **{amount}** to walk away.",
];

const TIER_STATS: Record<
  CrimeTier,
  Omit<CrimeDefinition, "key" | "name" | "tier" | "tags" | "prepSlots" | "requiredItems" | "winMessages" | "failMessages">
> = {
  petty: { baseSuccess: 0.50, payoutMin: 50_000, payoutMax: 120_000, fineMin: 25_000, fineMax: 60_000, heatMultiplier: 0.8, weight: 10 },
  medium: { baseSuccess: 0.40, payoutMin: 100_000, payoutMax: 220_000, fineMin: 60_000, fineMax: 140_000, heatMultiplier: 1.0, weight: 8 },
  high: { baseSuccess: 0.30, payoutMin: 180_000, payoutMax: 350_000, fineMin: 120_000, fineMax: 240_000, heatMultiplier: 1.3, weight: 5 },
  elite: { baseSuccess: 0.20, payoutMin: 300_000, payoutMax: 550_000, fineMin: 200_000, fineMax: 400_000, heatMultiplier: 1.6, weight: 2 },
  legendary: { baseSuccess: 0.14, payoutMin: 500_000, payoutMax: 1_200_000, fineMin: 350_000, fineMax: 700_000, heatMultiplier: 2.0, weight: 1 },
};

function crime(
  key: string,
  name: string,
  tier: CrimeTier,
  tags: CrimeTag[],
  requiredItems: string[],
): CrimeDefinition {
  if (tier === "legendary" && requiredItems.length !== 3) {
    throw new Error(`Legendary crime ${key} must have exactly 3 required items`);
  }
  if (tier !== "legendary" && requiredItems.length !== 1) {
    throw new Error(`Standard crime ${key} must have exactly 1 required item`);
  }
  if (!validateCrimeRequiredItems(requiredItems)) {
    throw new Error(`Crime ${key} has invalid requiredItems`);
  }
  const stats = TIER_STATS[tier];
  return {
    key,
    name,
    tier,
    tags,
    ...stats,
    prepSlots: tier === "legendary" ? 3 : 1,
    requiredItems,
    winMessages: DEFAULT_WIN,
    failMessages: DEFAULT_FAIL,
  };
}

export const CRIME_CATALOG: CrimeDefinition[] = [
  // General (~10)
  crime("pickpocket_alley", "Pickpocket Alley", "petty", ["GENERAL", "THEFT"], ["thief_gloves"]),
  crime("counterfeit_stamps", "Counterfeit Stamps", "petty", ["GENERAL", "FRAUD"], ["counterfeit_kit"]),
  crime("atm_skim", "ATM Skim", "medium", ["GENERAL", "FRAUD"], ["lucky_coin"]),
  crime("tax_dodge", "Tax Dodge", "medium", ["GENERAL", "LAUNDER"], ["counterfeit_kit"]),
  crime("parking_meter_shake", "Parking Meter Shake", "petty", ["GENERAL", "THEFT"], ["thief_gloves"]),
  crime("vip_briefcase_lift", "VIP Briefcase Lift", "high", ["GENERAL", "THEFT"], ["thief_gloves"]),
  crime("lottery_scam", "Lottery Scam", "medium", ["GENERAL", "SCAM"], ["lucky_coin"]),
  crime("stamp_forgery", "Stamp Forgery", "high", ["GENERAL", "FRAUD"], ["counterfeit_kit"]),
  crime("back_alley_dice", "Back Alley Dice", "petty", ["GENERAL", "LUCK"], ["rabbit_foot_charm"]),
  crime("eclipse_night_rob", "Eclipse Night Robbery", "elite", ["GENERAL", "HEIST"], ["eclipse_mask"]),

  // Job (~10)
  crime("office_expense_fraud", "Office Expense Fraud", "medium", ["JOB", "FRAUD"], ["business_briefcase"]),
  crime("resume_forge", "Resume Forge", "petty", ["JOB", "FRAUD"], ["blackmarket_resume"]),
  crime("overtime_skim", "Overtime Skim", "medium", ["JOB", "FRAUD"], ["business_briefcase"]),
  crime("gear_resale", "Gear Resale Racket", "high", ["JOB", "SMUGGLE"], ["mechanic_toolkit"]),
  crime("contract_breach_scam", "Contract Breach Scam", "high", ["JOB", "SCAM"], ["legal_case_file"]),
  crime("shell_company_flip", "Shell Company Flip", "elite", ["JOB", "LAUNDER"], ["corporate_blessing"]),
  crime("payroll_redirect", "Payroll Redirect", "medium", ["JOB", "FRAUD"], ["blackmarket_resume"]),
  crime("client_kickback", "Client Kickback", "high", ["JOB", "FRAUD"], ["business_briefcase"]),
  crime("audit_bribe", "Audit Bribe", "elite", ["JOB", "FRAUD"], ["legal_case_file"]),
  crime("executive_embezzle", "Executive Embezzle", "elite", ["JOB", "FRAUD"], ["corporate_blessing"]),

  // Uni (~10)
  crime("exam_swap", "Exam Swap", "medium", ["UNI", "SCAM"], ["cheat_sheet"]),
  crime("scholarship_forgery", "Scholarship Forgery", "high", ["UNI", "FRAUD"], ["cheat_sheet"]),
  crime("lab_chemical_theft", "Lab Chemical Theft", "high", ["UNI", "NARCOTICS"], ["lab_kit"]),
  crime("tuition_launder", "Tuition Launder", "medium", ["UNI", "LAUNDER"], ["calculator_pro"]),
  crime("thesis_plagiarism", "Thesis Plagiarism", "petty", ["UNI", "SCAM"], ["cheat_sheet"]),
  crime("grade_broker", "Grade Broker", "medium", ["UNI", "FRAUD"], ["calculator_pro"]),
  crime("dean_bribe", "Dean Bribe", "elite", ["UNI", "FRAUD"], ["calculator_pro"]),
  crime("lab_equipment_fence", "Lab Equipment Fence", "high", ["UNI", "SMUGGLE"], ["lab_kit"]),
  crime("campus_pill_lab", "Campus Pill Lab", "elite", ["UNI", "NARCOTICS"], ["lab_kit"]),
  crime("fake_transcript_ring", "Fake Transcript Ring", "medium", ["UNI", "FRAUD"], ["calculator_pro"]),

  // Hunt (~10)
  crime("poacher_run", "Poacher Run", "medium", ["HUNT", "THEFT"], ["wooden_rifle"]),
  crime("permit_forgery", "Permit Forgery", "medium", ["HUNT", "FRAUD"], ["hunting_permit"]),
  crime("bait_warehouse_heist", "Bait Warehouse Heist", "high", ["HUNT", "SMUGGLE"], ["camouflage_kit"]),
  crime("trophy_black_market", "Trophy Black Market", "high", ["HUNT", "SMUGGLE"], ["iron_rifle"]),
  crime("ranger_bribe", "Ranger Bribe", "medium", ["HUNT", "FRAUD"], ["hunting_permit"]),
  crime("wildlife_smuggle", "Wildlife Smuggle", "high", ["HUNT", "SMUGGLE"], ["iron_rifle"]),
  crime("night_vision_poach", "Night Vision Poach", "elite", ["HUNT", "THEFT"], ["sniper_rifle"]),
  crime("reserve_trespass", "Reserve Trespass", "medium", ["HUNT", "THEFT"], ["wooden_rifle"]),
  crime("stealth_trail_lift", "Stealth Trail Lift", "high", ["HUNT", "THEFT"], ["python_skin_cloak"]),
  crime("sniper_escape_route", "Sniper Escape Route", "elite", ["HUNT", "HEIST"], ["sniper_rifle"]),

  // Cock (~10)
  crime("fight_fix", "Fight Fix", "medium", ["COCK", "FIX"], ["iron_spurs"]),
  crime("spurs_smuggling", "Spurs Smuggling", "high", ["COCK", "SMUGGLE"], ["iron_spurs"]),
  crime("feed_racket", "Feed Racket", "petty", ["COCK", "FRAUD"], ["iron_spurs"]),
  crime("arena_gate_crash", "Arena Gate Crash", "medium", ["COCK", "THEFT"], ["guard_vest"]),
  crime("champion_doping", "Champion Doping Scandal", "high", ["COCK", "FIX"], ["guard_vest"]),
  crime("betting_ring_skim", "Betting Ring Skim", "elite", ["COCK", "FRAUD"], ["iron_spurs"]),
  crime("cockfight_heist", "Cockfight Heist", "high", ["COCK", "HEIST"], ["guard_vest"]),
  crime("underground_title_fraud", "Underground Title Fraud", "elite", ["COCK", "SCAM"], ["iron_spurs"]),
  crime("arena_security_bribe", "Arena Security Bribe", "medium", ["COCK", "FRAUD"], ["guard_vest"]),
  crime("blood_sport_launder", "Blood Sport Launder", "elite", ["COCK", "LAUNDER"], ["guard_vest"]),

  // Legendary (8)
  crime("bank_vault_heist", "Bank Vault Heist", "legendary", ["HEIST", "FRAUD"], ["eclipse_mask", "corporate_blessing", "sniper_rifle"]),
  crime("drug_pipeline_deal", "Drug Pipeline Deal", "legendary", ["NARCOTICS", "SMUGGLE"], ["lab_kit", "komodo_venom_flask", "iron_spurs"]),
  crime("armored_truck_hit", "Armored Truck Hit", "legendary", ["HEIST", "THEFT"], ["mechanic_toolkit", "wolf_fang_dagger", "guard_vest"]),
  crime("money_laundering_ring", "Money Laundering Ring", "legendary", ["LAUNDER", "FRAUD"], ["counterfeit_kit", "calculator_pro", "blackmarket_resume"]),
  crime("casino_backroom_skim", "Casino Backroom Skim", "legendary", ["FRAUD", "FIX"], ["lucky_coin", "iron_spurs", "legal_case_file"]),
  crime("port_smuggling_run", "Port Smuggling Run", "legendary", ["SMUGGLE", "NARCOTICS"], ["iron_rifle", "camouflage_kit", "mechanic_toolkit"]),
  crime("hostage_ransom_plot", "Hostage Ransom Plot", "legendary", ["SCAM", "HEIST"], ["legal_case_file", "sniper_rifle", "python_skin_cloak"]),
  crime("black_market_auction_raid", "Black Market Auction Raid", "legendary", ["SMUGGLE", "THEFT"], ["hunting_permit", "guard_vest", "thief_gloves"]),
];

const crimeByKey = new Map(CRIME_CATALOG.map((c) => [c.key, c]));

export function getCrimeByKey(key: string): CrimeDefinition | undefined {
  return crimeByKey.get(key);
}

export const STANDARD_CRIMES = CRIME_CATALOG.filter((c) => c.tier !== "legendary");
export const LEGENDARY_CRIMES = CRIME_CATALOG.filter((c) => c.tier === "legendary");
