// The GO (spec 8.4 step 6): open a seat's brief and lock one choice. A lock
// writes only its own crew row; the settle draw writes every crew row, so a
// lock racing the draw conflicts and retries into "Too late." (CFD-2).
import type { Caper, CaperCrew } from "@prisma/client";
import prisma from "../../utils/prisma";
import type { CaperRoleKey } from "../../data/crimeFamilyCatalog";
import { getCaper, listCrew } from "./caperQueries";
import { briefFor, isDark, leakAtOf, parseAnswers, ringNeighbours, type CaperAnswers } from "./intelRing";
import { FamilyError, runFamilyTx } from "./tx";
import type { BriefView } from "./views";

const TOO_LATE = "Too late.";
const NOT_IN_CAPER = "You are not in this caper.";
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
    seats: rows.map((r) => ({ role: r.role as CaperRoleKey, userId: r.userId, briefOpened: r.briefOpened, briefOpenedAt: r.briefOpenedAt, choice: r.choice })),
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

/** Locks the presser's one choice before goEndsAt; a dark seat cannot lock, and a seat whose intel holder went dark locks as leaked. */
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
    if (leaking && isDark(row, leakAt)) throw new FamilyError("You went dark: this seat counts as a miss.");
    const { next } = ringNeighbours(answers.order, row.role as CaperRoleKey);
    const holder = rows.find((r) => r.role === next);
    const { count } = await tx.caperCrew.updateMany({
      where: { caperId, userId: uid, choice: -1 },
      data: { choice: index, leaked: leaking && holder !== undefined && isDark(holder, leakAt) },
    });
    if (count === 0) throw new FamilyError("Locked in already.");
    return { caper, answers };
  });
  const allLocked = (await prisma.caperCrew.count({ where: { caperId, choice: -1 } })) === 0;
  return { brief: briefOf(caper, answers, await listCrew(caperId), uid, now), allLocked };
}
