// Ranks and the chair (spec 6.3, 6.7): promote, demote, hand over, claim,
// the succession heir and the automatic hand-over, plus the once-per-episode
// claim notice CAS. The Capo cap is a count against capoCapFor (amendment 3.2)
// with the unique (familyId, roleSlot) index as the backstop; every rank
// change re-reads both rows inside its transaction.
import type { Family, FamilyMember, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { CAPO_SLOTS, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { fmtFortunes } from "../../utils/format";
import { computeNetWorth } from "../netWorthService";
import { FAMILY_HOOKS } from "./extensions";
import { readActorAndTarget, requireMembership } from "./familyQueries";
import { can, nextRoleDown, nextRoleUp, NO_PERMISSION, ROLE_RANK, type FamilyAction } from "./permissions";
import { capoCapFor } from "./sizeRules";
import { FamilyError, isUniqueViolation, runFamilyTx, touchFamily } from "./tx";

export type ChairMove = { family: Family; oldBossId: string; newBossId: string };

const CAPO_FULL = "Capo seats are full.";
const UNDERBOSS_TAKEN = "The Underboss seat is taken.";

const actorOf = (m: FamilyMember) => ({ role: m.role as FamilyRole, joinedAt: m.joinedAt });
const secondsAgo = (now: Date, seconds: number) => new Date(now.getTime() - seconds * 1000);

/** The first refusal of a FAMILY_HOOKS block (rankChangeBlock or handoverBlock), thrown as a FamilyError. */
async function assertNoHookBlock(tx: Prisma.TransactionClient, familyId: string, which: "rankChangeBlock" | "handoverBlock"): Promise<void> {
  for (const hook of FAMILY_HOOKS) {
    const block = await hook[which]?.(tx, familyId);
    if (block) throw new FamilyError(block);
  }
}

/**
 * The role and roleSlot a member takes in newRole, read inside the transaction.
 * With every Capo slot held, `fallBack` lands the member on Soldier instead of
 * throwing (A45: a demoted Underboss).
 */
async function slotFor(
  tx: Prisma.TransactionClient, familyId: string, member: FamilyMember, newRole: FamilyRole, opts: { fallBack: boolean },
): Promise<{ role: FamilyRole; roleSlot: string }> {
  if (newRole === "SOLDIER") return { role: "SOLDIER", roleSlot: member.userId };
  const held = new Set((await tx.familyMember.findMany({ where: { familyId }, select: { roleSlot: true } })).map((m) => m.roleSlot));
  if (newRole === "UNDERBOSS") {
    if (held.has("UNDERBOSS")) throw new FamilyError(UNDERBOSS_TAKEN);
    return { role: "UNDERBOSS", roleSlot: "UNDERBOSS" };
  }
  const free = CAPO_SLOTS.find((slot) => !held.has(slot));
  if (free) return { role: "CAPO", roleSlot: free };
  if (opts.fallBack) return { role: "SOLDIER", roleSlot: member.userId };
  throw new FamilyError(CAPO_FULL);
}

/**
 * The promotion gates (amendment 3.2), inside the transaction so a retry
 * re-reads both: a free Capo seat under capoCapFor(memberCount), and the
 * target's live net worth for Capo and Underboss (A10).
 */
async function assertPromotable(tx: Prisma.TransactionClient, familyId: string, targetId: string, newRole: FamilyRole): Promise<void> {
  if (newRole === "CAPO") {
    const { memberCount } = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { memberCount: true } });
    const capos = await tx.familyMember.count({ where: { familyId, role: "CAPO" } });
    const cap = capoCapFor(memberCount);
    if (capos >= cap) throw new FamilyError(`Capo seats are full (${capos}/${cap} for ${memberCount} members).`);
  }
  const bar = CRIME_FAMILY_CONFIG.capoMinNetWorth;
  const { total } = await computeNetWorth(targetId);
  if (total < bar) throw new FamilyError(`Promotion needs ${fmtFortunes(bar)} net worth (<@${targetId}> has ${fmtFortunes(total)}).`);
}

type RankChange = { family: Family; newRole: FamilyRole; fellBack: boolean };

/**
 * One rank step for target, up or down, by an actor the 6.3 table allows. No rule ever demotes for net worth or size.
 * `expectedRole` is the rank an S5 button was rendered for: a stale or double press refuses instead of stepping twice.
 */
async function changeRank(
  action: Extract<FamilyAction, "promote" | "demote">, actorId: string, targetId: string, now: Date, expectedRole?: FamilyRole,
): Promise<RankChange> {
  const { family } = await requireMembership(actorId);
  let newRole: FamilyRole | null = null;
  let fellBack = false;
  try {
    await runFamilyTx(async (tx) => {
      await touchFamily(tx, family.id, now);
      await assertNoHookBlock(tx, family.id, "rankChangeBlock");
      const { actor, target } = await readActorAndTarget(tx, family.id, actorId, targetId);
      const targetRole = target.role as FamilyRole;
      if (expectedRole !== undefined && targetRole !== expectedRole) throw new FamilyError(`<@${targetId}>'s rank changed. Pick them again.`);
      if (!can(actorOf(actor), action, now, { role: targetRole })) throw new FamilyError(NO_PERMISSION);
      const stepped = (action === "promote" ? nextRoleUp(targetRole) : nextRoleDown(targetRole))!;
      if (action === "promote") await assertPromotable(tx, family.id, targetId, stepped);
      const slot = await slotFor(tx, family.id, target, stepped, { fallBack: action === "demote" && targetRole === "UNDERBOSS" });
      newRole = slot.role;
      fellBack = stepped === "CAPO" && slot.role === "SOLDIER";
      const officerUntil = action === "demote" && (targetRole === "UNDERBOSS" || targetRole === "CAPO")
        ? { officerUntil: new Date(now.getTime() + CRIME_FAMILY_CONFIG.voteOfficerGraceSeconds * 1000) }
        : {};
      await tx.familyMember.update({ where: { id: target.id }, data: { ...slot, ...officerUntil } });
    });
  } catch (err) {
    if (isUniqueViolation(err, "FamilyMember_familyId_roleSlot_key")) throw new FamilyError(newRole === "UNDERBOSS" ? UNDERBOSS_TAKEN : CAPO_FULL);
    throw err;
  }
  return { family, newRole: newRole!, fellBack };
}

export function promoteMember(actorId: string, targetId: string, now: Date = new Date(), expectedRole?: FamilyRole): Promise<RankChange> {
  return changeRank("promote", actorId, targetId, now, expectedRole);
}

export function demoteMember(actorId: string, targetId: string, now: Date = new Date(), expectedRole?: FamilyRole): Promise<RankChange> {
  return changeRank("demote", actorId, targetId, now, expectedRole);
}

/**
 * The one chair move (handover, claim, succession, vote): CAS the family's
 * bossId, then the old Boss becomes a Soldier before the new Boss takes the
 * BOSS slot, so the roleSlot index never collides (6.7, P12). A first-time
 * Boss gets firstBossAt once (A40); then every onChairMove hook runs.
 * The move ends any claim episode (claimNoticeFor), so a Boss who later gets
 * the chair back never reads as "back"; the S23 pointer stays for the
 * announcer that edits the card, which then drops it (clearClaimMessage).
 */
export async function moveChair(tx: Prisma.TransactionClient, familyId: string, oldBossId: string, newBossId: string, now: Date): Promise<ChairMove> {
  const { count } = await tx.family.updateMany({ where: { id: familyId, bossId: oldBossId }, data: { bossId: newBossId, claimNoticeFor: "" } });
  if (count !== 1) throw new FamilyError("The chair already changed hands.");
  await tx.familyMember.updateMany({ where: { familyId, userId: oldBossId }, data: { role: "SOLDIER", roleSlot: oldBossId } });
  await tx.familyMember.updateMany({ where: { familyId, userId: newBossId }, data: { role: "BOSS", roleSlot: "BOSS" } });
  await tx.familyMember.updateMany({ where: { familyId, userId: newBossId, bossedOnce: false }, data: { bossedOnce: true, firstBossAt: now } });
  for (const hook of FAMILY_HOOKS) await hook.onChairMove?.(tx, familyId, now);
  const family = await tx.family.findUniqueOrThrow({ where: { id: familyId } });
  return { family, oldBossId, newBossId };
}

/** The Boss hands the chair to another member (`!crew handover`). */
export async function handOverChair(bossId: string, targetId: string, now: Date = new Date()): Promise<ChairMove> {
  const { family } = await requireMembership(bossId);
  if (targetId === bossId) throw new FamilyError("You already hold the chair.");
  return runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    await assertNoHookBlock(tx, family.id, "handoverBlock");
    const { actor } = await readActorAndTarget(tx, family.id, bossId, targetId);
    if (!can(actorOf(actor), "handover", now)) throw new FamilyError(NO_PERMISSION);
    return moveChair(tx, family.id, bossId, targetId, now);
  });
}

/** The Underboss claims the chair from a Boss inactive for claimChairAfterSeconds. */
export async function claimChair(familyId: string, claimerId: string, now: Date = new Date()): Promise<ChairMove> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  const cutoff = secondsAgo(now, CRIME_FAMILY_CONFIG.claimChairAfterSeconds);
  const boss = await prisma.familyMember.findUnique({ where: { userId: family.bossId } });
  if (boss && boss.lastActiveAt > cutoff) throw new FamilyError("The Boss is still active.");

  return runFamilyTx(async (tx) => {
    const { actor, target } = await readActorAndTarget(tx, familyId, claimerId, family.bossId);
    if (!can(actorOf(actor), "claim_chair", now)) throw new FamilyError(NO_PERMISSION);
    if (target.lastActiveAt > cutoff) throw new FamilyError("The Boss is back.");
    return moveChair(tx, familyId, family.bossId, claimerId, now);
  });
}

/**
 * Spec 6.7 heir order among members active within the claim window (the
 * same 7 days that mark a Boss inactive): the Underboss, else the Capo who
 * joined first, else the Soldier with the most capers (ties to who joined first).
 */
export function pickHeir(members: FamilyMember[], now: Date): FamilyMember | null {
  const activeSince = secondsAgo(now, CRIME_FAMILY_CONFIG.claimChairAfterSeconds);
  const heirs = members
    .filter((m) => m.role !== "BOSS" && m.lastActiveAt >= activeSince)
    .sort((a, b) =>
      ROLE_RANK[b.role as FamilyRole] - ROLE_RANK[a.role as FamilyRole]
      || (a.role === "SOLDIER" ? b.capers - a.capers : 0)
      || a.joinedAt.getTime() - b.joinedAt.getTime());
  return heirs[0] ?? null;
}

/** The hourly job's hand-over after autoHandoverAfterSeconds; null when it is not due or nobody qualifies. */
export async function autoHandover(familyId: string, now: Date): Promise<ChairMove | null> {
  const cutoff = secondsAgo(now, CRIME_FAMILY_CONFIG.autoHandoverAfterSeconds);
  return runFamilyTx(async (tx) => {
    const members = await tx.familyMember.findMany({ where: { familyId } });
    const boss = members.find((m) => m.role === "BOSS");
    if (!boss || boss.lastActiveAt > cutoff) return null;
    const heir = pickHeir(members, now);
    if (!heir) return null;
    return moveChair(tx, familyId, boss.userId, heir.userId, now);
  });
}

/** CAS: true once per inactivity episode, for the caller that posts S23. */
export async function markClaimNotice(familyId: string, bossId: string): Promise<boolean> {
  const { count } = await prisma.family.updateMany({ where: { id: familyId, claimNoticeFor: { not: bossId } }, data: { claimNoticeFor: bossId } });
  return count === 1;
}

/**
 * CAS (P22): the Boss is back, so the episode ends and the next absence gets
 * its own S23. The S23 pointer goes too, so a later chair change never edits it.
 */
export async function clearClaimNotice(familyId: string, bossId: string): Promise<boolean> {
  const { count } = await prisma.family.updateMany({
    where: { id: familyId, claimNoticeFor: bossId },
    data: { claimNoticeFor: "", claimChannelId: "", claimMessageId: "" },
  });
  return count === 1;
}

/** Remembers where S23 was posted so a claim or hand-over can edit it. */
export async function setClaimMessage(familyId: string, channelId: string, messageId: string): Promise<void> {
  await prisma.family.updateMany({ where: { id: familyId }, data: { claimChannelId: channelId, claimMessageId: messageId } });
}

/**
 * Drops the S23 pointer once its card shows the chair change, so no later
 * chair move edits it again. CAS on the message id: a newer S23 posted
 * meanwhile keeps its pointer.
 */
export async function clearClaimMessage(familyId: string, messageId: string): Promise<void> {
  await prisma.family.updateMany({ where: { id: familyId, claimMessageId: messageId }, data: { claimChannelId: "", claimMessageId: "" } });
}
