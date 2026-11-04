// Read seams for capers: the caper, a family's live caper, its crew, a
// user's live seat and the rolling seat and family-caper windows. No writes.
import type { Caper, CaperCrew } from "@prisma/client";
import prisma from "../../utils/prisma";

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
