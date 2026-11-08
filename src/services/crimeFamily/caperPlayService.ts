// The GO (spec 8.4 step 6): open a seat's brief and lock one choice. A lock
// writes only its own crew row; the settle draw writes every crew row, so a
// lock racing the draw conflicts and retries into "Too late." (CFD-2). A
// share writes only its own crew row, like a lock (A18).
import type { Caper, CaperCrew } from "@prisma/client";
import prisma from "../../utils/prisma";
import { caperTier, type CaperRoleKey } from "../../data/crimeFamilyCatalog";
import { getCaper, listCrew } from "./caperQueries";
import { briefFor, isDark, leakAtOf, parseAnswers, ringNeighbours, type CaperAnswers } from "./intelRing";
import { FamilyError, runFamilyTx } from "./tx";
import type { BriefView } from "./views";

const TOO_LATE = "Too late.";
const NOT_IN_CAPER = "You are not in this crew heist.";
const WENT_DARK = "You went dark: this seat counts as a miss.";
const OPEN_BRIEF_FIRST = "Open your brief first.";
const OPTIONS = 4;

/** The stored answers of a live GO; a corrupt row (edge 63) is played no further, resolve voids it. */
function answersOf(caper: Caper): CaperAnswers {
  const answers = parseAnswers(caper.answers);
  if (!answers) throw new FamilyError(TOO_LATE);
  return answers;
}

function briefOf(caper: Caper, answers: CaperAnswers, rows: readonly CaperCrew[], uid: string, now: Date): BriefView {
  const viewer = rows.find((r) => r.userId === uid);
  if (!viewer) throw new FamilyError(NOT_IN_CAPER);
  return briefFor({
    caperId: caper.id, answers, role: viewer.role as CaperRoleKey, goEndsAt: caper.goEndsAt, now,
    seats: rows.map((r) => ({ role: r.role as CaperRoleKey, userId: r.userId, briefOpened: r.briefOpened, briefOpenedAt: r.briefOpenedAt, choice: r.choice, sharedIntel: r.sharedIntel })),
  });
}

/** Opens the presser's brief; the first open stamps briefOpenedAt (darkness reads it), a repeat changes nothing. */
export async function openBrief(caperId: string, uid: string, now: Date = new Date()): Promise<BriefView> {
  const caper = await getCaper(caperId);
  if (caper?.status === "LOBBY") throw new FamilyError("The brief opens at GO.");
  if (!caper || caper.status !== "RUNNING" || now >= caper.goEndsAt) throw new FamilyError(TOO_LATE);
  const answers = answersOf(caper);
  if (!(await listCrew(caperId)).some((r) => r.userId === uid)) throw new FamilyError(NOT_IN_CAPER);
  await prisma.caperCrew.updateMany({ where: { caperId, userId: uid, briefOpened: false }, data: { briefOpened: true, briefOpenedAt: now } });
  return briefOf(caper, answers, await listCrew(caperId), uid, now);
}

/** Locks the presser's one choice before goEndsAt; an unopened brief or a dark seat cannot lock, and a seat whose intel holder went dark locks as leaked. */
export async function lockChoice(caperId: string, uid: string, index: number, now: Date = new Date()): Promise<{ brief: BriefView; allLocked: boolean }> {
  if (!Number.isInteger(index) || index < 0 || index >= OPTIONS) throw new FamilyError("Pick one of the four options.");
  const { caper, answers } = await runFamilyTx(async (tx) => {
    const caper = await tx.caper.findFirst({ where: { id: caperId, status: "RUNNING", goEndsAt: { gt: now } } });
    if (!caper) throw new FamilyError(TOO_LATE);
    const answers = answersOf(caper);
    const rows = await tx.caperCrew.findMany({ where: { caperId } });
    const row = rows.find((r) => r.userId === uid);
    if (!row) throw new FamilyError(NOT_IN_CAPER);
    const leakAt = leakAtOf(caper.goEndsAt);
    const leaking = now >= leakAt;
    if (leaking && isDark(row, leakAt)) throw new FamilyError(WENT_DARK);
    if (!row.briefOpened) throw new FamilyError(OPEN_BRIEF_FIRST);
    const { next } = ringNeighbours(answers.order, row.role as CaperRoleKey);
    const holder = rows.find((r) => r.role === next);
    const { count } = await tx.caperCrew.updateMany({
      where: { caperId, userId: uid, choice: -1 },
      data: { choice: index, leaked: leaking && holder !== undefined && isDark(holder, leakAt), relayed: holder?.sharedIntel === true },
    });
    if (count === 0) throw new FamilyError("Locked in already.");
    return { caper, answers };
  });
  const allLocked = (await prisma.caperCrew.count({ where: { caperId, choice: -1 } })) === 0;
  return { brief: briefOf(caper, answers, await listCrew(caperId), uid, now), allLocked };
}

/** The intel-arrived DM for the seat a share answers; the route sends it. */
export type IntelNudge = { userId: string; tierName: string; goEndsAt: Date };

/**
 * Shares the intel the presser's seat holds with the seat it answers, once per
 * seat during GO (A18). No nudge when that seat already locked or went dark (G7).
 */
export async function shareIntel(caperId: string, uid: string, now: Date = new Date()): Promise<{ brief: BriefView; nudge: IntelNudge | null }> {
  const { caper, answers, nudge } = await runFamilyTx(async (tx) => {
    const caper = await tx.caper.findFirst({ where: { id: caperId, status: "RUNNING", goEndsAt: { gt: now } } });
    if (!caper) throw new FamilyError(TOO_LATE);
    const answers = answersOf(caper);
    const rows = await tx.caperCrew.findMany({ where: { caperId } });
    const row = rows.find((r) => r.userId === uid);
    if (!row) throw new FamilyError(NOT_IN_CAPER);
    const leakAt = leakAtOf(caper.goEndsAt);
    const leaking = now >= leakAt;
    if (leaking && isDark(row, leakAt)) throw new FamilyError(WENT_DARK);
    if (!row.briefOpened) throw new FamilyError(OPEN_BRIEF_FIRST);
    const { count } = await tx.caperCrew.updateMany({ where: { caperId, userId: uid, sharedIntel: false }, data: { sharedIntel: true, sharedAt: now } });
    if (count !== 1) throw new FamilyError("Already shared.");
    const { prev } = ringNeighbours(answers.order, row.role as CaperRoleKey);
    const recipient = rows.find((r) => r.role === prev);
    const nudge: IntelNudge | null = recipient && recipient.choice === -1 && !(leaking && isDark(recipient, leakAt))
      ? { userId: recipient.userId, tierName: caperTier(caper.tier).name, goEndsAt: caper.goEndsAt }
      : null;
    return { caper, answers, nudge };
  });
  return { brief: briefOf(caper, answers, await listCrew(caperId), uid, now), nudge };
}
