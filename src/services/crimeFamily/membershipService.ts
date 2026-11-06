// Who is in a family: invites (and their expiry), accept, decline, leave and
// kick (spec 6.4). Every membership write is one runFamilyTx that touches the
// family document, so concurrent invites, joins, exits and paydays conflict.
import type { Family, FamilyInvite, FamilyMember, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { FAMILY_HOOKS, type MemberExitKind } from "./extensions";
import { assertNotJailed, getFamilyByTag, getMembership, readActorAndTarget, requireMembership } from "./familyQueries";
import { can, NO_PERMISSION } from "./permissions";
import { joinsPerFamilyFor } from "./sizeRules";
import { FamilyError, invalidateUsers, isUniqueViolation, runFamilyTx, touchFamily } from "./tx";

const WEEK_MS = 7 * 86_400_000;
const SEAT_RACE_RUNS = 3;
const INVITE_EXPIRED = "Invite expired.";

const actorOf = (m: FamilyMember) => ({ role: m.role as FamilyRole, joinedAt: m.joinedAt });

/**
 * The rolling 7-day accepted-join caps (6.4; the family's scales with its
 * level, A11). `alreadyAccepted` is 1 when the caller's own invite was just
 * marked ACCEPTED in this transaction.
 */
async function assertJoinCaps(
  tx: Prisma.TransactionClient, familyId: string, level: number, inviterId: string, now: Date, alreadyAccepted: 0 | 1,
): Promise<void> {
  const since = new Date(now.getTime() - WEEK_MS);
  const byInviter = await tx.familyInvite.count({ where: { inviterId, status: "ACCEPTED", resolvedAt: { gte: since } } });
  if (byInviter - alreadyAccepted >= CRIME_FAMILY_CONFIG.acceptedInvitesPerInviterPer7d) {
    throw new FamilyError(`You can bring in ${CRIME_FAMILY_CONFIG.acceptedInvitesPerInviterPer7d} members per 7 days.`);
  }
  const byFamily = await tx.familyInvite.count({ where: { familyId, status: "ACCEPTED", resolvedAt: { gte: since } } });
  const joins = joinsPerFamilyFor(level);
  if (byFamily - alreadyAccepted >= joins) {
    throw new FamilyError(`Your family can take ${joins} new members per 7 days.`);
  }
}

/** A Capo or above invites a player who is in no family. Callers check isCrimeFamilyOpen. */
export async function inviteMember(input: {
  inviterId: string; inviteeId: string; guildId: string; channelId: string; now?: Date;
}): Promise<FamilyInvite & { family: Family }> {
  const now = input.now ?? new Date();
  const { family, member } = await requireMembership(input.inviterId);
  if (!can(actorOf(member), "invite", now)) throw new FamilyError(NO_PERMISSION);
  await assertNotJailed(input.inviterId);
  if (input.inviteeId === input.inviterId) throw new FamilyError("You can't invite yourself.");
  const theirs = await getMembership(input.inviteeId);
  if (theirs) {
    throw new FamilyError(theirs.family.id === family.id
      ? `<@${input.inviteeId}> is already in your family.`
      : `<@${input.inviteeId}> is already in a crime family.`);
  }

  try {
    const invite = await runFamilyTx(async (tx) => {
      await touchFamily(tx, family.id, now);
      const inviter = await tx.familyMember.findUnique({ where: { userId: input.inviterId } });
      if (!inviter || inviter.familyId !== family.id || !can(actorOf(inviter), "invite", now)) throw new FamilyError(NO_PERMISSION);
      const applied = await tx.familyInvite.findFirst({
        where: { familyId: family.id, inviteeId: input.inviteeId, kind: "APPLICATION", status: "PENDING" }, select: { id: true },
      });
      if (applied) throw new FamilyError(`<@${input.inviteeId}> already applied: accept it in the inbox.`);
      const pendingCount = await tx.familyInvite.count({ where: { familyId: family.id, kind: "INVITE", status: "PENDING" } });
      if (pendingCount >= CRIME_FAMILY_CONFIG.maxPendingInvites) {
        throw new FamilyError(`Too many pending invites (max ${CRIME_FAMILY_CONFIG.maxPendingInvites}).`);
      }
      await assertJoinCaps(tx, family.id, family.level, input.inviterId, now, 0);
      return tx.familyInvite.create({
        data: {
          familyId: family.id, inviterId: input.inviterId, inviteeId: input.inviteeId, status: "PENDING", slot: "PENDING",
          guildId: input.guildId, channelId: input.channelId,
          expiresAt: new Date(now.getTime() + CRIME_FAMILY_CONFIG.inviteTtlSeconds * 1000),
        },
      });
    });
    return { ...invite, family };
  } catch (err) {
    if (isUniqueViolation(err, "FamilyInvite_familyId_inviteeId_slot_key")) throw new FamilyError("Already invited.");
    throw err;
  }
}

/** Remembers the public invite card (S4) so the sweeper can edit it on expiry. */
export async function setInviteMessage(inviteId: string, messageId: string): Promise<void> {
  await prisma.familyInvite.updateMany({ where: { id: inviteId }, data: { messageId } });
}

async function readOwnInvite(inviteId: string, uid: string): Promise<FamilyInvite> {
  const invite = await prisma.familyInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.kind !== "INVITE") throw new FamilyError(INVITE_EXPIRED);   // an application never passes as an invite
  if (invite.inviteeId !== uid) throw new FamilyError("This invite is not for you.");
  return invite;
}

/** The lowest seat in 1..cap that no member holds, or null when the family is full. */
function lowestFreeSeat(taken: number[], cap: number): number | null {
  const held = new Set(taken);
  for (let seat = 1; seat <= cap; seat++) if (!held.has(seat)) return seat;
  return null;
}

/**
 * The shared join (amendment 8.5): run the join gate, re-check the caps and
 * seat the player as a Soldier in the lowest free seat, inside the caller's
 * transaction (whose own invite or application is already ACCEPTED), then
 * withdraw the joiner's other PENDING applications.
 */
export async function joinFamilyInTx(
  tx: Prisma.TransactionClient, i: { familyId: string; uid: string; inviterId: string; now: Date },
): Promise<{ family: Family; member: FamilyMember }> {
  const { familyId, uid, inviterId, now } = i;
  const gate = await checkMemberEligibility(uid, "family_join", { now, familyId });
  if (!gate.ok) throw eligibilityError(gate.failures);
  const family = await tx.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  await assertJoinCaps(tx, familyId, family.level, inviterId, now, 1);
  const seats = await tx.familyMember.findMany({ where: { familyId }, select: { seat: true } });
  const seat = lowestFreeSeat(seats.map((s) => s.seat), levelDef(family.level).memberCap);
  if (seat === null) throw new FamilyError("Family is full.");
  const member = await tx.familyMember.create({
    data: { familyId, userId: uid, role: "SOLDIER", roleSlot: uid, seat, joinedAt: now, lastActiveAt: now },
  });
  await tx.family.update({ where: { id: familyId }, data: { memberCount: { increment: 1 } } });
  await touchFamily(tx, familyId, now);
  const others = await tx.familyInvite.findMany({ where: { inviteeId: uid, kind: "APPLICATION", status: "PENDING" }, select: { id: true } });
  for (const { id } of others) {
    await tx.familyInvite.updateMany({ where: { id, status: "PENDING" }, data: { status: "WITHDRAWN", slot: id, resolvedAt: now } });
  }
  return { family: await tx.family.findUniqueOrThrow({ where: { id: familyId } }), member };
}

/**
 * Runs a join transaction up to 3 times while two joiners collide on a seat.
 * The joiner already holding a membership maps to msgs.alreadyInFamily (the
 * presser is not always the joiner).
 */
export async function withSeatRetry<T>(fn: () => Promise<T>, msgs: { alreadyInFamily: string }): Promise<T> {
  for (let run = 1; ; run++) {
    try {
      return await fn();
    } catch (err) {
      if (isUniqueViolation(err, "FamilyMember_familyId_seat_key")) {
        if (run < SEAT_RACE_RUNS) continue;
        throw new FamilyError("Vault busy, try again.");
      }
      if (isUniqueViolation(err, "FamilyMember_userId_key")) throw new FamilyError(msgs.alreadyInFamily);
      throw err;
    }
  }
}

/**
 * Spec 6.4 accept: CAS the invite, then the shared join, all in one
 * transaction (a refusal rolls the invite back to PENDING).
 */
export async function acceptInvite(inviteId: string, uid: string, now: Date = new Date()): Promise<{ family: Family; member: FamilyMember }> {
  const invite = await readOwnInvite(inviteId, uid);
  await assertNotJailed(uid);
  if (await getMembership(uid)) throw new FamilyError("You are already in a family.");

  return withSeatRetry(() => runFamilyTx(async (tx) => {
    const { count } = await tx.familyInvite.updateMany({
      where: { id: inviteId, kind: "INVITE", status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", slot: inviteId, resolvedAt: now },
    });
    if (count !== 1) throw new FamilyError(INVITE_EXPIRED);
    return joinFamilyInTx(tx, { familyId: invite.familyId, uid, inviterId: invite.inviterId, now });
  }), { alreadyInFamily: "You are already in a family." });
}

async function pendingInviteFromTag(uid: string, tag: string): Promise<FamilyInvite> {
  const family = await getFamilyByTag(tag);
  if (!family) throw new FamilyError("No family with that tag.");
  const invite = await prisma.familyInvite.findFirst({ where: { familyId: family.id, inviteeId: uid, kind: "INVITE", status: "PENDING" } });
  if (!invite) throw new FamilyError("You have no pending invite from that family.");
  return invite;
}

/** `!crew accept <TAG>`, from any server; inviteId lets the caller resolve the S4 card. */
export async function acceptInviteByTag(
  uid: string, tag: string, now: Date = new Date(),
): Promise<{ family: Family; member: FamilyMember; inviteId: string }> {
  const invite = await pendingInviteFromTag(uid, tag);
  return { ...(await acceptInvite(invite.id, uid, now)), inviteId: invite.id };
}

/** CAS PENDING → DECLINED with slot = id, so the pair can be invited again. */
export async function declineInvite(inviteId: string, uid: string, now: Date = new Date()): Promise<FamilyInvite> {
  await readOwnInvite(inviteId, uid);
  const { count } = await prisma.familyInvite.updateMany({
    where: { id: inviteId, kind: "INVITE", status: "PENDING" },
    data: { status: "DECLINED", slot: inviteId, resolvedAt: now },
  });
  if (count !== 1) throw new FamilyError(INVITE_EXPIRED);
  return prisma.familyInvite.findUniqueOrThrow({ where: { id: inviteId } });
}

/** `!crew decline <TAG>`. */
export async function declineInviteByTag(uid: string, tag: string, now: Date = new Date()): Promise<FamilyInvite> {
  const invite = await pendingInviteFromTag(uid, tag);
  return declineInvite(invite.id, uid, now);
}

/** The player's live invites, newest first. */
export async function listPendingInvites(uid: string, now: Date = new Date()): Promise<(FamilyInvite & { family: Family })[]> {
  const invites = await prisma.familyInvite.findMany({
    where: { inviteeId: uid, kind: "INVITE", status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (invites.length === 0) return [];
  const families = await prisma.family.findMany({ where: { id: { in: [...new Set(invites.map((i) => i.familyId))] } } });
  const byId = new Map(families.map((f) => [f.id, f]));
  return invites.flatMap((i) => {
    const family = byId.get(i.familyId);
    return family ? [{ ...i, family }] : [];
  });
}

/**
 * The shared exit: hook blocks (re-run on every retry), delete the member row,
 * record the FamilyExit, drop the leaver's PENDING invites, then hook side
 * effects. Returns the users whose wallets a hook wrote (invalidate after commit).
 */
async function removeMember(tx: Prisma.TransactionClient, familyId: string, userId: string, kind: MemberExitKind, now: Date): Promise<string[]> {
  for (const hook of FAMILY_HOOKS) {
    const block = await hook.memberExitBlock?.(tx, { familyId, userId, kind });
    if (block) throw new FamilyError(block);
  }
  const { count } = await tx.familyMember.deleteMany({ where: { userId, familyId } });
  if (count !== 1) throw new FamilyError(kind === "LEFT" ? "You are not in a crime family." : `<@${userId}> is not in your family.`);
  await tx.family.update({ where: { id: familyId }, data: { memberCount: { decrement: 1 } } });
  await tx.familyExit.create({ data: { userId, familyId, reason: kind, wasBoss: false, leftAt: now } });
  await tx.familyInvite.deleteMany({ where: { inviterId: userId, status: "PENDING" } });
  const wallets: string[] = [];
  for (const hook of FAMILY_HOOKS) wallets.push(...((await hook.onMemberExit?.(tx, { familyId, userId, kind, now })) ?? []));
  return wallets;
}

/** A member leaves. The Boss hands over the chair first; a solo Boss disbands instead (P8). */
export async function leaveFamily(uid: string, now: Date = new Date()): Promise<{ family: Family }> {
  const { family } = await requireMembership(uid);
  const wallets = await runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    const member = await tx.familyMember.findUnique({ where: { userId: uid } });
    if (!member || member.familyId !== family.id) throw new FamilyError("You are not in a crime family.");
    if (member.role === "BOSS") {
      const others = await tx.familyMember.count({ where: { familyId: family.id, userId: { not: uid } } });
      throw new FamilyError(others > 0
        ? "Hand over the chair first (`!crew handover <user>`)."
        : "You're the only member. Leaving would disband the family: use `!crew disband`.");
    }
    return removeMember(tx, family.id, uid, "LEFT", now);
  });
  await invalidateUsers(wallets);
  return { family };
}

/** Kick per the 6.3 rank table, re-read inside the transaction. */
export async function kickMember(actorId: string, targetId: string, now: Date = new Date()): Promise<{ family: Family; targetId: string }> {
  const { family } = await requireMembership(actorId);
  const wallets = await runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    const { actor, target } = await readActorAndTarget(tx, family.id, actorId, targetId);
    if (!can(actorOf(actor), "kick", now, { role: target.role as FamilyRole })) throw new FamilyError(NO_PERMISSION);
    return removeMember(tx, family.id, targetId, "KICKED", now);
  });
  await invalidateUsers(wallets);
  return { family, targetId };
}

/** The sweeper: past-due PENDING → EXPIRED with slot = id. Returns only the rows whose CAS this call won. */
export async function expireInvites(now: Date): Promise<FamilyInvite[]> {
  const due = await prisma.familyInvite.findMany({ where: { status: "PENDING", expiresAt: { lte: now } } });
  const won: FamilyInvite[] = [];
  for (const invite of due) {
    const { count } = await prisma.familyInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "EXPIRED", slot: invite.id, resolvedAt: now },
    });
    if (count === 1) won.push({ ...invite, status: "EXPIRED", slot: invite.id, resolvedAt: now });
  }
  return won;
}
