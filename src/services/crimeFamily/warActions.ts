// War actions (spec 9.4, edges 45–51): the contribution row, a free scout once
// per slot, arming a paid hit (cap, cooldown, guarded debit) and answering its
// 20 s call against the arm-time slot. Every press is refused before any write
// unless the war is live and the member may fight in it (T14).
import type { Prisma, War, WarContribution } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { WAR_BLOCKS, WAR_RULES } from "../../data/crimeFamilyCatalog";
import { debitWalletInTx } from "../walletService";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { getMembership } from "./familyQueries";
import { cryptoRng } from "./random";
import { FamilyError, invalidateUsers, isUniqueViolation, runFamilyTx } from "./tx";
import { scoreField, slotEndsAt, slotOf, weakPoint, type WarBlockKey, type WarSide } from "./warMath";

export type ScoutReport = { warId: string; block: WarBlockKey; approach: string; slotEndsAt: Date };
export type ArmedHit = { hitId: string; block: WarBlockKey; deadline: Date; slotEndsAt: Date; approaches: readonly string[] };

const OVER = "This war is over.";
const NOT_STARTED = "The war has not started yet.";
const NOT_YOUR_WAR = "Not your war.";
const NOT_YOUR_HIT = "Not your hit.";
const LOCKED_IN = "Locked in already.";
const TOO_LATE = "Too late.";
const TOO_LATE_OVER = "Too late: the war is over.";

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const blockDef = (key: WarBlockKey) => WAR_BLOCKS.find((b) => b.key === key)!;

/**
 * The member's row for this war, created on their first scout or hit. The
 * pre-insert runs outside any transaction, so a P2002 from a racing first
 * press is caught and the row re-read. nextHitAt starts at the epoch so a row
 * created by a racing scout never puts the member's first hit on cooldown.
 */
export async function ensureContribution(warId: string, familyId: string, userId: string, side: WarSide): Promise<WarContribution> {
  try {
    return await prisma.warContribution.upsert({
      where: { warId_userId: { warId, userId } },
      create: { warId, familyId, userId, side, nextHitAt: new Date(0) },
      update: {},
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return prisma.warContribution.findUniqueOrThrow({ where: { warId_userId: { warId, userId } } });
  }
}

/** The war guard every press re-reads inside its transaction (T17). */
async function liveWarIn(tx: Prisma.TransactionClient, warId: string, now: Date): Promise<War> {
  const war = await tx.war.findFirst({ where: { id: warId, status: "ACTIVE", endsAt: { gt: now } } });
  if (!war) throw new FamilyError(OVER);
  return war;
}

/** Refuses a press on a war that is not live, from a family not in it, or from a member who may not fight; only then the contribution row (T14). */
async function warActor(warId: string, userId: string, guildId: string | null, now: Date): Promise<{ war: War; side: WarSide; contribution: WarContribution }> {
  const war = await prisma.war.findUnique({ where: { id: warId } });
  if (war?.status === "ARMED") throw new FamilyError(NOT_STARTED);
  if (!war || war.status !== "ACTIVE" || war.endsAt <= now) throw new FamilyError(OVER);

  const membership = await getMembership(userId);
  const familyId = membership?.family.id;
  const side: WarSide | null = !familyId ? null
    : familyId === war.attackerFamilyId ? "ATK"
      : familyId === war.defenderFamilyId ? "DEF" : null;
  if (!membership || !side) throw new FamilyError(NOT_YOUR_WAR);

  const check = await checkMemberEligibility(userId, "war", { now, guildId, expectedGuildId: membership.family.homeGuildId });
  if (!check.ok) throw eligibilityError(check.failures);
  const contribution = await ensureContribution(warId, membership.family.id, userId, side);
  return { war, side, contribution };
}

/** Free, once per member per slot: the current weak point of one random block, valid until the slot ends. */
export async function scoutWar(input: { warId: string; userId: string; guildId: string | null; now?: Date }): Promise<ScoutReport> {
  const now = input.now ?? new Date();
  const { contribution } = await warActor(input.warId, input.userId, input.guildId, now);
  return runFamilyTx(async (tx) => {
    const war = await liveWarIn(tx, input.warId, now);
    const slot = slotOf(war.startsAt, now);
    const ends = slotEndsAt(war.startsAt, slot);
    const { count } = await tx.warContribution.updateMany({
      where: { id: contribution.id, lastScoutSlot: { lt: slot } },
      data: { lastScoutSlot: slot },
    });
    if (count !== 1) throw new FamilyError(`Already scouted this slot, next at <t:${unix(ends)}:R>.`);
    const block = WAR_BLOCKS[cryptoRng(WAR_BLOCKS.length)];
    return { warId: war.id, block: block.key, approach: block.approaches[weakPoint(war.seed, block.key, slot)], slotEndsAt: ends };
  });
}

/** Arms one hit: the cap and cooldown CAS, the 25,000 guarded debit, and a call due at min(now + 20 s, endsAt). */
export async function armHit(input: { warId: string; userId: string; guildId: string | null; block: WarBlockKey; now?: Date }): Promise<ArmedHit> {
  const now = input.now ?? new Date();
  const { userId, block } = input;
  const { side, contribution } = await warActor(input.warId, userId, input.guildId, now);
  const c = CRIME_FAMILY_CONFIG;
  const armed = await runFamilyTx(async (tx) => {
    const war = await liveWarIn(tx, input.warId, now);
    const { count } = await tx.warContribution.updateMany({
      where: { id: contribution.id, hits: { lt: c.hitsPerWar }, nextHitAt: { lte: now } },
      data: { hits: { increment: 1 }, nextHitAt: new Date(now.getTime() + c.hitCooldownSeconds * 1000) },
    });
    if (count !== 1) {
      const fresh = await tx.warContribution.findUniqueOrThrow({ where: { id: contribution.id } });
      if (fresh.hits >= c.hitsPerWar) throw new FamilyError(`You've used all ${c.hitsPerWar} hits in this war.`);
      throw new FamilyError(`Next hit <t:${unix(fresh.nextHitAt)}:R>.`);
    }
    await debitWalletInTx(tx, userId, c.hitCost, "turf_hit", { warId: war.id, block });
    const slot = slotOf(war.startsAt, now);
    const deadline = new Date(Math.min(now.getTime() + c.hitAnswerSeconds * 1000, war.endsAt.getTime()));
    const hit = await tx.warHit.create({ data: { warId: war.id, familyId: contribution.familyId, userId, side, block, slot, deadline } });
    return { hitId: hit.id, block, deadline, slotEndsAt: slotEndsAt(war.startsAt, slot), approaches: blockDef(block).approaches };
  });
  await invalidateUsers([userId]);
  return armed;
}

/**
 * Locks in the call, judged against the slot at arm time (edge 50). A correct
 * call scores +10 attacking or +12 defending through the war's ACTIVE CAS, so
 * an answer that lands after settlement began scores nothing (T17). A miss
 * never reveals the weak point (T10).
 */
export async function answerHit(input: { hitId: string; userId: string; choice: number; now?: Date }): Promise<{ correct: boolean; points: number; block: WarBlockKey }> {
  const now = input.now ?? new Date();
  const { hitId, userId, choice } = input;
  const hit = await prisma.warHit.findUnique({ where: { id: hitId } });
  if (!hit || hit.userId !== userId) throw new FamilyError(NOT_YOUR_HIT);
  const war = await prisma.war.findUniqueOrThrow({ where: { id: hit.warId } });
  const block = hit.block as WarBlockKey;
  const side = hit.side as WarSide;
  const correct = choice === weakPoint(war.seed, block, hit.slot);
  const points = correct ? (side === "ATK" ? WAR_RULES.atkPoints : WAR_RULES.defPoints) : 0;

  return runFamilyTx(async (tx) => {
    const { count } = await tx.warHit.updateMany({
      where: { id: hitId, state: "ARMED", deadline: { gte: now } },
      data: { choice, state: correct ? "HIT" : "MISS", points },
    });
    if (count !== 1) {
      const fresh = await tx.warHit.findUniqueOrThrow({ where: { id: hitId }, select: { state: true } });
      throw new FamilyError(fresh.state !== "ARMED" ? LOCKED_IN : TOO_LATE);
    }
    if (correct) {
      const scored = await tx.war.updateMany({
        where: { id: hit.warId, status: "ACTIVE" },
        data: { [scoreField(side, block)]: { increment: points } },
      });
      if (scored.count !== 1) throw new FamilyError(TOO_LATE_OVER);
      await tx.warContribution.updateMany({
        where: { warId: hit.warId, userId },
        data: { correctHits: { increment: 1 }, points: { increment: points } },
      });
      await tx.familyMember.updateMany({ where: { userId, familyId: hit.familyId }, data: { correctHits: { increment: 1 } } });
    }
    return { correct, points, block };
  });
}

/** ARMED hits past their deadline → TIMEOUT (their 25,000 stays spent); returns how many. */
export async function sweepWarHits(now: Date): Promise<number> {
  const { count } = await prisma.warHit.updateMany({ where: { state: "ARMED", deadline: { lt: now } }, data: { state: "TIMEOUT" } });
  return count;
}
