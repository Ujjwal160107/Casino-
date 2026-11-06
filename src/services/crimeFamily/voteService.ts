// The no-confidence vote (amendment 4): who may start one and the start
// itself. One OPEN vote per family is the unique (familyId, liveSlot) index;
// every write runs in runFamilyTx after touchFamily, so it conflicts with any
// chair, rank or membership write of the same family.
import type { Family, FamilyVote, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { isBanActive } from "../banService";
import { assertNotJailed, familyLabel, requireMembership } from "./familyQueries";
import { can, isAssociate } from "./permissions";
import { FamilyError, isUniqueViolation, runFamilyTx, touchFamily } from "./tx";
import { votePassNeed } from "./voteRules";
import type { VoteStartView } from "./views";

const NOT_MEMBER = "You are not in a crime family.";
const ALREADY_OPEN = "A vote is already open.";
const BANNED = "Banned accounts can't take part in a vote.";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const secondsAfter = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);

/** The jail or ban refusal of F16, or null when the member may take part. */
async function jailOrBanBlock(db: Prisma.TransactionClient, uid: string, now: Date): Promise<string | null> {
  try {
    await assertNotJailed(uid);
  } catch (err) {
    if (err instanceof FamilyError) return err.message;
    throw err;
  }
  const user = await db.user.findUnique({ where: { discordId: uid }, select: { isBanned: true, banExpiresAt: true } });
  return isBanActive(user, now) ? BANNED : null;
}

type StartRead = { block: string | null; family: Family | null; snapshot: string[] };

/** Every start check of amendment 4.2, in order, plus the snapshot a start now would take. */
async function readVoteStart(db: Prisma.TransactionClient, familyId: string, actorId: string, now: Date): Promise<StartRead> {
  const [actor, family] = await Promise.all([
    db.familyMember.findUnique({ where: { userId: actorId } }),
    db.family.findUnique({ where: { id: familyId } }),
  ]);
  if (!actor || actor.familyId !== familyId || !family) return { block: NOT_MEMBER, family: null, snapshot: [] };
  const members = await db.familyMember.findMany({ where: { familyId } });
  const tenuredBy = new Date(now.getTime() - CRIME_FAMILY_CONFIG.associateSeconds * 1000);
  const snapshot = members.filter((m) => m.userId !== family.bossId && m.joinedAt <= tenuredBy).map((m) => m.userId);
  const done = (block: string | null): StartRead => ({ block, family, snapshot });

  const gated = await jailOrBanBlock(db, actorId, now);
  if (gated) return done(gated);
  if (!can({ role: actor.role as FamilyRole, joinedAt: actor.joinedAt }, "start_vote", now) && !(actor.officerUntil > now)) {
    return done("Only the Underboss or a Capo can start a no-confidence vote.");
  }
  if (isAssociate(actor.joinedAt, now)) return done("You need 72 hours in the family to start a vote.");
  if ((await db.familyVote.count({ where: { familyId, status: "OPEN" } })) > 0) return done(ALREADY_OPEN);
  const cooling = await db.familyVote.findFirst({ where: { familyId, cooldownUntil: { gt: now } }, orderBy: { cooldownUntil: "desc" } });
  if (cooling) return done(`A failed vote blocks another until ${rel(cooling.cooldownUntil)}.`);
  const boss = members.find((m) => m.userId === family.bossId);
  const graceEnds = boss ? secondsAfter(boss.firstBossAt, CRIME_FAMILY_CONFIG.voteBossGraceSeconds) : now;
  if (boss && (!boss.bossedOnce || graceEnds > now)) return done(`The Boss has held the chair under 7 days: a vote can open ${rel(graceEnds)}.`);
  if (snapshot.length < CRIME_FAMILY_CONFIG.voteMinEligible) {
    return done(`A vote needs ${CRIME_FAMILY_CONFIG.voteMinEligible} members besides the Boss with 72 hours in the family (you have ${snapshot.length}).`);
  }
  return done(null);
}

/** The first refusal a vote start by actorId would get now, or null when it may start (amendment 4.2). */
export async function voteStartBlock(db: Prisma.TransactionClient, familyId: string, actorId: string, now: Date): Promise<string | null> {
  return (await readVoteStart(db, familyId, actorId, now)).block;
}

/**
 * Opens a no-confidence vote against the current Boss with the starter's YES
 * recorded (4.3 step 1). Two starters at once: the touchFamily conflict or the
 * unique liveSlot (mapped here, outside the transaction) leaves one vote.
 */
export async function startVote(actorId: string, now: Date = new Date()): Promise<FamilyVote> {
  const { family } = await requireMembership(actorId);
  try {
    return await runFamilyTx(async (tx) => {
      await touchFamily(tx, family.id, now);
      const read = await readVoteStart(tx, family.id, actorId, now);
      if (read.block || !read.family) throw new FamilyError(read.block ?? NOT_MEMBER);
      const vote = await tx.familyVote.create({
        data: {
          familyId: family.id, bossId: read.family.bossId, starterId: actorId, eligibleIds: read.snapshot,
          closesAt: secondsAfter(now, CRIME_FAMILY_CONFIG.voteSeconds), createdAt: now,
        },
      });
      await tx.familyBallot.create({ data: { voteId: vote.id, familyId: family.id, userId: actorId, choice: "YES", castAt: now } });
      return vote;
    });
  } catch (err) {
    if (isUniqueViolation(err, "FamilyVote_familyId_liveSlot_key")) throw new FamilyError(ALREADY_OPEN);
    throw err;
  }
}

/** The family's OPEN vote, or null. */
export function openVoteOf(familyId: string): Promise<FamilyVote | null> {
  return prisma.familyVote.findFirst({ where: { familyId, status: "OPEN" } });
}

/** S35 for actorId: the snapshot a start now would take and the refusal it would get. */
export async function getVoteStartView(actorId: string, now: Date): Promise<VoteStartView> {
  const { family } = await requireMembership(actorId);
  const [read, open] = await Promise.all([readVoteStart(prisma, family.id, actorId, now), openVoteOf(family.id)]);
  return {
    ownerId: actorId,
    familyLabel: familyLabel(family),
    bossId: family.bossId,
    eligible: read.snapshot.length,
    need: votePassNeed(read.snapshot.length),
    openVoteId: open?.id ?? null,
    block: read.block,
  };
}
