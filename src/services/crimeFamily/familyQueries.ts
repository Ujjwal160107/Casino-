// Read seams for families: membership lookup, roster, investigation status
// and the dashboard view. No writes.
import type { Family, FamilyInvite, FamilyMember, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { FAMILY_LEVELS, levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { checkJailStatus } from "../jailService";
import { racketsHeldFor } from "./extensions";
import { can, isAssociate, mayStartVote, ROLE_RANK } from "./permissions";
import { capoCapFor, investigationThresholdFor } from "./sizeRules";
import { FamilyError } from "./tx";
import { findOpenVote } from "./voteHooks";
import type { FamilyDashboardView, InviteView } from "./views";

/** The user's family and member row, or null when they are in none. */
export async function getMembership(uid: string): Promise<{ family: Family; member: FamilyMember } | null> {
  const member = await prisma.familyMember.findUnique({ where: { userId: uid } });
  if (!member) return null;
  const family = await prisma.family.findUnique({ where: { id: member.familyId } });
  return family ? { family, member } : null;
}

export async function requireMembership(uid: string): Promise<{ family: Family; member: FamilyMember }> {
  const membership = await getMembership(uid);
  if (!membership) throw new FamilyError("You are not in a crime family.");
  return membership;
}

/** The jail refusal shared by every family action a jailed member may not take. */
export async function assertNotJailed(uid: string): Promise<void> {
  const { isJailed } = await checkJailStatus(uid);
  if (isJailed) throw new FamilyError("You can't do that while in jail.");
}

/**
 * Inside a family transaction: re-reads the actor (who must still be in
 * familyId) and the target (who must be in the same family), so every retry
 * re-checks both rows.
 */
export async function readActorAndTarget(
  tx: Prisma.TransactionClient, familyId: string, actorId: string, targetId: string,
): Promise<{ actor: FamilyMember; target: FamilyMember }> {
  const actor = await tx.familyMember.findUnique({ where: { userId: actorId } });
  if (!actor || actor.familyId !== familyId) throw new FamilyError("You are not in a crime family.");
  const target = await tx.familyMember.findUnique({ where: { userId: targetId } });
  if (!target || target.familyId !== familyId) throw new FamilyError(`<@${targetId}> is not in your family.`);
  return { actor, target };
}

/** Members by rank (Boss first), then by who joined first. */
export async function listMembers(familyId: string): Promise<FamilyMember[]> {
  const members = await prisma.familyMember.findMany({ where: { familyId } });
  return members.sort((a, b) =>
    ROLE_RANK[b.role as FamilyRole] - ROLE_RANK[a.role as FamilyRole] || a.joinedAt.getTime() - b.joinedAt.getTime());
}

export async function getFamilyByTag(tag: string): Promise<Family | null> {
  return prisma.family.findUnique({ where: { tagKey: tag.trim().toUpperCase() } });
}

/**
 * Members at investigation heat, the size-scaled threshold (A12) and whether
 * the family is under investigation (hot ≥ threshold).
 */
export async function investigationOf(familyId: string): Promise<{ hot: number; threshold: number; under: boolean }> {
  const [family, members] = await Promise.all([
    prisma.family.findUnique({ where: { id: familyId }, select: { memberCount: true } }),
    prisma.familyMember.findMany({ where: { familyId }, select: { userId: true } }),
  ]);
  if (!family || members.length === 0) return { hot: 0, threshold: investigationThresholdFor(0), under: false };
  const hot = await prisma.user.count({
    where: { discordId: { in: members.map((m) => m.userId) }, crimeHeat: { gte: CRIME_FAMILY_CONFIG.underInvestigationHeat } },
  });
  const threshold = investigationThresholdFor(family.memberCount);
  return { hot, threshold, under: hot >= threshold };
}

/** Enough members at investigation heat put the whole family under investigation. */
export async function isUnderInvestigation(familyId: string): Promise<boolean> {
  return (await investigationOf(familyId)).under;
}

export async function buildDashboardView(familyId: string, viewerId: string, now: Date): Promise<FamilyDashboardView> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  const [members, underInvestigation, rackets, vote] = await Promise.all([
    listMembers(familyId),
    isUnderInvestigation(familyId),
    racketsHeldFor([familyId]),
    findOpenVote(prisma, familyId),
  ]);
  const level = levelDef(family.level);
  const associateMs = CRIME_FAMILY_CONFIG.associateSeconds * 1000;
  const viewer = members.find((m) => m.userId === viewerId);
  const viewerActor = viewer ? { role: viewer.role as FamilyRole, joinedAt: viewer.joinedAt } : null;
  const boss = members.find((m) => m.role === "BOSS");
  const bossAway = !!boss && boss.lastActiveAt.getTime() <= now.getTime() - CRIME_FAMILY_CONFIG.claimChairAfterSeconds * 1000;

  return {
    familyId: family.id,
    name: family.name,
    tag: family.tag,
    level: family.level,
    xp: family.xp,
    nextLevelXp: FAMILY_LEVELS.find((l) => l.level === family.level + 1)?.xpToReach ?? null,
    memberCount: members.length,
    memberCap: level.memberCap,
    capos: members.filter((m) => m.role === "CAPO").length,
    capoCap: capoCapFor(members.length),
    crestKey: level.crestKey,
    roster: members.map((m) => ({
      userId: m.userId,
      role: m.role as FamilyRole,
      associateUntil: m.role !== "BOSS" && isAssociate(m.joinedAt, now) ? new Date(m.joinedAt.getTime() + associateMs) : null,
    })),
    duesArrears: family.duesArrears,
    nextCaperAt: family.nextCaperAt,
    underInvestigation,
    racketsHeld: rackets?.get(familyId) ?? null,
    showTurf: CRIME_FAMILY_CONFIG.turfEnabled,
    vote: vote ? { voteId: vote.id, closesAt: vote.closesAt, viewerEligible: !!viewer && vote.eligibleIds.includes(viewerId) } : null,
    viewer: {
      userId: viewerId,
      role: viewerActor?.role ?? null,
      canManage: !!viewerActor && can(viewerActor, "manage", now),
      canClaim: !!viewerActor && can(viewerActor, "claim_chair", now) && bossAway,
      canStartVote: !!viewer && mayStartVote({ role: viewer.role as FamilyRole, joinedAt: viewer.joinedAt, officerUntil: viewer.officerUntil }, now),
    },
  };
}

/** "[TAG] Name", how cards and DMs name a family. */
export function familyLabel(family: Pick<Family, "tag" | "name">): string {
  return `[${family.tag}] ${family.name}`;
}

export function toInviteView(invite: FamilyInvite & { family: Family }, memberCount: number): InviteView {
  const level = levelDef(invite.family.level);
  return {
    inviteId: invite.id,
    familyLabel: familyLabel(invite.family),
    crestKey: level.crestKey,
    inviterId: invite.inviterId,
    inviteeId: invite.inviteeId,
    expiresAt: invite.expiresAt,
    memberCount,
    memberCap: level.memberCap,
  };
}

export async function countMembers(familyId: string): Promise<number> {
  return prisma.familyMember.count({ where: { familyId } });
}

/** An S4 card: its view and where it was posted (messageId "" when never stored); null when the invite or family is gone. */
export async function getInviteCard(inviteId: string): Promise<{ view: InviteView; channelId: string; messageId: string } | null> {
  const invite = await prisma.familyInvite.findUnique({ where: { id: inviteId } });
  if (!invite) return null;
  const family = await prisma.family.findUnique({ where: { id: invite.familyId } });
  if (!family) return null;
  return { view: toInviteView({ ...invite, family }, await countMembers(family.id)), channelId: invite.channelId, messageId: invite.messageId };
}
