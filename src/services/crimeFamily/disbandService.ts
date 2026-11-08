// Disband (spec 6.4, 6.8): the Boss types the tag; one transaction re-checks
// the hook blocks, runs the hooks' side effects, reserves a capped final
// payday when one is due (no minimum, D61), burns everything left, closes invites (the sweeper
// expires them and closes their cards) and expires applications,
// records the exits and hard-deletes the family, freeing its name and tag.
import type { Family, FamilyInvite } from "@prisma/client";
import prisma from "../../utils/prisma";
import { FAMILY_HOOKS } from "./extensions";
import { requireMembership } from "./familyQueries";
import { writeLedger } from "./ledger";
import { closeInvitesNow } from "./membershipService";
import {
  evaluatePaydayMembers, isPaydayDue, payPaydayShares, previewPayday, reservePaydayInTx, splitPayday, type PaidShare, type Split,
} from "./paydayService";
import { FamilyError, runFamilyTx, touchFamily } from "./tx";
import type { PaydayPreview } from "./views";

const DISBAND_ATTEMPTS = 5;
const ONLY_BOSS = "Only the Boss can disband the family.";
const GONE = "That family no longer exists.";

/** Whether a final payday pays anything: someone qualifies and the gross is not 0 (no minimum, D61). */
const paysOut = (earnings: number, count: number) => splitPayday(earnings, count).gross > 0;

/** S22: the final payday (null when none is due or nobody qualifies) and the exact burn. */
export async function previewDisband(
  familyId: string, now: Date = new Date(),
): Promise<{ finalPayday: PaydayPreview | null; burnTreasury: number; burnEarnings: number }> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError(GONE);
  const returned = await Promise.all(FAMILY_HOOKS.map((h) => h.disbandPreview?.(familyId)));
  const earnings = family.earnings + returned.reduce((sum, r) => sum + (r?.returnedToEarnings ?? 0), 0);

  let finalPayday: PaydayPreview | null = null;
  if (isPaydayDue(family.lastPaydayAt, now)) {
    const base = await previewPayday(familyId, now);
    if (paysOut(earnings, base.count)) finalPayday = { ...base, earnings, split: splitPayday(earnings, base.count), lockedReason: null };
  }
  const paidOut = finalPayday ? finalPayday.split.gross * finalPayday.count : 0;
  return { finalPayday, burnTreasury: family.treasury, burnEarnings: earnings - paidOut };
}

export async function disbandFamily(bossId: string, typedTag: string, now: Date = new Date()): Promise<{
  family: Family; formerMembers: string[]; paid: PaidShare[]; split: Split | null; burned: number; expiredApplications: FamilyInvite[];
}> {
  const { family } = await requireMembership(bossId);
  if (family.bossId !== bossId) throw new FamilyError(ONLY_BOSS);
  if (typedTag.trim().toUpperCase() !== family.tagKey) throw new FamilyError(`Type the tag exactly: ${family.tag}`);

  const outcome = await runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    const current = await tx.family.findUnique({ where: { id: family.id } });
    if (!current) throw new FamilyError(GONE);
    if (current.bossId !== bossId) throw new FamilyError(ONLY_BOSS);
    for (const hook of FAMILY_HOOKS) {
      const block = await hook.disbandBlock?.(tx, family.id);
      if (block) throw new FamilyError(block);
    }
    for (const hook of FAMILY_HOOKS) await hook.onDisband?.(tx, { familyId: family.id, now });

    const members = await tx.familyMember.findMany({ where: { familyId: family.id } });
    const beforePay = await tx.family.findUniqueOrThrow({ where: { id: family.id } });
    let reserved: { runKey: string; split: Split } | null = null;
    if (isPaydayDue(beforePay.lastPaydayAt, now)) {
      const { eligible } = await evaluatePaydayMembers(members.map((m) => m.userId), now);
      if (paysOut(beforePay.earnings, eligible.length)) reserved = await reservePaydayInTx(tx, beforePay, eligible, beforePay.earnings, bossId, now);
    }

    const final = await tx.family.findUniqueOrThrow({ where: { id: family.id } });
    const burned = final.treasury + final.earnings;
    await writeLedger(tx, {
      familyId: family.id, actorId: bossId, type: "disband_burn", amount: -burned, treasuryAfter: 0, earningsAfter: 0,
      meta: { treasury: final.treasury, earnings: final.earnings },
    });
    await tx.audit.create({
      data: { guildId: final.homeGuildId, userId: bossId, type: "family_disband", meta: { familyId: family.id, name: final.name, tag: final.tag, burned } },
    });
    await closeInvitesNow(tx, { familyId: family.id });
    const pending = await tx.familyInvite.findMany({ where: { familyId: family.id, kind: "APPLICATION", status: "PENDING" }, select: { id: true } });
    const expiredApplications: FamilyInvite[] = [];
    for (const { id } of pending) {
      expiredApplications.push(await tx.familyInvite.update({ where: { id }, data: { status: "EXPIRED", slot: id, resolvedAt: now } }));
    }
    await tx.familyExit.createMany({
      data: members.map((m) => ({ userId: m.userId, familyId: family.id, reason: "DISBANDED", wasBoss: m.userId === final.bossId, leftAt: now })),
    });
    await tx.familyMember.deleteMany({ where: { familyId: family.id } });
    await tx.family.delete({ where: { id: family.id } });
    return { family: final, formerMembers: members.map((m) => m.userId), reserved, burned, expiredApplications };
  }, DISBAND_ATTEMPTS);

  // The shares are credited after the family is gone, so a clamp burns (F5).
  const paid = outcome.reserved ? await payPaydayShares(outcome.reserved.runKey, now) : [];
  return {
    family: outcome.family, formerMembers: outcome.formerMembers, paid, split: outcome.reserved?.split ?? null, burned: outcome.burned,
    expiredApplications: outcome.expiredApplications,
  };
}
