import { randomBytes } from "crypto";
import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import {
  CrimeDefinition,
  CRIME_CATALOG,
  getCrimeByKey,
  LEGENDARY_CRIMES,
  STANDARD_CRIMES,
} from "../data/crimeCatalog";
import { getCrimePrepItem } from "../data/crimePrepWhitelist";
import { getStageCountForTier } from "../data/crimeMinigameCatalog";
import { checkCrownOfGreed, checkDevilContract, recordPotentialSoulLedgerLoss } from "./shopBuffs";
import { addCrimeHeat, getHeatLevel } from "./taxService";
import { addBalance, removeBalance } from "./walletService";
import { jailUser } from "./jailService";
import { TAX_CONFIG } from "../utils/economyConfig";
import { fmtCurrency } from "../utils/format";
import { Mascot } from "../config/branding";

const SESSION_TTL = 600;
const SESSION_KEY = (userId: string) => `crime_session:${userId}`;
const LAST_RESULT_KEY = (userId: string) => `crime_last_result:${userId}`;

export interface CrimeSession {
  sessionId: string;
  ownerId: string;
  crimeKeys: string[];
  createdAt: number;
}

export interface CrimePreview {
  stageCount: number;
  payoutMin: number;
  payoutMax: number;
  payoutBonus: number;
}

export interface CrimeExecuteResult {
  success: boolean;
  crime: CrimeDefinition;
  message: string;
  appliedAmount: number;
  newBalance: number;
  jailed: boolean;
  jailReleaseAt?: Date;
  heat?: number;
  capped?: boolean;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomMessage(messages: string[], amount?: number) {
  const message = messages[Math.floor(Math.random() * messages.length)];
  return amount === undefined ? message : message.replace("{amount}", fmtCurrency(amount));
}

function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function getOwnedPrepKeys(userId: string): Promise<Set<string>> {
  const rows = await prisma.inventory.findMany({
    where: { userId, amount: { gt: 0 } },
    include: { shopItem: true },
  });
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.shopItem.catalogKey) keys.add(row.shopItem.catalogKey);
    const meta = row.meta as { key?: string } | null;
    if (meta?.key) keys.add(meta.key);
  }
  return keys;
}

export function isCrimePlayableWithKeys(crime: CrimeDefinition, owned: Set<string>): boolean {
  return crime.requiredItems.every((k) => owned.has(k));
}

export async function isCrimePlayable(userId: string, crimeKey: string): Promise<boolean> {
  const crime = getCrimeByKey(crimeKey);
  if (!crime) return false;
  const owned = await getOwnedPrepKeys(userId);
  return isCrimePlayableWithKeys(crime, owned);
}

export function getMissingRequiredItemsForCrime(crime: CrimeDefinition, owned: Set<string>): string[] {
  return crime.requiredItems.filter((k) => !owned.has(k));
}

export function getMissingRequiredItemNames(crime: CrimeDefinition, owned: Set<string>): string[] {
  return getMissingRequiredItemsForCrime(crime, owned).map((k) => getCrimePrepItem(k)?.name ?? k);
}

export function rollCrimeBoard(owned: Set<string>): string[] {
  const playableStandard = STANDARD_CRIMES.filter((c) => isCrimePlayableWithKeys(c, owned));
  const lockedStandard = STANDARD_CRIMES.filter((c) => !isCrimePlayableWithKeys(c, owned));

  const board: string[] = [];

  if (Math.random() < 0.05 && LEGENDARY_CRIMES.length > 0) {
    board.push(weightedPick(LEGENDARY_CRIMES).key);
  }

  const slotsLeft = () => 5 - board.length;
  const pickCount = Math.min(2, playableStandard.length, slotsLeft());
  const shuffledPlayable = shuffle(playableStandard);
  for (let i = 0; i < pickCount; i++) {
    board.push(shuffledPlayable[i].key);
  }

  while (slotsLeft() > 0) {
    const pool = [...playableStandard.filter((c) => !board.includes(c.key)), ...lockedStandard];
    if (pool.length === 0) break;
    const pick = weightedPick(pool);
    if (!board.includes(pick.key)) board.push(pick.key);
    else {
      const fallback = pool.find((c) => !board.includes(c.key));
      if (!fallback) break;
      board.push(fallback.key);
    }
  }

  while (board.length < 5 && CRIME_CATALOG.length > 0) {
    const extra = weightedPick(CRIME_CATALOG.filter((c) => !board.includes(c.key)));
    board.push(extra.key);
  }

  return shuffle(board.slice(0, 5));
}

export async function createCrimeSession(userId: string): Promise<CrimeSession> {
  const owned = await getOwnedPrepKeys(userId);
  const session: CrimeSession = {
    sessionId: randomBytes(8).toString("hex"),
    ownerId: userId,
    crimeKeys: rollCrimeBoard(owned),
    createdAt: Date.now(),
  };
  await redisService.set(SESSION_KEY(userId), session, SESSION_TTL);
  return session;
}

export async function getCrimeSession(userId: string): Promise<CrimeSession | null> {
  return redisService.get<CrimeSession>(SESSION_KEY(userId));
}

export async function getOrCreateCrimeSession(userId: string): Promise<CrimeSession> {
  const existing = await getCrimeSession(userId);
  if (existing) return existing;
  return createCrimeSession(userId);
}

export async function clearCrimeSession(userId: string): Promise<void> {
  await redisService.del(SESSION_KEY(userId));
}

export function sumPrepBonuses(requiredKeys: string[]) {
  let successBonus = 0;
  let payoutBonus = 0;
  let fineGuard = 0;
  for (const key of requiredKeys) {
    const prep = getCrimePrepItem(key);
    if (!prep) continue;
    successBonus += prep.successBonus;
    payoutBonus += prep.payoutBonus;
    if (prep.failFineGuard) fineGuard = Math.max(fineGuard, prep.failFineGuard);
  }
  return { successBonus, payoutBonus, fineGuard };
}

export async function computeCrimePreview(_userId: string, crime: CrimeDefinition): Promise<CrimePreview> {
  const { payoutBonus } = sumPrepBonuses(crime.requiredItems);
  const payoutMult = 1 + payoutBonus;
  return {
    stageCount: getStageCountForTier(crime.tier),
    payoutMin: Math.floor(crime.payoutMin * payoutMult),
    payoutMax: Math.floor(crime.payoutMax * payoutMult),
    payoutBonus,
  };
}

function jailRollForTier(tier: CrimeDefinition["tier"]): { chance: number; seconds: number } | null {
  switch (tier) {
    case "high":
      return { chance: 0.10, seconds: 1200 };
    case "elite":
      return { chance: 0.20, seconds: 2700 };
    case "legendary":
      return { chance: 0.35, seconds: 3600 };
    default:
      return null;
  }
}

export async function resolveCrimeSuccess(
  userId: string,
  username: string,
  crimeKey: string,
  _guildId: string,
): Promise<CrimeExecuteResult> {
  const crime = getCrimeByKey(crimeKey);
  if (!crime) throw new Error("Unknown crime.");

  const owned = await getOwnedPrepKeys(userId);
  if (!isCrimePlayableWithKeys(crime, owned)) {
    throw new Error("You no longer own all required gear for this crime.");
  }

  const { payoutBonus } = sumPrepBonuses(crime.requiredItems);
  const crownMult = await checkCrownOfGreed(userId);
  const devilReduction = await checkDevilContract(userId);
  const payoutMult = 1 + payoutBonus;
  const amount = Math.floor(randomInt(crime.payoutMin, crime.payoutMax) * payoutMult * crownMult * devilReduction);
  const result = await addBalance(userId, username, amount, "crime_income", { command: "crime", crimeKey }, true);

  await addCrimeHeat(userId);
  const heat = await getHeatLevel(userId);

  let msg = randomMessage(crime.winMessages, result.appliedAmount);
  if (result.capped) {
    msg += "\n\nYour wallet is at the maximum balance limit, so part of this payout was withheld.";
  }
  if (heat >= TAX_CONFIG.raidHeatThreshold * 0.7) {
    msg += "\n\nYour activity is drawing attention...";
  }

  await clearCrimeSession(userId);
  await redisService.set(
    LAST_RESULT_KEY(userId),
    { crimeKey, crimeName: crime.name, success: true, amount: result.appliedAmount },
    86400,
  );

  return {
    success: true,
    crime,
    message: msg,
    appliedAmount: result.appliedAmount,
    newBalance: result.newBalance,
    jailed: false,
    heat,
    capped: result.capped,
  };
}

export async function resolveCrimeFailure(
  userId: string,
  username: string,
  crimeKey: string,
  guildId: string,
): Promise<CrimeExecuteResult> {
  const crime = getCrimeByKey(crimeKey);
  if (!crime) throw new Error("Unknown crime.");

  const { fineGuard } = sumPrepBonuses(crime.requiredItems);
  const baseFine = randomInt(crime.fineMin, crime.fineMax);
  const crownLoss = await checkCrownOfGreed(userId);
  let fine = Math.floor(baseFine * crownLoss);
  let guardNote = "";

  if (fineGuard > 0 && Math.random() < fineGuard) {
    fine = Math.floor(fine * 0.5);
    guardNote = `\n\n${Mascot.Emotes.Bandaid} Your Fox Tail Talisman softened the fine by 50%.`;
  }

  const result = await removeBalance(userId, fine, "crime_fine", { command: "crime", crimeKey });
  await recordPotentialSoulLedgerLoss(userId, result.removedAmount);

  let jailed = false;
  let jailReleaseAt: Date | undefined;
  const jailCfg = jailRollForTier(crime.tier);
  if (jailCfg && Math.random() < jailCfg.chance) {
    jailReleaseAt = await jailUser(userId, guildId, jailCfg.seconds);
    jailed = true;
  }

  const baseDescription = result.removedAmount > 0
    ? randomMessage(crime.failMessages, result.removedAmount)
    : "You found the target, but walked away empty-handed.";
  let description = result.removedAmount < fine
    ? `${baseDescription}\n\nYou could not cover the full ${fmtCurrency(fine)} penalty, so your wallet was drained to zero.${guardNote}`
    : `${baseDescription}${guardNote}`;

  if (jailed && jailReleaseAt) {
    description += `\n\n${Mascot.Emotes.Lock} You were arrested. Use \`,bail\` or wait until <t:${Math.floor(jailReleaseAt.getTime() / 1000)}:R>.`;
  }

  await clearCrimeSession(userId);
  await redisService.set(
    LAST_RESULT_KEY(userId),
    { crimeKey, crimeName: crime.name, success: false, amount: result.removedAmount, jailed },
    86400,
  );

  return {
    success: false,
    crime,
    message: description,
    appliedAmount: result.removedAmount,
    newBalance: result.newBalance,
    jailed,
    jailReleaseAt,
  };
}

export async function getLastCrimeResult(userId: string): Promise<{
  crimeName: string;
  success: boolean;
  amount: number;
  jailed?: boolean;
} | null> {
  return redisService.get(LAST_RESULT_KEY(userId));
}

export function tierLabel(tier: CrimeDefinition["tier"]): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
