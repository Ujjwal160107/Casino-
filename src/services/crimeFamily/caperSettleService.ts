// Caper settlement (spec 8.4 step 7, 8.8, A30): VOID a run a restart interrupted,
// then draw once, pay each seat once, pay the vault once and resolve. Every
// step is guarded by a CAS (`roll: -1`, `settled`, `vaultPaid`, status), so a
// second settler, a crash or a restart resumes without paying anyone twice.
import type { Caper, CaperCrew } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CAPER_SPLIT_PCT, caperTier, type CaperRoleKey, type CaperTierDef } from "../../data/crimeFamilyCatalog";
import { afterEarnedCredit, creditWalletInTx, type CreditResult } from "../walletService";
import { applyEconomyPenaltyTx } from "../penaltyService";
import { addCrimeHeatTx, migrateLegacyHeatForUser } from "../taxService";
import { jailUserTx } from "../jailService";
import { recordPotentialSoulLedgerLoss } from "../shopBuffs";
import { invalidateUserCache } from "../userService";
import { bootedSince } from "../processBootService";
import { getCaper } from "./caperQueries";
import { voidCaperInTx } from "./caperRefunds";
import { resolveCaperOutcome, splitCaperPool, type CaperOutcome } from "./caperMath";
import { parseAnswers } from "./intelRing";
import { cryptoRng, rollUnit, type Rng } from "./random";
import { invalidateUsers, runFamilyTx } from "./tx";
import { creditEarnings } from "./vaultService";

export type ResolveResult = {
  caperId: string;
  status: "not_due" | "settled" | "void" | "busy";
  resolvedNow: boolean;
  outcome: CaperOutcome | "VOID" | null;
};

const OUTCOMES: readonly string[] = ["CLEAN", "MESSY", "BUST"];

const column = (outcome: CaperOutcome) => outcome.toLowerCase() as "clean" | "messy" | "bust";

/** Crew rows in ring order (the order every per-seat draw and payment follows). */
function inRingOrder(rows: readonly CaperCrew[], order: readonly CaperRoleKey[]): CaperCrew[] {
  return [...rows].sort((a, b) => order.indexOf(a.role as CaperRoleKey) - order.indexOf(b.role as CaperRoleKey));
}

/** RUNNING → CANCELLED/VOID with every stake refunded; a corrupt run (edge 63) also writes a caper_corrupt audit. */
async function voidRun(caper: Caper, corrupt: boolean): Promise<ResolveResult> {
  const refunded = await runFamilyTx(async (tx) => {
    const rows = await voidCaperInTx(tx, caper.id);
    if (rows.length > 0 && corrupt) {
      await tx.audit.create({ data: { type: "caper_corrupt", userId: caper.plannerId, guildId: caper.guildId, meta: { caperId: caper.id } } });
    }
    return rows;
  });
  if (refunded.length === 0) return { caperId: caper.id, status: "busy", resolvedNow: false, outcome: null };
  await invalidateUsers(refunded.map((r) => r.userId));
  return { caperId: caper.id, status: "void", resolvedNow: true, outcome: "VOID" };
}

/**
 * The one entry point for the last lock, the GO timer and the sweeper: voids a
 * corrupt or restart-interrupted run, waits for an unlocked seat until
 * goEndsAt, otherwise moves RUNNING → SETTLING and settles. A SETTLING caper
 * is resumed (C4); anything else is busy.
 */
export async function resolveCaper(caperId: string, now: Date, rng: Rng = cryptoRng): Promise<ResolveResult> {
  const caper = await getCaper(caperId);
  const busy: ResolveResult = { caperId, status: "busy", resolvedNow: false, outcome: null };
  if (!caper) return busy;
  if (caper.status === "RUNNING") {
    if (parseAnswers(caper.answers) === null) return voidRun(caper, true);
    const unlocked = (await prisma.caperCrew.count({ where: { caperId, choice: -1 } })) > 0;
    if (unlocked && now < caper.goEndsAt) return { caperId, status: "not_due", resolvedNow: false, outcome: null };
    if (unlocked && (await bootedSince(caper.startedAt))) return voidRun(caper, false);
    const { count } = await prisma.caper.updateMany({ where: { id: caperId, status: "RUNNING" }, data: { status: "SETTLING" } });
    if (count === 0 && (await getCaper(caperId))?.status !== "SETTLING") return busy;
  } else if (caper.status !== "SETTLING") {
    return busy;
  }
  const settled = await settleCaper(caperId, now, rng);
  return { caperId, status: "settled", ...settled };
}

/** Step 2: the one draw. Writes roll, outcome, pool and every seat's result once; a lost CAS writes nothing. */
async function drawCaper(caperId: string, rng: Rng): Promise<void> {
  await runFamilyTx(async (tx) => {
    const caper = await tx.caper.findUniqueOrThrow({ where: { id: caperId } });
    if (caper.status !== "SETTLING" || caper.roll !== -1) return;
    const answers = parseAnswers(caper.answers);
    if (!answers) throw new Error(`caper ${caperId}: answers unreadable in SETTLING`);
    const tier = caperTier(caper.tier);
    const rows = inRingOrder(await tx.caperCrew.findMany({ where: { caperId } }), answers.order);
    const correct = (row: CaperCrew) => answers.seats[row.role as CaperRoleKey]?.correct;
    const misses = rows.filter((r) => r.choice !== correct(r)).length;

    const roll = rollUnit(rng);
    const outcome = resolveCaperOutcome({ n: rows.length, misses, roll, base: tier.patrolBase, edge: caper.edge, hottestHeat: caper.heatSnapshot });
    const jail = outcome === "BUST" ? tier.jail : null;
    const jailed = rows.map(() => (jail ? rollUnit(rng) < jail.chance : false));
    const split = splitCaperPool({ poolPerSeat: tier.poolPerSeat, n: rows.length, outcome, locked: rows.map((r) => r.choice !== -1) });

    const { count } = await tx.caper.updateMany({
      where: { id: caperId, status: "SETTLING", roll: -1 },
      data: { roll, outcome, pool: split.pool, crewShare: split.crewShare },
    });
    if (count === 0) return;
    for (const [i, row] of rows.entries()) {
      await tx.caperCrew.update({
        where: { id: row.id },
        data: { passed: row.choice === correct(row), cut: split.cuts[i], fine: outcome === "BUST" ? tier.bustFine : 0, jailed: jailed[i] },
      });
    }
  });
}

/** Step 3: one seat's cut or fine, heat and jail, once (`settled` CAS); post-commit garnishment and Soul Ledger. */
async function settleSeat(caper: Caper, tier: CaperTierDef, outcome: CaperOutcome, row: CaperCrew, now: Date): Promise<void> {
  const uid = row.userId;
  await migrateLegacyHeatForUser(uid);
  const done = await runFamilyTx(async (tx): Promise<{ credit: CreditResult | null } | null> => {
    const { count } = await tx.caperCrew.updateMany({ where: { id: row.id, settled: false }, data: { settled: true } });
    if (count === 0) return null;
    const meta = { caperId: caper.id, tier: tier.tier, role: row.role };
    const credit = row.cut > 0 ? await creditWalletInTx(tx, uid, uid, row.cut, "caper_cut", meta, true) : null;
    if (row.fine > 0) await applyEconomyPenaltyTx(tx, uid, uid, row.fine, "caper_fine", meta, caper.guildId);
    await addCrimeHeatTx(tx, uid, tier.heat[column(outcome)]);
    if (row.jailed && tier.jail) await jailUserTx(tx, uid, tier.jail.seconds, now);
    return { credit };
  });
  if (!done) return;
  if (done.credit) await afterEarnedCredit(uid, done.credit, true);
  if (row.fine > 0) await recordPotentialSoulLedgerLoss(uid, row.fine);
  await invalidateUserCache(uid, "");
}

/** Step 4: the vault cut, the tier XP and every crew member's caper count, once (`vaultPaid` CAS). */
async function payVault(caper: Caper, tier: CaperTierDef, outcome: CaperOutcome, crewIds: string[]): Promise<void> {
  const vaultCut = Math.floor((caper.pool * CAPER_SPLIT_PCT.vault) / 100);
  await runFamilyTx(async (tx) => {
    const { count } = await tx.caper.updateMany({ where: { id: caper.id, status: "SETTLING", vaultPaid: false }, data: { vaultPaid: true } });
    if (count === 0) return;
    await creditEarnings(tx, caper.familyId, vaultCut, "caper_cut", "system", { caperId: caper.id, tier: tier.tier, outcome }, { xp: tier.xp[column(outcome)] });
    await tx.familyMember.updateMany({ where: { familyId: caper.familyId, userId: { in: crewIds } }, data: { capers: { increment: 1 } } });
  });
}

/** Step 5: SETTLING → RESOLVED once every seat is settled and the vault is paid; true when this call resolved it. */
function resolveIfDone(caperId: string): Promise<boolean> {
  return runFamilyTx(async (tx) => {
    const open = await tx.caperCrew.count({ where: { caperId, settled: false } });
    const caper = await tx.caper.findUniqueOrThrow({ where: { id: caperId }, select: { vaultPaid: true } });
    if (open > 0 || !caper.vaultPaid) return false;
    const { count } = await tx.caper.updateMany({ where: { id: caperId, status: "SETTLING" }, data: { status: "RESOLVED", liveSlot: caperId } });
    if (count === 0) return false;
    await tx.caperCrew.updateMany({ where: { caperId }, data: { liveSlot: caperId } });
    return true;
  });
}

/**
 * Spec 8.8 steps 2-5 for a SETTLING caper. Safe to call any number of times
 * from any number of settlers: only the draw uses `rng`, and steps 3-5 read
 * the stored draw and never recompute it.
 */
export async function settleCaper(caperId: string, now: Date, rng: Rng = cryptoRng): Promise<{ resolvedNow: boolean; outcome: CaperOutcome }> {
  await drawCaper(caperId, rng);
  const caper = await prisma.caper.findUniqueOrThrow({ where: { id: caperId } });
  if (!OUTCOMES.includes(caper.outcome)) throw new Error(`caper ${caperId}: no draw stored (status ${caper.status})`);
  const outcome = caper.outcome as CaperOutcome;
  const tier = caperTier(caper.tier);
  const answers = parseAnswers(caper.answers);
  const crew = await prisma.caperCrew.findMany({ where: { caperId } });
  const rows = answers ? inRingOrder(crew, answers.order) : crew;

  for (const row of rows.filter((r) => !r.settled)) await settleSeat(caper, tier, outcome, row, now);
  await payVault(caper, tier, outcome, crew.map((r) => r.userId));
  return { resolvedNow: await resolveIfDone(caperId), outcome };
}
