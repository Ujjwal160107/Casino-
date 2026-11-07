// The Rackets leaderboard sort (10.4, T18): families holding at least one
// racket, most first, ties to the older family; hidden while turf is off (P23).
// Imports only the prisma and config leaves (T12), so leaderboard.ts never
// becomes a second way into turfHooks.ts.
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { LeaderboardSort } from "./leaderboard";

/** Every family holding ≥ 1 racket in any city, ranked. */
async function rankedHolders(): Promise<{ familyId: string; value: number }[]> {
  const rows = await prisma.racket.groupBy({ by: ["ownerFamilyId"], where: { ownerFamilyId: { not: "" } }, _count: { _all: true } });
  const families = await prisma.family.findMany({ where: { id: { in: rows.map((r) => r.ownerFamilyId) } }, select: { id: true, createdAt: true } });
  const createdAt = new Map(families.map((f) => [f.id, f.createdAt.getTime()]));
  return rows
    .filter((r) => createdAt.has(r.ownerFamilyId))
    .map((r) => ({ familyId: r.ownerFamilyId, value: r._count._all }))
    .sort((a, b) => b.value - a.value || createdAt.get(a.familyId)! - createdAt.get(b.familyId)!);
}

export const RACKETS_SORT: LeaderboardSort = {
  key: "rk",
  label: "Rackets",
  enabled: () => CRIME_FAMILY_CONFIG.turfEnabled,
  async top(limit) {
    return (await rankedHolders()).slice(0, limit);
  },
  async rankOf(familyId) {
    const ranked = await rankedHolders();
    const i = ranked.findIndex((r) => r.familyId === familyId);
    return i < 0 ? null : { rank: i + 1, value: ranked[i].value };
  },
};
