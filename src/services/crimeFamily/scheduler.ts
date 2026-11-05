// The family jobs (spec 15): invite expiry and the caper sweep every minute; dues, succession and
// the automatic payday hourly. Each schedule is its own cron task in UTC with
// noOverlap, each job and each family has its own try/catch, and every write
// is a CAS in the service it calls, so a missed or doubled run is harmless.
// Plans 2 and 3 add CfJob entries to CF_SCHEDULES, never branches.
import cron from "node-cron";
import type { Client } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { announceArrears, announceChairChange, announcePayday, resolveInviteCard } from "../../ui/crimeFamily/announce";
import { buildClaimNotice, buildClaimResolved } from "../../ui/crimeFamily/familyScreens";
import { editChannelMessage, sendToChannel } from "../../ui/crimeFamily/post";
import { SWEEP_CAPERS_JOB } from "./caperSweeper";
import { autoHandover, clearClaimNotice, markClaimNotice, setClaimMessage } from "./chairService";
import { expireInvites } from "./membershipService";
import { executePayday } from "./paydayService";
import { FamilyError } from "./tx";
import { chargeDues } from "./vaultService";

export interface CfJob { name: string; run(client: Client, now: Date): Promise<void> }

const secondsAgo = (now: Date, seconds: number) => new Date(now.getTime() - seconds * 1000);

/** Runs fn per item; one item's failure is logged and the loop moves on. */
async function eachSafely<T>(job: string, items: T[], idOf: (item: T) => string, fn: (item: T) => Promise<void>): Promise<void> {
  for (const item of items) {
    try {
      await fn(item);
    } catch (err) {
      console.error(`[crimeFamily] ${job} error for ${idOf(item)}:`, err);
    }
  }
}

const allFamilyIds = async () => (await prisma.family.findMany({ select: { id: true } })).map((f) => f.id);

/** Minute: PENDING invites past expiresAt → EXPIRED, and their S4 cards edited once. */
export async function sweepInvites(client: Client, now: Date): Promise<void> {
  const expired = (await expireInvites(now)).filter((invite) => invite.messageId !== "");
  await eachSafely("sweepInvites", expired, (invite) => invite.id, (invite) => resolveInviteCard(client, invite.id, "Expired"));
}

/** Hourly: the once-a-day dues charge (the duesDayKey CAS); the first missed day DMs the Boss and Underboss. */
export async function chargeFamilyDues(client: Client, now: Date): Promise<void> {
  await eachSafely("chargeFamilyDues", await allFamilyIds(), (id) => id, async (familyId) => {
    const { firstMiss } = await chargeDues(familyId, now);
    if (!firstMiss) return;
    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (family) await announceArrears(client, family);
  });
}

/**
 * Spec 6.7 per family: a Boss away autoHandoverAfterSeconds loses the chair to
 * the heir; away claimChairAfterSeconds with an Underboss gets one S23 per
 * episode; a Boss back while S23 stands ends the episode (P22).
 */
async function succeed(client: Client, familyId: string, now: Date): Promise<void> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) return;
  const boss = await prisma.familyMember.findUnique({ where: { userId: family.bossId } });
  if (!boss) return;

  if (boss.lastActiveAt <= secondsAgo(now, CRIME_FAMILY_CONFIG.autoHandoverAfterSeconds)) {
    const move = await autoHandover(family.id, now);
    if (move) {
      await announceChairChange(client, move.family, "handed", move.oldBossId, move.newBossId);
      return;
    }
  }
  if (boss.lastActiveAt <= secondsAgo(now, CRIME_FAMILY_CONFIG.claimChairAfterSeconds)) {
    const underboss = await prisma.familyMember.findFirst({ where: { familyId: family.id, role: "UNDERBOSS" } });
    if (!underboss || !(await markClaimNotice(family.id, family.bossId))) return;
    const messageId = await sendToChannel(client, family.homeChannelId, buildClaimNotice(family.id, underboss.userId, family.bossId));
    await setClaimMessage(family.id, messageId ? family.homeChannelId : "", messageId ?? "");
    return;
  }
  if (family.claimNoticeFor !== family.bossId || !(await clearClaimNotice(family.id, family.bossId))) return;
  if (family.claimMessageId !== "") {
    await editChannelMessage(client, family.claimChannelId, family.claimMessageId, buildClaimResolved("The Boss is back."));
  }
}

/** Hourly: the 7-day claim notice and the 14-day automatic hand-over. */
export async function runSuccession(client: Client, now: Date): Promise<void> {
  await eachSafely("runSuccession", await allFamilyIds(), (id) => id, (familyId) => succeed(client, familyId, now));
}

/**
 * Hourly: families a grace day past their weekly payday with earnings at the
 * minimum get the 7.3 payday as "system" (D57). A family nobody qualifies in
 * refuses with a FamilyError and is tried again next hour.
 */
export async function autoPayday(client: Client, now: Date): Promise<void> {
  const due = await prisma.family.findMany({
    where: {
      lastPaydayAt: { lte: secondsAgo(now, CRIME_FAMILY_CONFIG.paydayIntervalSeconds + CRIME_FAMILY_CONFIG.autoPaydayGraceSeconds) },
      earnings: { gte: CRIME_FAMILY_CONFIG.paydayMinEarnings },
    },
    select: { id: true },
  });
  await eachSafely("autoPayday", due.map((f) => f.id), (id) => id, async (familyId) => {
    try {
      const result = await executePayday(familyId, "system", null, now);
      if (result.status === "paid") await announcePayday(client, result);
    } catch (err) {
      if (!(err instanceof FamilyError)) throw err;
    }
  });
}

export const CF_SCHEDULES: { cron: string; jobs: CfJob[] }[] = [
  { cron: "* * * * *", jobs: [{ name: "sweepInvites", run: sweepInvites }, SWEEP_CAPERS_JOB] },
  {
    cron: "10 * * * *",
    jobs: [
      { name: "chargeFamilyDues", run: chargeFamilyDues },
      { name: "runSuccession", run: runSuccession },
      { name: "autoPayday", run: autoPayday },
    ],
  },
];

/** Runs each job in order; one job's failure never stops the next. */
export async function runJobs(client: Client, jobs: CfJob[], now: Date = new Date()): Promise<void> {
  for (const job of jobs) {
    try {
      await job.run(client, now);
    } catch (err) {
      console.error(`[crimeFamily] ${job.name} error`, err);
    }
  }
}

/** One cron task per CF_SCHEDULES entry, named by its jobs (two entries may share a cron). */
export function registerCrimeFamilyJobs(client: Client): void {
  for (const s of CF_SCHEDULES) {
    cron.schedule(s.cron, () => runJobs(client, s.jobs), {
      timezone: "Etc/UTC",
      noOverlap: true,
      name: `crimeFamily:${s.jobs.map((j) => j.name).join("+")}`,
    });
  }
}
