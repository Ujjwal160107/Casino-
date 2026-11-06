// The no-confidence vote (amendment 4): who may start one, the start, secret
// changeable ballots, the close and the once-only announcement CASes. One OPEN
// vote per family is the unique (familyId, liveSlot) index; a start and a close
// run touchFamily, so they conflict with any chair, rank or membership write of
// the same family, and every ballot writes the vote so it conflicts with the close.
import type { Family, FamilyVote, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { isBanActive } from "../banService";
import { moveChair, pickHeir } from "./chairService";
import { assertNotJailed, familyLabel, requireMembership } from "./familyQueries";
import { isAssociate, mayStartVote } from "./permissions";
import { FamilyError, isUniqueViolation, runFamilyTx, touchFamily } from "./tx";
import { findOpenVote, hasOpenVote } from "./voteHooks";
import { decideVote, voidReasonOf, voteCooldownUntil, votePassNeed, type VoteStatus } from "./voteRules";
import type { VoteStartView, VoteView } from "./views";

const NOT_MEMBER = "You are not in a crime family.";
const ALREADY_OPEN = "A vote is already open.";
const BANNED = "Banned accounts can't take part in a vote.";
const CLOSED = "Voting closed.";
const NOT_ELIGIBLE = "You can't vote in this one.";

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
  if (!mayStartVote({ role: actor.role as FamilyRole, joinedAt: actor.joinedAt, officerUntil: actor.officerUntil }, now)) {
    return done("Only the Underboss or a Capo can start a no-confidence vote.");
  }
  if (isAssociate(actor.joinedAt, now)) return done("You need 72 hours in the family to start a vote.");
  if (await hasOpenVote(db, familyId)) return done(ALREADY_OPEN);
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
  return findOpenVote(prisma, familyId);
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

/**
 * A secret, changeable ballot (4.3 step 2). The vote write (ballotsVersion)
 * makes a ballot and the close conflict, so a late ballot reads "Voting
 * closed."; a first-ballot double press that loses the unique (voteId, userId)
 * retries once into the update path (mapped outside the transaction).
 */
export async function castBallot(voteId: string, userId: string, choice: "YES" | "NO", now: Date = new Date()): Promise<FamilyVote> {
  const attempt = () => runFamilyTx(async (tx) => {
    const { count } = await tx.familyVote.updateMany({
      where: { id: voteId, status: "OPEN", closesAt: { gt: now } },
      data: { ballotsVersion: { increment: 1 } },
    });
    if (count !== 1) throw new FamilyError(CLOSED);
    const vote = await tx.familyVote.findUniqueOrThrow({ where: { id: voteId } });
    const member = await tx.familyMember.findUnique({ where: { userId } });
    if (!vote.eligibleIds.includes(userId) || !member || member.familyId !== vote.familyId) throw new FamilyError(NOT_ELIGIBLE);
    const gated = await jailOrBanBlock(tx, userId, now);
    if (gated) throw new FamilyError(gated);
    const prior = await tx.familyBallot.findFirst({ where: { voteId, userId } });
    if (prior) await tx.familyBallot.update({ where: { id: prior.id }, data: { choice, castAt: now } });
    else await tx.familyBallot.create({ data: { voteId, familyId: vote.familyId, userId, choice, castAt: now } });
    return vote;
  });
  try {
    return await attempt();
  } catch (err) {
    if (isUniqueViolation(err, "FamilyBallot_voteId_userId_key")) return attempt();
    throw err;
  }
}

/**
 * Closes a due OPEN vote (4.3 step 3); null when it is not due or another
 * close won. Counts only ballots of snapshot ids still members and not the
 * Boss; on a pass the chair moves to the Underboss at close, else the heir
 * order. A chair move racing the close conflicts on the family document; the
 * retry reads the new bossId and closes VOID.
 */
export async function closeVote(voteId: string, now: Date): Promise<FamilyVote | null> {
  return runFamilyTx(async (tx) => {
    const vote = await tx.familyVote.findUnique({ where: { id: voteId } });
    if (!vote || vote.status !== "OPEN" || vote.closesAt > now) return null;
    const family = await tx.family.findUniqueOrThrow({ where: { id: vote.familyId } });
    const members = await tx.familyMember.findMany({ where: { familyId: vote.familyId } });
    const memberIds = new Set(members.map((m) => m.userId));
    const ids = new Set(vote.eligibleIds.filter((id) => memberIds.has(id) && id !== vote.bossId));
    const counted = (await tx.familyBallot.findMany({ where: { voteId } })).filter((b) => ids.has(b.userId));
    const yes = counted.filter((b) => b.choice === "YES").length;
    const no = counted.length - yes;
    const others = members.filter((m) => m.userId !== vote.bossId);
    const heirId = others.find((m) => m.role === "UNDERBOSS")?.userId ?? pickHeir(others, now)?.userId ?? null;
    const { status, voidReason } = decideVote({ eligibleAtClose: ids.size, yes, heirId, chairMoved: family.bossId !== vote.bossId });
    const { count } = await tx.familyVote.updateMany({
      where: { id: voteId, status: "OPEN" },
      data: {
        status, liveSlot: voteId, closedAt: now, cooldownUntil: voteCooldownUntil(status, voidReason, now),
        yes, no, eligibleAtClose: ids.size, newBossId: status === "PASSED" ? heirId! : "",
      },
    });
    if (count !== 1) return null;
    if (status === "PASSED") await moveChair(tx, vote.familyId, vote.bossId, heirId!, now);
    await touchFamily(tx, vote.familyId, now);
    return tx.familyVote.findUniqueOrThrow({ where: { id: voteId } });
  });
}

/** CAS: true once per vote for whoever posts S34 and the start DMs ("start"), or edits the result and sends the close DMs ("result", only once closed). */
export async function claimVoteAnnouncement(voteId: string, which: "start" | "result"): Promise<boolean> {
  const { count } = which === "start"
    ? await prisma.familyVote.updateMany({ where: { id: voteId, announced: false }, data: { announced: true } })
    : await prisma.familyVote.updateMany({ where: { id: voteId, status: { not: "OPEN" }, resultAnnounced: false }, data: { resultAnnounced: true } });
  return count === 1;
}

/** CAS on the stored S34 id: true when it was still expectMessageId ("" for the first post). */
export async function setVoteMessage(voteId: string, expectMessageId: string, channelId: string, messageId: string): Promise<boolean> {
  const { count } = await prisma.familyVote.updateMany({ where: { id: voteId, messageId: expectMessageId }, data: { channelId, messageId } });
  return count === 1;
}

/** F9: true once per vote, for the render that reposts a dead S34; every later dead render stops. */
export async function claimVoteRepost(voteId: string): Promise<boolean> {
  const { count } = await prisma.familyVote.updateMany({ where: { id: voteId, reposted: false }, data: { reposted: true } });
  return count === 1;
}

/** The family's closed votes whose result is not announced yet (a chair mover announces the void it caused). */
export async function unannouncedResultsOf(familyId: string): Promise<string[]> {
  const rows = await prisma.familyVote.findMany({ where: { familyId, status: { not: "OPEN" }, resultAnnounced: false }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Who a vote's DMs go to: the snapshot (start), and the members now plus the targeted Boss (result). */
export async function voteRecipients(voteId: string): Promise<{ eligibleIds: string[]; resultIds: string[] } | null> {
  const vote = await prisma.familyVote.findUnique({ where: { id: voteId }, select: { familyId: true, bossId: true, eligibleIds: true } });
  if (!vote) return null;
  const members = await prisma.familyMember.findMany({ where: { familyId: vote.familyId }, select: { userId: true } });
  return { eligibleIds: vote.eligibleIds, resultIds: [...new Set([...members.map((m) => m.userId), vote.bossId])] };
}

/** The sweeper's work: due closes, and starts or results still silent after voteAnnounceGraceSeconds (A42). */
export async function votesDue(now: Date): Promise<{ close: string[]; announceStart: string[]; announceResult: string[] }> {
  const silentBefore = new Date(now.getTime() - CRIME_FAMILY_CONFIG.voteAnnounceGraceSeconds * 1000);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const [close, announceStart, announceResult] = await Promise.all([
    prisma.familyVote.findMany({ where: { status: "OPEN", closesAt: { lte: now } }, select: { id: true } }),
    prisma.familyVote.findMany({ where: { status: "OPEN", announced: false, createdAt: { lte: silentBefore } }, select: { id: true } }),
    prisma.familyVote.findMany({ where: { status: { not: "OPEN" }, resultAnnounced: false, closedAt: { lte: silentBefore } }, select: { id: true } }),
  ]);
  return { close: ids(close), announceStart: ids(announceStart), announceResult: ids(announceResult) };
}

/** S34 and the S25 vote card; null when the vote or its family is gone. Counts only: never a ballot (F21). */
export async function getVoteView(voteId: string, viewerId: string | null, now: Date): Promise<VoteView | null> {
  const vote = await prisma.familyVote.findUnique({ where: { id: voteId } });
  if (!vote) return null;
  const family = await prisma.family.findUnique({ where: { id: vote.familyId } });
  if (!family) return null;
  const status = vote.status as VoteStatus;
  const base = {
    voteId: vote.id, familyId: family.id, familyLabel: familyLabel(family), tag: family.tag, homeChannelId: family.homeChannelId,
    channelId: vote.channelId, messageId: vote.messageId, bossId: vote.bossId, starterId: vote.starterId, status, closesAt: vote.closesAt,
  };
  if (status !== "OPEN") {
    return {
      ...base, eligible: vote.eligibleAtClose, need: votePassNeed(vote.eligibleAtClose), voted: vote.yes + vote.no, heirId: null,
      result: { yes: vote.yes, no: vote.no, newBossId: vote.newBossId, voidReason: voidReasonOf(vote) }, viewerCanVote: false,
    };
  }
  const members = await prisma.familyMember.findMany({ where: { familyId: family.id }, select: { userId: true, role: true } });
  const memberIds = new Set(members.map((m) => m.userId));
  const ids = new Set(vote.eligibleIds.filter((id) => memberIds.has(id) && id !== vote.bossId));
  const voted = await prisma.familyBallot.count({ where: { voteId, userId: { in: [...ids] } } });
  return {
    ...base, eligible: ids.size, need: votePassNeed(ids.size), voted,
    heirId: members.find((m) => m.role === "UNDERBOSS")?.userId ?? null,
    result: null,
    viewerCanVote: viewerId !== null && ids.has(viewerId) && vote.closesAt > now,
  };
}
