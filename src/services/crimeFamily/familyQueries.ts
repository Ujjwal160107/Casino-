// Read seams for families: membership lookup, roster, investigation status
// and the dashboard view. No writes.
import type { Family, FamilyMember, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { FAMILY_LEVELS, levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { racketsHeldFor } from "./extensions";
import { can, isAssociate, ROLE_RANK } from "./permissions";
import { FamilyError } from "./tx";
import type { FamilyDashboardView } from "./views";

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

/** Enough members at investigation heat put the whole family under investigation. */
export async function isUnderInvestigation(familyId: string): Promise<boolean> {
  const members = await prisma.familyMember.findMany({ where: { familyId }, select: { userId: true } });
  if (members.length === 0) return false;
  const hot = await prisma.user.count({
    where: { discordId: { in: members.map((m) => m.userId) }, crimeHeat: { gte: CRIME_FAMILY_CONFIG.underInvestigationHeat } },
  });
  return hot >= CRIME_FAMILY_CONFIG.underInvestigationMembers;
}

export async function buildDashboardView(familyId: string, viewerId: string, now: Date): Promise<FamilyDashboardView> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  const [members, underInvestigation, rackets] = await Promise.all([
    listMembers(familyId),
    isUnderInvestigation(familyId),
    racketsHeldFor([familyId]),
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
    viewer: {
      userId: viewerId,
      role: viewerActor?.role ?? null,
      canManage: !!viewerActor && can(viewerActor, "manage", now),
      canClaim: !!viewerActor && can(viewerActor, "claim_chair", now) && bossAway,
    },
  };
}
