// Payday (spec 7.3): the only way vault money reaches a wallet. An equal,
// capped, taxed split of earnings to the members who pass the payday gate;
// manual (Boss or Underboss), automatic ("system") and disband's final payday
// all pay through payMembersInTx.
import type { Family, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { afterEarnedCredit, creditWalletInTx, type CreditResult } from "../walletService";
import { checkMemberEligibility } from "./eligibility";
import { listMembers } from "./familyQueries";
import { writeLedger } from "./ledger";
import { can } from "./permissions";
import { FamilyError, runFamilyTx } from "./tx";
import type { PaydayPreview } from "./views";

type Split = { gross: number; tax: number; net: number };
type Paid = { userId: string; credit: CreditResult }[];
type ChangedReason = "Members changed." | "Earnings changed." | "Payday is not due yet.";

export type PaydayPaid = { status: "paid"; family: Family; split: Split; paid: Paid; ineligible: PaydayPreview["ineligible"]; clampedBack: number };
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
async function evaluateMembers(userIds: string[], now: Date): Promise<{ eligible: string[]; ineligible: PaydayPreview["ineligible"] }> {
  const results = await Promise.all(userIds.map((uid) => checkMemberEligibility(uid, "payday", { now })));
  const eligible: string[] = [];
  const ineligible: PaydayPreview["ineligible"] = [];
  results.forEach((r, i) => {
    if (r.ok) eligible.push(userIds[i]);
    else ineligible.push({ userId: userIds[i], reason: `${r.failures[0].need} (you have ${r.failures[0].have})` });
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
  const { eligible, ineligible } = await evaluateMembers(members.map((m) => m.userId), now);
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
 * Pays each eligible member net, takes gross × N from earnings and returns
 * any MAX_SAFE_BALANCE clamp to earnings, inside the caller's transaction
 * (which has already guarded earnings and the interval). Run afterEarnedCredit
 * per paid member once it commits.
 */
export async function payMembersInTx(
  tx: Prisma.TransactionClient, family: Family, eligible: string[], earnings: number, actorId: string, now: Date,
): Promise<{ split: Split; paid: Paid; clampedBack: number }> {
  const split = splitPayday(earnings, eligible.length);
  const users = await tx.user.findMany({ where: { discordId: { in: eligible } }, select: { discordId: true, username: true } });
  const names = new Map(users.map((u) => [u.discordId, u.username]));
  const paid: Paid = [];
  let clampedBack = 0;
  for (const userId of eligible) {
    const credit = await creditWalletInTx(
      tx, userId, names.get(userId) ?? userId, split.net, "family_payday", { familyId: family.id, gross: split.gross, tax: split.tax }, true,
    );
    clampedBack += split.net - credit.appliedAmount;
    paid.push({ userId, credit });
  }
  const total = split.gross * eligible.length;
  const after = await tx.family.update({ where: { id: family.id }, data: { earnings: { increment: clampedBack - total } } });
  await writeLedger(tx, {
    familyId: family.id, actorId, type: "payday", amount: -total, treasuryAfter: after.treasury, earningsAfter: after.earnings,
    meta: { ...split, members: eligible.length, clampedBack },
  });
  await writeLedger(tx, {
    familyId: family.id, actorId, type: "payday_tax", amount: 0, treasuryAfter: after.treasury, earningsAfter: after.earnings,
    meta: { burned: split.tax * eligible.length },
  });
  return { split, paid, clampedBack };
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

  const outcome = await runFamilyTx(async (tx): Promise<{ changed: ChangedReason } | Omit<PaydayPaid, "status">> => {
    if (manual) await assertPaydayActor(tx, familyId, actorId, now);
    const family = await tx.family.findUnique({ where: { id: familyId } });
    if (!family) throw new FamilyError("That family no longer exists.");
    const members = await tx.familyMember.findMany({ where: { familyId }, select: { userId: true } });
    const { eligible, ineligible } = await evaluateMembers(members.map((m) => m.userId), now);
    if (eligible.length === 0 || (expected && eligible.length !== expected.count)) return { changed: "Members changed." };
    const earnings = expected ? expected.earnings : family.earnings;
    if (lockedReasonFor(earnings, eligible.length)) return { changed: "Earnings changed." };

    const { count } = await tx.family.updateMany({
      where: { id: familyId, earnings, lastPaydayAt: { lte: dueBefore(now) } },
      data: { lastPaydayAt: now },
    });
    if (count !== 1) {
      const fresh = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { lastPaydayAt: true } });
      return { changed: fresh.lastPaydayAt > dueBefore(now) ? "Payday is not due yet." : "Earnings changed." };
    }
    const result = await payMembersInTx(tx, family, eligible, earnings, actorId, now);
    return { ...result, ineligible, family: await tx.family.findUniqueOrThrow({ where: { id: familyId } }) };
  }, PAYDAY_ATTEMPTS);

  if ("changed" in outcome) return { status: "changed", reason: outcome.changed, preview: await previewPayday(familyId, now) };
  for (const p of outcome.paid) p.credit = await afterEarnedCredit(p.userId, p.credit, true);
  return { status: "paid", ...outcome };
}
