// Read seams for capers: the caper, a family's live caper, its crew, a
// user's live seat, the rolling seat and family-caper windows, and the S11
// and S12–S15 views built from them. No writes.
import type { Caper, CaperCrew } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { CAPER_TIERS, caperTier, type CaperRoleKey, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { patrolChance } from "./caperMath";
import { openRoles, tierRoles } from "./caperLobbyService";
import { familyLabel, isUnderInvestigation, requireMembership } from "./familyQueries";
import { isDark, leakAtOf, parseAnswers, ringNeighbours } from "./intelRing";
import { can } from "./permissions";
import type { CaperCardView, CaperPlannerView, CaperSeatView } from "./views";

/** Exactly one findUnique on the global client: race tests patch this call. */
export function getCaper(caperId: string): Promise<Caper | null> {
  return prisma.caper.findUnique({ where: { id: caperId } });
}

/** The family's LOBBY, RUNNING or SETTLING caper. */
export function getLiveCaper(familyId: string): Promise<Caper | null> {
  return prisma.caper.findFirst({ where: { familyId, liveSlot: "LIVE" } });
}

export function listCrew(caperId: string): Promise<CaperCrew[]> {
  return prisma.caperCrew.findMany({ where: { caperId } });
}

/** The seat the user holds in a live caper, or null. */
export function liveSeatOf(userId: string): Promise<CaperCrew | null> {
  return prisma.caperCrew.findFirst({ where: { userId, liveSlot: "LIVE" } });
}

/** The user's started seats since `since`, oldest first (the rolling seat cap). */
export function startedSeatsSince(userId: string, since: Date): Promise<CaperCrew[]> {
  return prisma.caperCrew.findMany({
    where: { userId, started: true, startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
  });
}

/** The family's started capers since `since`, oldest first; a VOID run is CANCELLED and never counts. */
export function startedCapersSince(familyId: string, since: Date): Promise<Caper[]> {
  return prisma.caper.findMany({
    where: { familyId, status: { in: ["RUNNING", "SETTLING", "RESOLVED"] }, startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
  });
}

/**
 * The shared caper card's view. Each seat's holderId is its ring successor
 * (the holder of its intel); darkness is shown only once the caper has left
 * RUNNING. A family that is gone is named "A crime family".
 */
export async function buildCaperCardView(caperId: string, _now: Date, note: string | null = null): Promise<CaperCardView | null> {
  const caper = await getCaper(caperId);
  if (!caper) return null;
  const [family, rows] = await Promise.all([
    prisma.family.findUnique({ where: { id: caper.familyId }, select: { tag: true, name: true } }),
    listCrew(caperId),
  ]);
  const tier = caperTier(caper.tier);
  const status = caper.status as CaperCardView["status"];
  const order = parseAnswers(caper.answers)?.order ?? null;
  const leakAt = leakAtOf(caper.goEndsAt);
  const ended = status !== "LOBBY" && status !== "RUNNING";
  const rowOf = (role: CaperRoleKey) => rows.find((r) => r.role === role);
  const holderOf = (role: CaperRoleKey) => (order?.includes(role) ? rowOf(ringNeighbours(order, role).next)?.userId ?? null : null);

  const seats = tierRoles(tier).map((role): CaperSeatView => {
    const row = rowOf(role);
    return {
      role, optional: role === tier.optional, userId: row?.userId ?? null,
      locked: !!row && row.choice !== -1, passed: row?.passed ?? false, leaked: row?.leaked ?? false,
      dark: !!row && ended && row.started && isDark(row, leakAt), holderId: holderOf(role),
      cut: row?.cut ?? 0, fine: row?.fine ?? 0, jailed: row?.jailed ?? false,
    };
  });
  return {
    caperId, familyLabel: family ? familyLabel(family) : "A crime family", tier: tier.tier, status,
    outcome: caper.outcome as CaperCardView["outcome"], plannerId: caper.plannerId, guildId: caper.guildId,
    channelId: caper.channelId, messageId: caper.messageId, lobbyClosesAt: caper.lobbyClosesAt, goEndsAt: caper.goEndsAt, leakAt,
    seats, openRoles: openRoles(tier, rows.map((r) => r.role as CaperRoleKey)),
    lockedCount: rows.filter((r) => r.choice !== -1).length, crewCount: rows.length,
    roll: caper.roll, patrolChance: patrolChance(tier.patrolBase, caper.edge, caper.heatSnapshot), pool: caper.pool, note,
  };
}

/** S11 for a member: tiers, family cooldown and caps, and the live caper. */
export async function buildPlannerView(ownerId: string, now: Date): Promise<CaperPlannerView> {
  const { family, member } = await requireMembership(ownerId);
  const since = new Date(now.getTime() - CRIME_FAMILY_CONFIG.caperWindowSeconds * 1000);
  const [recent, underInvestigation, live] = await Promise.all([
    startedCapersSince(family.id, since), isUnderInvestigation(family.id), getLiveCaper(family.id),
  ]);
  return {
    ownerId, familyLabel: familyLabel(family), level: family.level,
    tiers: CAPER_TIERS.map((t) => ({ tier: t.tier, unlocked: family.level >= t.levelToPlan })),
    nextCaperAt: family.nextCaperAt, startedLast24h: recent.length, duesArrears: family.duesArrears, underInvestigation,
    canPlan: can({ role: member.role as FamilyRole, joinedAt: member.joinedAt }, "plan_caper", now),
    live: live
      ? { caperId: live.id, tier: live.tier, status: live.status, guildId: live.guildId, channelId: live.channelId, messageId: live.messageId }
      : null,
  };
}
