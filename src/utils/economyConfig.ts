export const STARTING_WALLET_BALANCE = 1_000;
export const DEFAULT_JAIL_FINE = 1_000;
export const DEFAULT_JAIL_TIME_SECONDS = 600;
export const DEFAULT_STUDY_COOLDOWN_SECONDS = 1800;
export const STUDY_DAILY_CAP = 16;

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
  deliveryDriver: 50_000,
  waiter: 55_000,
  freelanceWriter: 55_000,
  streamer: 55_000,
  sousChef: 75_000,
  apprenticeMechanic: 80_000,
  masterMechanic: 120_000,
  salesIntern: 65_000,
  financialAnalyst: 120_000,
  salesManager: 180_000,
  itIntern: 70_000,
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
    cooldownSeconds: 60,
    winRate: 0.7,
    payoutMin: 5_000,
    payoutMax: 10_000
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
  crimeHeatGain: 20,            // Base heat added per successful crime (tier multipliers apply)
  robSuccessHeatGain: 15,
  robFailureHeatGain: 10,
  raidHeatThreshold: 100,       // Heat that enables raid rolls in scanner
  autoRaidChancePct: 0.40,      // 40% chance of raid per hourly scan
  raidSeizurePctMin: 0.10,      // Seize 10–25% of wallet
  raidSeizurePctMax: 0.25,
  heatDecayPerHour: 10,         // Heat lost per hour during scan
  layLowHeatReduction: 15,
  layLowCooldownSeconds: 6 * 60 * 60,
  fixerHeatReduction: 35,
  fixerCooldownSeconds: 12 * 60 * 60,
  fixerMinimumHeat: 40,
  fixerMinimumFee: 150_000,
  fixerFeePerHeat: 4_000,
  heatTtlSeconds: 72 * 3600,    // Redis key expires after 72h of no crime
} as const;

// Crime Families (spec 19.2). Declared after TAX_CONFIG because it reads
// transferTaxRate. Tiers, roles, rackets, levels and gates live in
// src/data/crimeFamilyCatalog.ts.
export const CRIME_FAMILY_CONFIG = {
  enabled: false,
  turfEnabled: false,
  allowGuildIds: null as string[] | null, // null = every guild
  createFee: 10_000_000,
  renameFee: 2_000_000,
  duesPerLevel: 40_000,
  depositMin: 10_000,
  depositDailyCap: 25_000_000,
  vaultTaxRate: TAX_CONFIG.transferTaxRate, // 0.05, applied inline on deposit and payday
  paydayMinEarnings: 500_000,
  paydayGrossCap: 1_000_000,
  paydayIntervalSeconds: 604_800,
  autoPaydayGraceSeconds: 86_400,
  inviteTtlSeconds: 86_400,
  lobbySeconds: 600,
  goSeconds: 120,
  leakAtSecondsLeft: 30,
  heatPenaltyPerPoint: 0.002,
  patrolCap: 0.60,
  seatsPer24h: 2,
  capersPerFamilyPer24h: 4,
  cancelledLobbyCooldownSeconds: 1_800,
  lobbyDmsPer24h: 3,
  lobbyDmQuietAfterCancelSeconds: 7_200,
  caperWindowSeconds: 86_400, // rolling window of the seat and family caper counts
  caperRenderDebounceSeconds: 2,
  caperEndedRerenderSeconds: 120,
  caperDeadResultRepostSeconds: 3_600,
  caperTradeLogMinPool: 5_000_000,
  caperSettleDelayMs: 1_000,
  activeCaperSeats: 2, // 7.3: caper seats in the window that make a member active
  bidFloorDays: 7,
  warLateCancelSeconds: 600,
  hitCost: 25_000,
  hitCooldownSeconds: 600,
  hitsPerWar: 6,
  hitAnswerSeconds: 20,
  scoutSlotSeconds: 300,
  warMinutes: 60,
  blackoutSeconds: 600,
  renameCooldownSeconds: 2_592_000,
  maxPendingInvites: 5,
  acceptedInvitesPerInviterPer7d: 3,
  joinsPerFamilyPer7d: 5,
  associateSeconds: 259_200,
  claimChairAfterSeconds: 604_800,
  autoHandoverAfterSeconds: 1_209_600,
  hopCooldownSeconds: { LEFT: 259_200, KICKED: 86_400, DISBANDED: 86_400 },
  refoundAfterBossDisbandSeconds: 604_800,
  rejoinSameFamilySeconds: 1_209_600,
  activityThrottleSeconds: 3_600,
  ledgerPageSize: 15,
  vaultLedgerLines: 10,
  underInvestigationHeat: 100,
  underInvestigationMembers: 3,
  maxLevel: 10,
} as const;

/** Whether !crew, creation and invites are open in this guild (sweepers and payouts ignore it). */
export function isCrimeFamilyOpen(guildId: string | null | undefined): boolean {
  const { enabled, allowGuildIds } = CRIME_FAMILY_CONFIG;
  return enabled && !!guildId && (allowGuildIds === null || allowGuildIds.includes(guildId));
}

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

/** Does a card of `cardTier` satisfy a `minTier` requirement? Unknown tiers rank as Starter. */
export function cardTierMeets(cardTier: string, minTier: CardTierName): boolean {
  const have = CARD_TIER_ORDER.indexOf(getCardTierConfig(cardTier).tier);
  return have >= CARD_TIER_ORDER.indexOf(minTier);
}

/** "GOLD" → "Gold". Display form only; data and service errors keep the uppercase enum. */
export function formatCardTierName(tier: string): string {
  return tier
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
