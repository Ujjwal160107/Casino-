import { GLOBAL_CURRENCY_EMOJI, GLOBAL_CURRENCY_NAME } from "../config/branding";
import {
  BANKING_CONFIG,
  DEFAULT_JAIL_FINE,
  DEFAULT_JAIL_TIME_SECONDS,
  DEFAULT_STUDY_COOLDOWN_SECONDS,
  MAX_SAFE_BALANCE,
  ROB_CONFIG,
  STARTING_WALLET_BALANCE
} from "../utils/economyConfig";
import { getGuildSettings, updateGuildSettings } from "./guildSettingsService";

export interface LegacyGuildConfig {
  guildId: string;
  prefix: string;
  currencyName: string;
  currencyEmoji: string;
  startMoney: number;
  transferTax: number;
  incomeTax: number;
  bankLimit: number;
  walletLimit: number;
  interestRate: number;
  robSuccessPct: number;
  robFinePct: number;
  robCooldown: number;
  robImmuneRoles: string[];
  marriageEnabled: boolean;
  marriageCost: number;
  divorceCost: number;
  marriageCooldown: number;
  jailFine: number;
  jailTime: number;
  minBet: number;
  maxBet: number;
  marketTax: number;
  rouletteSpinTime: number;
  gameBetLimits: Record<string, { min?: number; max?: number }>;
  cockfightBetTime: number;
  chickenTrainBaseCost: number;
  chickenTrainMultiplier: number;
  chickenHealCost: number;
  studyCooldown: number;
  gymCost: number;
  meditationCost: number;
  vacationCost: number;
  logChannelId: string | null;
  disabledCommands: string[];
  creditConfig: unknown[];
  gameCooldowns: Record<string, number>;
  jobSectorBasePay: Record<string, number>;
  jobLevelMultipliers: Record<string, number>;
  jobShiftReqs: Record<string, number>;
  jobCooldown: number;
  stockRefreshRate: number;
  loanInterestRate: number;
  fdInterestRate: number;
  rdInterestRate: number;
  minCreditScore: number;
  maxCreditScore: number;
  creditScoreReward: number;
  creditScorePenalty: number;
  maxActiveLoans: number;
}

function buildLegacyGuildConfig(guildId: string, prefix: string): LegacyGuildConfig {
  return {
    guildId,
    prefix,
    currencyName: GLOBAL_CURRENCY_NAME,
    currencyEmoji: GLOBAL_CURRENCY_EMOJI,
    startMoney: STARTING_WALLET_BALANCE,
    transferTax: 0,
    incomeTax: 0,
    bankLimit: MAX_SAFE_BALANCE,
    walletLimit: MAX_SAFE_BALANCE,
    interestRate: 0,
    robSuccessPct: Math.round(ROB_CONFIG.successRate * 100),
    robFinePct: 20,
    robCooldown: ROB_CONFIG.cooldownSeconds,
    robImmuneRoles: [],
    marriageEnabled: true,
    marriageCost: 0,
    divorceCost: 0,
    marriageCooldown: 0,
    jailFine: DEFAULT_JAIL_FINE,
    jailTime: DEFAULT_JAIL_TIME_SECONDS,
    minBet: 10_000,
    maxBet: 1_000_000,
    marketTax: 0,
    rouletteSpinTime: 4,
    gameBetLimits: {},
    cockfightBetTime: 60,
    chickenTrainBaseCost: 500,
    chickenTrainMultiplier: 0.5,
    chickenHealCost: 500,
    studyCooldown: DEFAULT_STUDY_COOLDOWN_SECONDS,
    gymCost: 75_000,
    meditationCost: 150_000,
    vacationCost: 350_000,
    logChannelId: null,
    disabledCommands: [],
    creditConfig: [],
    gameCooldowns: {},
    jobSectorBasePay: {},
    jobLevelMultipliers: {},
    jobShiftReqs: {},
    jobCooldown: 3600,
    stockRefreshRate: 3600,
    loanInterestRate: BANKING_CONFIG.loanInterestRate,
    fdInterestRate: BANKING_CONFIG.fdInterestRate,
    rdInterestRate: BANKING_CONFIG.rdInterestRate,
    minCreditScore: BANKING_CONFIG.minCreditScore,
    maxCreditScore: BANKING_CONFIG.maxCreditScore,
    creditScoreReward: BANKING_CONFIG.creditScoreReward,
    creditScorePenalty: BANKING_CONFIG.creditScorePenalty,
    maxActiveLoans: BANKING_CONFIG.maxActiveLoans
  };
}

export async function getGuildConfig(guildId: string): Promise<LegacyGuildConfig> {
  const settings = await getGuildSettings(guildId);
  return buildLegacyGuildConfig(guildId, settings.prefix);
}

export async function updateGuildConfig(guildId: string, data: Partial<LegacyGuildConfig>) {
  const prefix = typeof data.prefix === "string" && data.prefix.trim() ? data.prefix : undefined;

  if (prefix) {
    const settings = await updateGuildSettings(guildId, { prefix });
    return buildLegacyGuildConfig(guildId, settings.prefix);
  }

  const settings = await getGuildSettings(guildId);
  return buildLegacyGuildConfig(guildId, settings.prefix);
}
