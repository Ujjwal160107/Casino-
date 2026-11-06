// Payday (spec 7.3, amendment 2.4): the only way vault money reaches a wallet.
// An equal, capped, taxed split of earnings to the members who pass the payday
// gate, in two phases: one transaction reserves the whole payday and writes a
// PaydayShare per member, then each share is credited in its own small
// transaction behind a paid:false → true CAS. Manual (Boss or Underboss),
// automatic ("system") and disband's final payday all reserve through
// reservePaydayInTx and pay through payPaydayShares; the minute job pays any
// share a crash left behind.
import type { Family, PaydayShare, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { afterEarnedCredit, creditWalletInTx, type CreditResult } from "../walletService";
import { checkMemberEligibility } from "./eligibility";
import { listMembers } from "./familyQueries";
import { writeLedger } from "./ledger";
import { creditEarnings } from "./vaultService";
import { can } from "./permissions";
import { FamilyError, runFamilyTx } from "./tx";
import type { PaydayPreview } from "./views";

export type Split = { gross: number; tax: number; net: number };
/** One credited share: what the member was owed and what their wallet took. */
export type PaidShare = { userId: string; familyId: string; gross: number; tax: number; net: number; credit: CreditResult };
type ChangedReason = "Members changed." | "Earnings changed." | "Payday is not due yet.";

export type PaydayPaid = {
  status: "paid"; family: Family; split: Split; runKey: string; paid: PaidShare[]; ineligible: PaydayPreview["ineligible"];
};
export type PaydayResult = PaydayPaid | { status: "changed"; reason: ChangedReason; preview: PaydayPreview };

const PAYDAY_ATTEMPTS = 5;
const ONLY_OFFICERS = "Only the Boss or Underboss can run payday.";

/** Pure: gross = min(floor(E / N), paydayGrossCap), tax = floor(gross × vaultTaxRate). */
export function splitPayday(earnings: number, count: number): Split {
  if (count <= 0) return { gross: 0, tax: 0, net: 0 };
  const gross = Math.min(Math.floor(earnings / count), CRIME_FAMILY_CONFIG.paydayGrossCap);
  const tax = Math.floor(gross * CRIME_FAMILY_CONFIG.vaultTaxRate);
  return { gross, tax, net: gross - tax };
}

/** Splits members by the payday gate; an ineligible member's reason is their first failing check. */
export async function evaluatePaydayMembers(userIds: string[], now: Date): Promise<{ eligible: string[]; ineligible: PaydayPreview["ineligible"] }> {
  const results = await Promise.all(userIds.map((uid) => checkMemberEligibility(uid, "payday", { now })));
  const eligible: string[] = [];
  const ineligible: PaydayPreview["ineligible"] = [];
  results.forEach((r, i) => {
    if (r.ok) eligible.push(userIds[i]);
    else ineligible.push({ userId: userIds[i], reason: `${r.failures[0].need} (you have ${r.failures[0].have})`, need: r.failures[0].need });
  });
  return { eligible, ineligible };
}

/** Why manual and auto payday are locked, or null. Disband's final payday skips the minimum (D61). */
function lockedReasonFor(earnings: number, eligibleCount: number): string | null {
  if (earnings < CRIME_FAMILY_CONFIG.paydayMinEarnings) return `Earnings must reach ${fmtFortunes(CRIME_FAMILY_CONFIG.paydayMinEarnings)}.`;
  if (eligibleCount === 0) return "Payday locked: nobody qualifies yet.";
  return null;
}

const dueBefore = (now: Date) => new Date(now.getTime() - CRIME_FAMILY_CONFIG.paydayIntervalSeconds * 1000);

/** Whether paydayIntervalSeconds have passed since the last payday (manual, auto and disband's final payday). */
export function isPaydayDue(lastPaydayAt: Date, now: Date): boolean {
  return lastPaydayAt <= dueBefore(now);
}

/** The actor must still be the family's Boss or Underboss, re-read on every call and every retry. */
async function assertPaydayActor(db: Prisma.TransactionClient, familyId: string, actorId: string, now: Date): Promise<void> {
  const member = await db.familyMember.findUnique({ where: { userId: actorId } });
  if (!member || member.familyId !== familyId || !can({ role: member.role as FamilyRole, joinedAt: member.joinedAt }, "payday", now)) {
    throw new FamilyError(ONLY_OFFICERS);
  }
}

/** S7: who would be paid what, who would not and why. */
export async function previewPayday(familyId: string, now: Date = new Date()): Promise<PaydayPreview> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  const members = await listMembers(familyId);
  const { eligible, ineligible } = await evaluatePaydayMembers(members.map((m) => m.userId), now);
  return {
    familyId,
    earnings: family.earnings,
    count: eligible.length,
    split: splitPayday(family.earnings, eligible.length),
    eligible,
    ineligible,
    dueAt: new Date(family.lastPaydayAt.getTime() + CRIME_FAMILY_CONFIG.paydayIntervalSeconds * 1000),
    lockedReason: lockedReasonFor(family.earnings, eligible.length),
  };
}

/**
 * Phase 1, inside the caller's transaction (which has already won the earnings
 * and interval CAS): takes gross × N from earnings, writes the payday and
 * payday_tax rows and one unpaid PaydayShare per eligible member, in order.
 * No wallet is touched; payPaydayShares(runKey) credits them after the commit.
 */
export async function reservePaydayInTx(
  tx: Prisma.TransactionClient, family: Family, eligible: string[], earnings: number, actorId: string, now: Date,
): Promise<{ runKey: string; split: Split }> {
  const split = splitPayday(earnings, eligible.length);
  const total = split.gross * eligible.length;
  const after = await tx.family.update({ where: { id: family.id }, data: { earnings: { increment: -total } } });
  const runKey = await writeLedger(tx, {
    familyId: family.id, actorId, type: "payday", amount: -total, treasuryAfter: after.treasury, earningsAfter: after.earnings,
    meta: { ...split, members: eligible.length },
  });
  await writeLedger(tx, {
    familyId: family.id, actorId, type: "payday_tax", amount: 0, treasuryAfter: after.treasury, earningsAfter: after.earnings,
    meta: { burned: split.tax * eligible.length },
  });
  await tx.paydayShare.createMany({ data: eligible.map((userId) => ({ familyId: family.id, runKey, userId, ...split, createdAt: now })) });
  return { runKey, split };
}

/**
 * Phase 2 for one share, in its own transaction: the paid CAS, the wallet
 * credit, and any MAX_SAFE_BALANCE clamp back to earnings, or, when the family
 * is gone (a disband's final payday), burned into an audit row (F5). Null when
 * another payer already took the share.
 */
async function payShare(share: PaydayShare): Promise<PaidShare | null> {
  const credit = await runFamilyTx(async (tx) => {
    const { count } = await tx.paydayShare.updateMany({ where: { id: share.id, paid: false }, data: { paid: true } });
    if (count !== 1) return null;
    const user = await tx.user.findUnique({ where: { discordId: share.userId }, select: { username: true } });
    const credit = await creditWalletInTx(
      tx, share.userId, user?.username ?? share.userId, share.net, "family_payday", { familyId: share.familyId, gross: share.gross, tax: share.tax }, true,
    );
    const clamp = share.net - credit.appliedAmount;
    if (clamp > 0) {
      const family = await tx.family.findUnique({ where: { id: share.familyId }, select: { id: true } });
      if (family) {
        await creditEarnings(tx, share.familyId, clamp, "payday_clamp_return", "system", { userId: share.userId, runKey: share.runKey }, { retryArrears: false });
      } else {
        await tx.audit.create({
          data: { userId: share.userId, type: "family_payday_clamp_burn", meta: { familyId: share.familyId, runKey: share.runKey, burned: clamp } },
        });
      }
    }
    return credit;
  });
  if (!credit) return null;
  const { userId, familyId, gross, tax, net } = share;
  return { userId, familyId, gross, tax, net, credit: await afterEarnedCredit(userId, credit, true) };
}

/**
 * Credits every unpaid share of one payday, in member order. A share that
 * throws is logged and left unpaid for resumeUnpaidShares; the result is only
 * the shares this call paid. `now` is unused: a payer pays whatever its age.
 */
export async function payPaydayShares(runKey: string, _now: Date = new Date()): Promise<PaidShare[]> {
  const unpaid = await prisma.paydayShare.findMany({ where: { runKey, paid: false }, orderBy: { id: "asc" } });
  const paid: PaidShare[] = [];
  for (const share of unpaid) {
    try {
      const done = await payShare(share);
      if (done) paid.push(done);
    } catch (err) {
      console.error(`[crimeFamily] payday share ${share.id} failed; the resume job retries it`, err);
    }
  }
  return paid;
}

/** The minute job: every share still unpaid paydayShareResumeSeconds after its reserve, one payday at a time. */
export async function resumeUnpaidShares(now: Date): Promise<PaidShare[]> {
  const cutoff = new Date(now.getTime() - CRIME_FAMILY_CONFIG.paydayShareResumeSeconds * 1000);
  const due = await prisma.paydayShare.findMany({
    where: { paid: false, createdAt: { lte: cutoff } }, select: { runKey: true }, orderBy: { createdAt: "asc" },
  });
  const paid: PaidShare[] = [];
  for (const runKey of new Set(due.map((s) => s.runKey))) paid.push(...await payPaydayShares(runKey, now));
  return paid;
}

/**
 * Spec 7.3. `expected` is the previewed E and N of a manual press; the
 * automatic payday passes actorId "system" and null, and reads both inside
 * the transaction. A stale preview returns "changed" with a fresh preview.
 */
export async function executePayday(
  familyId: string, actorId: string, expected: { earnings: number; count: number } | null, now: Date = new Date(),
): Promise<PaydayResult> {
  const manual = actorId !== "system";
  if (manual) await assertPaydayActor(prisma, familyId, actorId, now);
  const preview = await previewPayday(familyId, now);
  if (preview.lockedReason) throw new FamilyError(preview.lockedReason);

  const outcome = await runFamilyTx(async (tx): Promise<{ changed: ChangedReason } | Omit<PaydayPaid, "status" | "paid">> => {
    if (manual) await assertPaydayActor(tx, familyId, actorId, now);
    const family = await tx.family.findUnique({ where: { id: familyId } });
    if (!family) throw new FamilyError("That family no longer exists.");
    const members = await tx.familyMember.findMany({ where: { familyId }, select: { userId: true } });
    const { eligible, ineligible } = await evaluatePaydayMembers(members.map((m) => m.userId), now);
    if (eligible.length === 0 || (expected && eligible.length !== expected.count)) return { changed: "Members changed." };
    const earnings = expected ? expected.earnings : family.earnings;
    if (lockedReasonFor(earnings, eligible.length)) return { changed: "Earnings changed." };

    const { count } = await tx.family.updateMany({
      where: { id: familyId, earnings, lastPaydayAt: { lte: dueBefore(now) } },
      data: { lastPaydayAt: now },
    });
    if (count !== 1) {
      const fresh = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { lastPaydayAt: true } });
      return { changed: isPaydayDue(fresh.lastPaydayAt, now) ? "Earnings changed." : "Payday is not due yet." };
    }
    const reserved = await reservePaydayInTx(tx, family, eligible, earnings, actorId, now);
    return { ...reserved, ineligible, family: await tx.family.findUniqueOrThrow({ where: { id: familyId } }) };
  }, PAYDAY_ATTEMPTS);

  if ("changed" in outcome) return { status: "changed", reason: outcome.changed, preview: await previewPayday(familyId, now) };
  // A share this call fails to pay is paid, and DMed, by the minute job.
  return { status: "paid", ...outcome, paid: await payPaydayShares(outcome.runKey, now) };
}
