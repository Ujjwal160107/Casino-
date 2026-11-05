// The family leaderboard (spec 10.4, S10): a registry of sorts (plan 3 adds
// Rackets) and the view. No vault and no family net worth is ever shown.
import prisma from "../../utils/prisma";
import { levelDef } from "../../data/crimeFamilyCatalog";
import { racketsHeldFor } from "./extensions";
import { RACKETS_SORT } from "./turfLeaderboard";
import type { LeaderboardView } from "./views";

export interface LeaderboardSort {
  key: string;
  label: string;
  top(limit: number): Promise<{ familyId: string; value: number }[]>;
  rankOf(familyId: string): Promise<{ rank: number; value: number } | null>;
  /** Omitted means always shown; false hides the tab and its key falls back to the default sort. */
  enabled?(): boolean;
}

const TOP_FAMILIES = 10;

/** A sort on one numeric Family column, highest first, ties to the older family. */
function columnSort(key: string, label: string, column: "xp" | "warWins"): LeaderboardSort {
  return {
    key,
    label,
    async top(limit) {
      const rows = await prisma.family.findMany({
        orderBy: [{ [column]: "desc" }, { createdAt: "asc" }],
        take: limit,
        select: { id: true, [column]: true },
      });
      return rows.map((r) => ({ familyId: r.id, value: (r as Record<string, unknown>)[column] as number }));
    },
    async rankOf(familyId) {
      const family = await prisma.family.findUnique({ where: { id: familyId }, select: { createdAt: true, [column]: true } });
      if (!family) return null;
      const value = (family as Record<string, unknown>)[column] as number;
      const ahead = await prisma.family.count({
        where: { OR: [{ [column]: { gt: value } }, { [column]: value, createdAt: { lt: family.createdAt } }] },
      });
      return { rank: ahead + 1, value };
    },
  };
}

/** The S10 button order. The first entry is the default sort. */
export const LEADERBOARD_SORTS: LeaderboardSort[] = [
  columnSort("xp", "XP", "xp"),
  RACKETS_SORT,
  columnSort("war", "War wins", "warWins"),
];

/** S10: the top families by sortKey (unknown or disabled keys fall back to the first sort) and the viewer's family rank. */
export async function getLeaderboard(sortKey: string, viewerFamilyId: string | null): Promise<LeaderboardView> {
  const sorts = LEADERBOARD_SORTS.filter((s) => s.enabled?.() ?? true);
  const sort = sorts.find((s) => s.key === sortKey) ?? sorts[0];
  const top = await sort.top(TOP_FAMILIES);
  const ids = top.map((t) => t.familyId);
  const [families, counts, rackets, viewer] = await Promise.all([
    prisma.family.findMany({ where: { id: { in: ids } }, select: { id: true, tag: true, name: true, level: true } }),
    prisma.familyMember.groupBy({ by: ["familyId"], where: { familyId: { in: ids } }, _count: { _all: true } }),
    racketsHeldFor(ids),
    viewerFamilyId ? sort.rankOf(viewerFamilyId) : Promise.resolve(null),
  ]);
  const byId = new Map(families.map((f) => [f.id, f]));
  const members = new Map(counts.map((c) => [c.familyId, c._count._all]));
  return {
    sort: sort.key,
    sorts: sorts.map((s) => ({ key: s.key, label: s.label })),
    rows: top.flatMap((t, i) => {
      const f = byId.get(t.familyId);
      if (!f) return [];
      return [{
        rank: i + 1,
        familyId: f.id,
        tag: f.tag,
        name: f.name,
        level: f.level,
        crestKey: levelDef(f.level).crestKey,
        members: members.get(f.id) ?? 0,
        rackets: rackets ? rackets.get(f.id) ?? 0 : null,
        value: t.value,
      }];
    }),
    viewer,
  };
}
