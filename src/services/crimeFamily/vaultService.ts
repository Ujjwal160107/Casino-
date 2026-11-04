// The family vault (spec 7): the two-bucket spend, earnings credits and the
// arrears retry they trigger, member deposits, the daily dues charge and the
// S6 vault view. Every write here runs inside a runFamilyTx callback.
import type { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes, parsePositiveAmount } from "../../utils/format";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { debitWalletInTx } from "../walletService";
import { assertNotJailed, requireMembership } from "./familyQueries";
import { readLedgerPage, writeLedger, type LedgerType } from "./ledger";
import { can } from "./permissions";
import { FamilyError, runFamilyTx, VaultBusy, VaultShort } from "./tx";
import type { VaultView } from "./views";

const NOT_IN_FAMILY = "You are not in a crime family.";
const ALL_WORDS = /^(all|max|allin)$/i;

/** The UTC calendar day of d as "YYYY-MM-DD" (dues and deposit-cap days). */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** What the family owes for its missed dues days at its current level. */
function arrearsOwed(family: { duesArrears: number; level: number }): number {
  return family.duesArrears * CRIME_FAMILY_CONFIG.duesPerLevel * family.level;
}

/** What is left of a member's daily deposit cap on now's UTC day (P21). */
function depositLeftToday(member: { depositDayKey: string; depositedToday: number }, now: Date): number {
  const used = member.depositDayKey === utcDayKey(now) ? member.depositedToday : 0;
  return Math.max(0, CRIME_FAMILY_CONFIG.depositDailyCap - used);
}

const capReached = (left: number) => new FamilyError(`Daily deposit cap reached (${fmtFortunes(left)} left today).`);

/**
 * Spec 7.1: earnings first, then treasury, CAS on both buckets. Throws
 * VaultShort before any write, or VaultBusy when a concurrent spend won.
 */
export async function spendFromVault(
  tx: Prisma.TransactionClient, familyId: string, amount: number, type: LedgerType, actorId: string,
  meta: Record<string, unknown>, opts: { earningsOnly?: boolean } = {},
): Promise<{ fromTreasury: number; fromEarnings: number }> {
  const { treasury, earnings } = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { treasury: true, earnings: true } });
  const fromEarnings = Math.min(earnings, amount);
  const fromTreasury = amount - fromEarnings;
  if (fromTreasury > treasury || (opts.earningsOnly && fromTreasury > 0)) {
    throw new VaultShort(amount, opts.earningsOnly ? earnings : treasury + earnings);
  }
  const treasuryAfter = treasury - fromTreasury;
  const earningsAfter = earnings - fromEarnings;
  const { count } = await tx.family.updateMany({
    where: { id: familyId, treasury, earnings },
    data: { treasury: treasuryAfter, earnings: earningsAfter },
  });
  if (count !== 1) throw new VaultBusy();
  await writeLedger(tx, {
    familyId, actorId, type, amount: -amount, treasuryAfter, earningsAfter, meta: { ...meta, fromTreasury, fromEarnings },
  });
  return { fromTreasury, fromEarnings };
}

/**
 * Spec 7.4: pays every missed dues day from the vault and clears the arrears,
 * or returns false (nothing written) when the vault cannot cover them.
 */
export async function retryArrears(tx: Prisma.TransactionClient, familyId: string, actorId: string): Promise<boolean> {
  const family = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { duesArrears: true, level: true } });
  if (family.duesArrears <= 0) return false;
  try {
    await spendFromVault(tx, familyId, arrearsOwed(family), "dues", actorId, { arrearsDays: family.duesArrears });
  } catch (err) {
    if (err instanceof VaultShort) return false;
    throw err;
  }
  const { count } = await tx.family.updateMany({ where: { id: familyId, duesArrears: family.duesArrears }, data: { duesArrears: 0 } });
  if (count !== 1) throw new VaultBusy();
  return true;
}

/** Adds to the family's earnings (and XP, P13), then retries any dues arrears. */
export async function creditEarnings(
  tx: Prisma.TransactionClient, familyId: string, amount: number, type: LedgerType, actorId: string,
  meta: Record<string, unknown>, opts: { xp?: number } = {},
): Promise<{ earningsAfter: number; arrearsCleared: boolean }> {
  const xp = opts.xp ?? 0;
  const family = await tx.family.update({
    where: { id: familyId },
    data: { earnings: { increment: amount }, xp: { increment: xp } },
  });
  await writeLedger(tx, {
    familyId, actorId, type, amount, treasuryAfter: family.treasury, earningsAfter: family.earnings,
    meta: opts.xp !== undefined ? { ...meta, xp } : meta,
  });
  const arrearsCleared = await retryArrears(tx, familyId, actorId);
  if (!arrearsCleared) return { earningsAfter: family.earnings, arrearsCleared };
  const after = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { earnings: true } });
  return { earningsAfter: after.earnings, arrearsCleared };
}

/** The most `all`/`max`/`allin` deposits now: the wallet, clamped to what is left of today's cap (P21). */
export async function depositMaxFor(uid: string, now: Date): Promise<number> {
  const { member } = await requireMembership(uid);
  const wallet = await prisma.wallet.findUnique({ where: { userId: uid }, select: { balance: true } });
  return Math.max(0, Math.min(Math.floor(wallet?.balance ?? 0), depositLeftToday(member, now)));
}

/** The amount typed into the Deposit modal or `!crew deposit`; null means "Enter a positive amount like 250k or 5m". */
export async function resolveDepositAmount(uid: string, raw: string, now: Date): Promise<number | null> {
  if (ALL_WORDS.test(raw.trim())) return depositMaxFor(uid, now);
  return parsePositiveAmount(raw, Number.MAX_SAFE_INTEGER);
}

/**
 * Spec 7.2: wallet → treasury, 5% burned inline (never applyTransferTax, so
 * Tax Shield never applies), capped per member per UTC day by a CAS on the
 * member row. A refusal anywhere rolls the wallet debit back.
 */
export async function depositToVault(
  uid: string, amount: number, now: Date = new Date(),
): Promise<{ amount: number; tax: number; net: number; leftToday: number }> {
  const { family, member } = await requireMembership(uid);
  await assertNotJailed(uid);
  if (!Number.isInteger(amount)) throw new FamilyError("Deposit a whole number of fortunes.");
  const leftNow = depositLeftToday(member, now);
  if (leftNow === 0 || amount > leftNow) throw capReached(leftNow);
  if (amount < CRIME_FAMILY_CONFIG.depositMin) throw new FamilyError(`Minimum deposit is ${fmtFortunes(CRIME_FAMILY_CONFIG.depositMin)}.`);

  const tax = Math.floor(amount * CRIME_FAMILY_CONFIG.vaultTaxRate);
  const net = amount - tax;
  const today = utcDayKey(now);
  const cap = CRIME_FAMILY_CONFIG.depositDailyCap;

  const leftToday = await runFamilyTx(async (tx) => {
    await debitWalletInTx(tx, uid, amount, "family_vault_deposit", { familyId: family.id, tax });
    const row = await tx.familyMember.findUnique({ where: { userId: uid } });
    if (!row || row.familyId !== family.id) throw new FamilyError(NOT_IN_FAMILY);
    const sameDay = row.depositDayKey === today;
    const { count } = await tx.familyMember.updateMany({
      where: sameDay
        ? { id: row.id, familyId: family.id, depositDayKey: today, depositedToday: { lte: cap - amount } }
        : { id: row.id, familyId: family.id, depositDayKey: row.depositDayKey },
      data: sameDay
        ? { depositedToday: { increment: amount }, deposited: { increment: amount } }
        : { depositDayKey: today, depositedToday: amount, deposited: { increment: amount } },
    });
    if (count !== 1) {
      const fresh = await tx.familyMember.findUnique({ where: { userId: uid } });
      if (!fresh || fresh.familyId !== family.id) throw new FamilyError(NOT_IN_FAMILY);
      throw capReached(depositLeftToday(fresh, now));
    }
    const updated = await tx.family.update({ where: { id: family.id }, data: { treasury: { increment: net } } });
    await writeLedger(tx, {
      familyId: family.id, actorId: uid, type: "deposit", amount: net, treasuryAfter: updated.treasury, earningsAfter: updated.earnings,
    });
    await writeLedger(tx, {
      familyId: family.id, actorId: uid, type: "deposit_tax", amount: 0, treasuryAfter: updated.treasury, earningsAfter: updated.earnings,
      meta: { burned: tax },
    });
    await retryArrears(tx, family.id, uid);
    return (sameDay ? cap - row.depositedToday : cap) - amount;
  });
  return { amount, tax, net, leftToday };
}

/**
 * Spec 7.4, once per UTC day (the duesDayKey CAS): 40,000 × level from the
 * vault, or one more day of arrears when the vault cannot cover it.
 */
export async function chargeDues(familyId: string, now: Date): Promise<{ status: "charged" | "missed" | "skipped"; firstMiss: boolean }> {
  const today = utcDayKey(now);
  return runFamilyTx(async (tx) => {
    const { count } = await tx.family.updateMany({ where: { id: familyId, duesDayKey: { not: today } }, data: { duesDayKey: today } });
    if (count !== 1) return { status: "skipped" as const, firstMiss: false };
    const { level } = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { level: true } });
    const dues = CRIME_FAMILY_CONFIG.duesPerLevel * level;
    try {
      await spendFromVault(tx, familyId, dues, "dues", "system", { day: today });
      return { status: "charged" as const, firstMiss: false };
    } catch (err) {
      if (!(err instanceof VaultShort)) throw err;
    }
    const missed = await tx.family.update({ where: { id: familyId }, data: { duesArrears: { increment: 1 } } });
    await writeLedger(tx, {
      familyId, actorId: "system", type: "dues_missed", amount: 0, treasuryAfter: missed.treasury, earningsAfter: missed.earnings,
      meta: { day: today, dues },
    });
    return { status: "missed" as const, firstMiss: missed.duesArrears === 1 };
  });
}

/** S6: the only screen with vault amounts (D59). */
export async function getVaultView(familyId: string, viewerId: string, now: Date): Promise<VaultView> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  const [viewer, ledger] = await Promise.all([
    prisma.familyMember.findUnique({ where: { userId: viewerId } }),
    readLedgerPage(familyId, 0, CRIME_FAMILY_CONFIG.vaultLedgerLines),
  ]);
  const officer = !!viewer && viewer.familyId === familyId
    && can({ role: viewer.role as FamilyRole, joinedAt: viewer.joinedAt }, "payday", now);
  return {
    familyId: family.id,
    tag: family.tag,
    treasury: family.treasury,
    earnings: family.earnings,
    level: family.level,
    duesPerDay: CRIME_FAMILY_CONFIG.duesPerLevel * family.level,
    duesArrears: family.duesArrears,
    arrearsOwed: arrearsOwed(family),
    lastPaydayAt: family.lastPaydayAt,
    nextPaydayAt: new Date(family.lastPaydayAt.getTime() + CRIME_FAMILY_CONFIG.paydayIntervalSeconds * 1000),
    ledger: ledger.rows,
    canOfficer: officer,
  };
}
