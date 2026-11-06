// The daily census (amendment 6.4, A22): an hourly job that runs once per UTC
// day, claimed through the CfJobRun{ key: "turf_census" } dayKey. It runs the
// ordered CENSUS_STEPS registry; this plan's only step writes each family's
// activeMembers (the recruitment board sorts on it). Plan 6 appends its turf
// steps as entries. Steps never DM: they return notices and the job sends them.
import type { ContainerBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { isBanActive } from "../banService";
import type { DmNoticeType } from "../dmPrefsService";
import { isUniqueViolation } from "./tx";
import { utcDayKey } from "./vaultService";

/** A DM batch a step asks the job to send; built with a dmNoticeService builder. */
export type CensusNotice = { type: DmNoticeType; userIds: string[]; build: (userId: string) => ContainerBuilder };
export interface CensusStep { key: string; run(now: Date): Promise<CensusNotice[] | void> }

const CENSUS_KEY = "turf_census";
const WEEK_MS = 7 * 86_400_000;
const SKIPPED = () => ({ status: "skipped" as const, notices: [] as CensusNotice[] });

/**
 * Current, unbanned members with ≥ activeCaperSeats started heist seats or
 * ≥ activeCorrectHits correct war hits for their own family since `since`,
 * counted per family.
 */
export async function activeMembersByFamily(since: Date, now: Date): Promise<Map<string, number>> {
  const [seats, hits] = await Promise.all([
    prisma.caperCrew.groupBy({ by: ["familyId", "userId"], where: { started: true, startedAt: { gte: since } }, _count: { _all: true } }),
    prisma.warHit.groupBy({ by: ["familyId", "userId"], where: { state: "HIT", createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const familyOf = new Map<string, Set<string>>();   // userId → families the user was active for
  const add = (p: { familyId: string; userId: string }) => familyOf.set(p.userId, (familyOf.get(p.userId) ?? new Set()).add(p.familyId));
  for (const s of seats) if (s._count._all >= CRIME_FAMILY_CONFIG.activeCaperSeats) add(s);
  for (const h of hits) if (h._count._all >= CRIME_FAMILY_CONFIG.activeCorrectHits) add(h);
  const counts = new Map<string, number>();
  if (familyOf.size === 0) return counts;
  const userIds = [...familyOf.keys()];
  const [members, users] = await Promise.all([
    prisma.familyMember.findMany({ where: { userId: { in: userIds } }, select: { userId: true, familyId: true } }),
    prisma.user.findMany({ where: { discordId: { in: userIds } }, select: { discordId: true, isBanned: true, banExpiresAt: true } }),
  ]);
  const banned = new Set(users.filter((u) => isBanActive(u, now)).map((u) => u.discordId));
  for (const m of members) {
    if (banned.has(m.userId) || !familyOf.get(m.userId)?.has(m.familyId)) continue;
    counts.set(m.familyId, (counts.get(m.familyId) ?? 0) + 1);
  }
  return counts;
}

/** Census steps 1-2: activeMembers and censusAt on every family. */
const ACTIVE_MEMBERS_STEP: CensusStep = {
  key: "active_members",
  async run(now) {
    const active = await activeMembersByFamily(new Date(now.getTime() - WEEK_MS), now);
    const families = await prisma.family.findMany({ select: { id: true } });
    for (const { id } of families) {
      await prisma.family.updateMany({ where: { id }, data: { activeMembers: active.get(id) ?? 0, censusAt: now } });
    }
  },
};

/** The ordered census steps (F3); plan 6 appends its turf steps, each gating itself on turfEnabled. */
export const CENSUS_STEPS: CensusStep[] = [ACTIVE_MEMBERS_STEP];

/**
 * Once per UTC day: every step in order, then the dayKey CAS. A step that
 * throws leaves the day unclaimed, so the next hour reruns every step and no
 * notice of the failed run is sent; a process that loses the CAS returns no
 * notices (A29).
 */
export async function runTurfCensus(now: Date): Promise<{ status: "ran" | "skipped"; notices: CensusNotice[] }> {
  if (!CRIME_FAMILY_CONFIG.enabled) return SKIPPED();
  try {
    await prisma.cfJobRun.create({ data: { key: CENSUS_KEY } });
  } catch (err) {
    if (!isUniqueViolation(err, "CfJobRun_key_key")) throw err;
  }
  const run = await prisma.cfJobRun.findUniqueOrThrow({ where: { key: CENSUS_KEY } });
  const today = utcDayKey(now);
  if (run.dayKey === today) return SKIPPED();
  const notices: CensusNotice[] = [];
  for (const step of CENSUS_STEPS) notices.push(...((await step.run(now)) ?? []));
  const { count } = await prisma.cfJobRun.updateMany({ where: { key: CENSUS_KEY, dayKey: run.dayKey }, data: { dayKey: today, ranAt: now } });
  return count === 1 ? { status: "ran", notices } : SKIPPED();
}
