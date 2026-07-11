export const STARTING_WALLET_BALANCE = 1_000;
export const DEFAULT_JAIL_FINE = 1_000;
export const DEFAULT_JAIL_TIME_SECONDS = 600;
export const DEFAULT_STUDY_COOLDOWN_SECONDS = 300;

export const GAME_UI_TIMINGS = {
  cockfightBetSeconds: 60,
  rouletteSpinSeconds: 4,
} as const;

export const MARRIAGE_CONFIG = {
  enabled: true,
  cost: 0,
  divorceCost: 0,
  cooldownSeconds: 0,
} as const;

export const TIME_GATED_REWARDS = {
  daily: {
    commandName: "daily",
    amount: 100_000,
    cooldownSeconds: 24 * 60 * 60
  },
  weekly: {
    commandName: "weekly",
    amount: 800_000,
    cooldownSeconds: 7 * 24 * 60 * 60
  },
  monthly: {
    commandName: "monthly",
    amount: 4_000_000,
    cooldownSeconds: 30 * 24 * 60 * 60
  }
} as const;

export const GAME_BET_LIMITS = {
  defaultMin: 10_000,
  defaultMax: 1_000_000,
  perGameMax: {
    coinflip: 500_000,
    slots: 750_000,
    blackjack: 1_000_000,
    roulette: 1_000_000,
    russian_roulette: 750_000,
    rr: 750_000,
    cockfight: 1_000_000,
    chicken: 1_000_000,
  },
} as const;

export const DEGREE_PRICES = {
  highSchoolDiploma: 150_000,
  tradeLicense: 300_000,
  baFineArts: 900_000,
  bsComputerScience: 1_200_000,
  llb: 2_500_000,
  mbbs: 4_000_000,
  llm: 6_000_000,
  mdPhd: 10_000_000
} as const;

export const DEFAULT_JOB_PAYS = {
  deliveryDriver: 30_000,
  waiter: 32_000,
  freelanceWriter: 35_000,
  streamer: 35_000,
  sousChef: 45_000,
  apprenticeMechanic: 50_000,
  masterMechanic: 90_000,
  salesIntern: 35_000,
  financialAnalyst: 120_000,
  salesManager: 180_000,
  itIntern: 45_000,
  juniorDeveloper: 130_000,
  seniorDeveloper: 210_000,
  leadEngineer: 280_000,
  paralegal: 140_000,
  associateAttorney: 260_000,
  partner: 400_000,
  medicalResident: 150_000,
  generalPractitioner: 220_000,
  surgeon: 320_000,
  chiefOfMedicine: 450_000
} as const;

export const GRINDING_COMMANDS = {
  beg: {
    commandName: "beg",
    cooldownSeconds: 45,
    winRate: 0.7,
    payoutMin: 8_000,
    payoutMax: 15_000
  },
  slut: {
    commandName: "slut",
    cooldownSeconds: 120,
    winRate: 0.55,
    payoutMin: 12_000,
    payoutMax: 22_000
  },
  crime: {
    commandName: "crime",
    cooldownSeconds: 3600,
    winRate: 0.35,
    payoutMin: 100_000,
    payoutMax: 220_000,
    fineMin: 60_000,
    fineMax: 140_000
  }
} as const;

export const ROB_CONFIG = {
  cooldownSeconds: 3600,       // 1 hour
  successRate: 0.40,           // 40% base success / 60% failure
  stealPctMin: 0.08,
  stealPctMax: 0.20,
  // Fine on failure is always a multiple of what this specific attempt would
  // have stolen, so getting caught costs strictly more than succeeding would
  // have earned. failFineMinimum floors it when the target is nearly broke.
  failFineMultiplier: 1.5,
  failFineMinimum: 60_000,
} as const;

export const RELAX_OPTIONS = {
  quick_break: {
    id: "quick_break",
    name: "Quick Break",
    cost: 25_000,
    jobStressReduction: 8,
    educationStressReduction: 8
  },
  gym_session: {
    id: "gym_session",
    name: "Gym Session",
    cost: 75_000,
    jobStressReduction: 20,
    educationStressReduction: 15
  },
  meditation_retreat: {
    id: "meditation_retreat",
    name: "Meditation Retreat",
    cost: 150_000,
    jobStressReduction: 35,
    educationStressReduction: 35
  },
  weekend_getaway: {
    id: "weekend_getaway",
    name: "Weekend Getaway",
    cost: 350_000,
    jobStressReduction: 75,
    educationStressReduction: 60
  }
} as const;

export type RelaxOptionId = keyof typeof RELAX_OPTIONS;
export type RelaxOption = typeof RELAX_OPTIONS[RelaxOptionId];

export const RELAX_OPTION_ORDER: RelaxOptionId[] = [
  "quick_break",
  "gym_session",
  "meditation_retreat",
  "weekend_getaway"
];

export function clampStress(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function getRelaxOption(optionId: string): RelaxOption | null {
  return RELAX_OPTIONS[optionId as RelaxOptionId] ?? null;
}

export const MAX_SAFE_BALANCE = 9_000_000_000_000_000;

export const TAX_CONFIG = {
  incomeTaxRate: 0.08,          // 8% on weekly, monthly, work shifts
  transferTaxRate: 0.05,        // 5% fee on P2P wallet transfers
  crimeHeatGain: 20,            // Heat added per successful crime
  raidHeatThreshold: 100,       // Heat that enables raid rolls in scanner
  autoRaidChancePct: 0.40,      // 40% chance of raid per hourly scan
  raidSeizurePctMin: 0.10,      // Seize 10–25% of wallet
  raidSeizurePctMax: 0.25,
  heatDecayPerHour: 10,         // Heat lost per hour during scan
  heatTtlSeconds: 72 * 3600,    // Redis key expires after 72h of no crime
} as const;

export const BANKING_CONFIG = {
  fdInterestRate: 10,
  rdInterestRate: 8
} as const;

export const CARD_SCORE_RULES = {
  payMinimumOnTime: 20,
  payFullStatement: 30,
  missPayment: -45,
  repeatMiss: -60,
  minScore: 300,
  maxScore: 850
} as const;

export const CARD_TIERS = {
  STARTER: {
    tier: "STARTER",
    reqScore: 300,
    reqCareerTier: 0,
    creditLimit: 1_500_000,
    weeklyInterestPct: 12,
    minimumDuePct: 12,
    minimumDueFloor: 75_000,
    weeklySpendCap: 750_000,
    weeklyWithdrawCap: 250_000
  },
  GOLD: {
    tier: "GOLD",
    reqScore: 500,
    reqCareerTier: 2,
    creditLimit: 6_000_000,
    weeklyInterestPct: 8,
    minimumDuePct: 12,
    minimumDueFloor: 150_000,
    weeklySpendCap: 3_000_000,
    weeklyWithdrawCap: 1_000_000
  },
  PLATINUM: {
    tier: "PLATINUM",
    reqScore: 700,
    reqCareerTier: 3,
    creditLimit: 20_000_000,
    weeklyInterestPct: 5,
    minimumDuePct: 12,
    minimumDueFloor: 400_000,
    weeklySpendCap: 10_000_000,
    weeklyWithdrawCap: 3_000_000
  },
  BLACK: {
    tier: "BLACK",
    reqScore: 850,
    reqCareerTier: 4,
    creditLimit: 60_000_000,
    weeklyInterestPct: 3,
    minimumDuePct: 12,
    minimumDueFloor: 1_000_000,
    weeklySpendCap: 25_000_000,
    weeklyWithdrawCap: 8_000_000
  }
} as const;

export type CardTierName = keyof typeof CARD_TIERS;
export type CardTierConfig = typeof CARD_TIERS[CardTierName];

export const CARD_TIER_ORDER: CardTierName[] = ["STARTER", "GOLD", "PLATINUM", "BLACK"];

export function clampCardScore(score: number) {
  return Math.min(Math.max(score, CARD_SCORE_RULES.minScore), CARD_SCORE_RULES.maxScore);
}

export function calculateMinimumDue(statementBalance: number, tier: CardTierConfig) {
  if (statementBalance <= 0) return 0;
  return Math.max(Math.ceil(statementBalance * (tier.minimumDuePct / 100)), tier.minimumDueFloor);
}

export function getCardTierConfig(tier: string): CardTierConfig {
  return CARD_TIERS[(tier.toUpperCase() as CardTierName)] ?? CARD_TIERS.STARTER;
}

export function getEligibleCardTier(user: { creditScore: number }, careerTier: number): CardTierConfig | null {
  const tiers = [CARD_TIERS.BLACK, CARD_TIERS.PLATINUM, CARD_TIERS.GOLD, CARD_TIERS.STARTER];
  return tiers.find((tier) => user.creditScore >= tier.reqScore && careerTier >= tier.reqCareerTier) ?? null;
}

export function getCycleKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const firstDay = Date.UTC(year, 0, 1);
  const currentDay = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const week = Math.floor((currentDay - firstDay) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-W${week.toString().padStart(2, "0")}`;
}
