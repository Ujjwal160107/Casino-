// Ranks and the chair (spec 6.3, 6.7): promote, demote, hand over, claim,
// the succession heir and the automatic hand-over, plus the once-per-episode
// claim notice CAS. Role caps are the unique (familyId, roleSlot) index; every
// rank change re-reads both rows inside its transaction.
import type { Family, FamilyMember, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { CAPO_SLOTS, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { readActorAndTarget, requireMembership } from "./familyQueries";
import { can, nextRoleDown, nextRoleUp, NO_PERMISSION, ROLE_RANK, type FamilyAction } from "./permissions";
import { FamilyError, isUniqueViolation, runFamilyTx, touchFamily } from "./tx";

type ChairMove = { family: Family; oldBossId: string; newBossId: string };

const CAPO_FULL = "Capo seats are full.";
const UNDERBOSS_TAKEN = "The Underboss seat is taken.";

const actorOf = (m: FamilyMember) => ({ role: m.role as FamilyRole, joinedAt: m.joinedAt });
const secondsAgo = (now: Date, seconds: number) => new Date(now.getTime() - seconds * 1000);

/** The roleSlot a member takes in newRole, read inside the transaction. */
async function slotFor(tx: Prisma.TransactionClient, familyId: string, member: FamilyMember, newRole: FamilyRole): Promise<string> {
  if (newRole === "SOLDIER") return member.userId;
  const held = new Set((await tx.familyMember.findMany({ where: { familyId }, select: { roleSlot: true } })).map((m) => m.roleSlot));
  if (newRole === "UNDERBOSS") {
    if (held.has("UNDERBOSS")) throw new FamilyError(UNDERBOSS_TAKEN);
    return "UNDERBOSS";
  }
  const free = CAPO_SLOTS.find((slot) => !held.has(slot));
  if (!free) throw new FamilyError(CAPO_FULL);
  return free;
}

/** One rank step for target, up or down, by an actor the 6.3 table allows. */
async function changeRank(
  action: Extract<FamilyAction, "promote" | "demote">, actorId: string, targetId: string, now: Date,
): Promise<{ family: Family; newRole: FamilyRole }> {
  const { family } = await requireMembership(actorId);
  let newRole: FamilyRole | null = null;
  try {
    await runFamilyTx(async (tx) => {
      await touchFamily(tx, family.id, now);
      const { actor, target } = await readActorAndTarget(tx, family.id, actorId, targetId);
      const targetRole = target.role as FamilyRole;
      if (!can(actorOf(actor), action, now, { role: targetRole })) throw new FamilyError(NO_PERMISSION);
      newRole = (action === "promote" ? nextRoleUp(targetRole) : nextRoleDown(targetRole))!;
      const roleSlot = await slotFor(tx, family.id, target, newRole);
      await tx.familyMember.update({ where: { id: target.id }, data: { role: newRole, roleSlot } });
    });
  } catch (err) {
    if (isUniqueViolation(err, "FamilyMember_familyId_roleSlot_key")) throw new FamilyError(newRole === "UNDERBOSS" ? UNDERBOSS_TAKEN : CAPO_FULL);
    throw err;
  }
  return { family, newRole: newRole! };
}

export function promoteMember(actorId: string, targetId: string, now: Date = new Date()): Promise<{ family: Family; newRole: FamilyRole }> {
  return changeRank("promote", actorId, targetId, now);
}

export function demoteMember(actorId: string, targetId: string, now: Date = new Date()): Promise<{ family: Family; newRole: FamilyRole }> {
  return changeRank("demote", actorId, targetId, now);
}

/**
 * The one chair move: CAS the family's bossId, then the old Boss becomes a
 * Soldier before the new Boss takes the BOSS slot, so the roleSlot index
 * never collides (6.7, P12).
 */
async function moveChair(tx: Prisma.TransactionClient, familyId: string, oldBossId: string, newBossId: string): Promise<ChairMove> {
  const { count } = await tx.family.updateMany({ where: { id: familyId, bossId: oldBossId }, data: { bossId: newBossId } });
  if (count !== 1) throw new FamilyError("The chair already changed hands.");
  await tx.familyMember.updateMany({ where: { familyId, userId: oldBossId }, data: { role: "SOLDIER", roleSlot: oldBossId } });
  await tx.familyMember.updateMany({ where: { familyId, userId: newBossId }, data: { role: "BOSS", roleSlot: "BOSS" } });
  const family = await tx.family.findUniqueOrThrow({ where: { id: familyId } });
  return { family, oldBossId, newBossId };
}

/** The Boss hands the chair to another member (`!crew handover`). */
export async function handOverChair(bossId: string, targetId: string, now: Date = new Date()): Promise<ChairMove> {
  const { family } = await requireMembership(bossId);
  if (targetId === bossId) throw new FamilyError("You already hold the chair.");
  return runFamilyTx(async (tx) => {
    const { actor } = await readActorAndTarget(tx, family.id, bossId, targetId);
    if (!can(actorOf(actor), "handover", now)) throw new FamilyError(NO_PERMISSION);
    return moveChair(tx, family.id, bossId, targetId);
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
    return moveChair(tx, familyId, family.bossId, claimerId);
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
    return moveChair(tx, familyId, boss.userId, heir.userId);
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
