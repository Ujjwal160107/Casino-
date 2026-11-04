// The caper lobby (spec 8.4 steps 1-3): plan, join, leave and cancel. Every
// refusal is a FamilyError thrown before any write or one that rolls the whole
// transaction back. Joins, leaves and cancels all write the caper document
// (seatsVersion), so concurrent seat changes conflict and retry.
import type { Caper, CaperCrew, Family } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { caperRole, caperTier, CAPER_TIERS, type CaperRoleKey, type CaperTierDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { CRIME_PREP_WHITELIST } from "../../data/crimePrepWhitelist";
import { debitWalletInTx } from "../walletService";
import { getCaper, getLiveCaper, liveSeatOf, startedCapersSince, startedSeatsSince } from "./caperQueries";
import { cancelCaperInTx, removeSeatInTx } from "./caperRefunds";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { isUnderInvestigation, requireMembership } from "./familyQueries";
import { ringOrder } from "./intelRing";
import { can } from "./permissions";
import { FamilyError, isUniqueViolation, runFamilyTx, touchFamily } from "./tx";

const LIVE_CAPER = "Your family already has a live caper.";
const HOLDS_SEAT = "You already hold a seat in a live caper.";
const LOBBY_CLOSED = "Lobby closed.";
const NOT_IN_FAMILY = "You are not in a crime family.";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const windowStart = (now: Date) => new Date(now.getTime() - CRIME_FAMILY_CONFIG.caperWindowSeconds * 1000);
const windowEnd = (startedAt: Date) => new Date(startedAt.getTime() + CRIME_FAMILY_CONFIG.caperWindowSeconds * 1000);
const PREP_NAMES = new Map(CRIME_PREP_WHITELIST.map((i) => [i.key, i.name]));

/** The tier's seats, required then optional, in ring order. */
export function tierRoles(tier: CaperTierDef): CaperRoleKey[] {
  return ringOrder([...tier.required, tier.optional]);
}

/** Seats a member may still join: never the Mastermind's, which only the planner holds. */
export function openRoles(tier: CaperTierDef, filled: readonly CaperRoleKey[]): CaperRoleKey[] {
  const taken = new Set(filled);
  return tierRoles(tier).filter((r) => r !== "MASTERMIND" && !taken.has(r));
}

/** The family cooldown and the rolling family caper cap; the refusal, or null when the family may run one. */
export async function familyCaperBlock(family: Family, now: Date): Promise<string | null> {
  if (now < family.nextCaperAt) return `Family caper cooldown: ready ${rel(family.nextCaperAt)}.`;
  const recent = await startedCapersSince(family.id, windowStart(now));
  if (recent.length >= CRIME_FAMILY_CONFIG.capersPerFamilyPer24h) {
    return `Your family has run ${CRIME_FAMILY_CONFIG.capersPerFamilyPer24h} capers in the last 24 hours. Next slot ${rel(windowEnd(recent[0].startedAt))}.`;
  }
  return null;
}

/**
 * The seat gates shared by plan and join: membership in the caper's family,
 * the tier's eligibility row, one live seat per account and the rolling seat cap.
 */
async function seatGates(
  uid: string, target: { familyId: string; tier: CaperTierDef; guildId: string }, role: CaperRoleKey, guildId: string | null, now: Date,
): Promise<void> {
  const { family } = await requireMembership(uid);
  if (family.id !== target.familyId) throw new FamilyError("This caper belongs to another family.");
  const gate = await checkMemberEligibility(uid, `caper_t${target.tier.tier}`, { role, guildId, expectedGuildId: target.guildId, now });
  if (!gate.ok) {
    if (gate.failures.some((f) => f.gate === "guild")) throw new FamilyError("This caper is in another server; join that server to play.");
    const base = eligibilityError(gate.failures).message;
    if (!gate.failures.some((f) => f.gate === "prep_item")) throw new FamilyError(base);
    const def = caperRole(role);
    throw new FamilyError(`${base} ${def.name} needs one of: ${def.prepKeys.map((k) => PREP_NAMES.get(k) ?? k).join(", ")}.`);
  }
  if (await liveSeatOf(uid)) throw new FamilyError(HOLDS_SEAT);
  const seats = await startedSeatsSince(uid, windowStart(now));
  if (seats.length >= CRIME_FAMILY_CONFIG.seatsPer24h) {
    throw new FamilyError(`You've used both caper seats in the last 24 hours. A seat frees ${rel(windowEnd(seats[0].startedAt))}.`);
  }
}

/** Spec 8.4 step 1: a Capo or above opens a lobby and takes the Mastermind seat, paying its stake. */
export async function planCaper(input: { uid: string; tier: number; guildId: string; channelId: string; now?: Date }): Promise<Caper> {
  const now = input.now ?? new Date();
  const { uid } = input;
  if (!CAPER_TIERS.some((t) => t.tier === input.tier)) throw new FamilyError("Pick a tier from 1 to 4.");
  const tier = caperTier(input.tier);
  const { family, member } = await requireMembership(uid);
  if (await getLiveCaper(family.id)) throw new FamilyError(LIVE_CAPER);
  const mayPlan = (m: { role: string; joinedAt: Date }) => can({ role: m.role as FamilyRole, joinedAt: m.joinedAt }, "plan_caper", now);
  if (!mayPlan(member)) throw new FamilyError("Only a Capo or above can plan a caper.");
  if (family.level < tier.levelToPlan) throw new FamilyError(`${tier.name} unlocks at family level ${tier.levelToPlan}.`);
  if (await isUnderInvestigation(family.id)) {
    throw new FamilyError(`Your family is under investigation: no capers until fewer than ${CRIME_FAMILY_CONFIG.underInvestigationMembers} members are at ${CRIME_FAMILY_CONFIG.underInvestigationHeat} heat.`);
  }
  const blocked = await familyCaperBlock(family, now);
  if (blocked) throw new FamilyError(blocked);
  await seatGates(uid, { familyId: family.id, tier, guildId: input.guildId }, "MASTERMIND", input.guildId, now);

  try {
    return await runFamilyTx(async (tx) => {
      const current = await tx.family.findUnique({ where: { id: family.id } });
      if (!current) throw new FamilyError(NOT_IN_FAMILY);
      const planner = await tx.familyMember.findUnique({ where: { userId: uid } });
      if (!planner || planner.familyId !== family.id) throw new FamilyError(NOT_IN_FAMILY);
      if (!mayPlan(planner)) throw new FamilyError("Only a Capo or above can plan a caper.");
      const block = await familyCaperBlock(current, now);
      if (block) throw new FamilyError(block);
      await touchFamily(tx, family.id, now);
      const caper = await tx.caper.create({
        data: {
          familyId: family.id, tier: tier.tier, plannerId: uid, guildId: input.guildId, channelId: input.channelId,
          lobbyClosesAt: new Date(now.getTime() + CRIME_FAMILY_CONFIG.lobbySeconds * 1000),
        },
      });
      await debitWalletInTx(tx, uid, tier.stake, "caper_stake", { caperId: caper.id, role: "MASTERMIND" });
      await tx.caperCrew.create({ data: { caperId: caper.id, familyId: family.id, userId: uid, role: "MASTERMIND", stake: tier.stake } });
      return caper;
    });
  } catch (err) {
    if (isUniqueViolation(err, "Caper_familyId_liveSlot_key")) throw new FamilyError(LIVE_CAPER);
    if (isUniqueViolation(err, "CaperCrew_userId_liveSlot_key")) throw new FamilyError(HOLDS_SEAT);
    throw err;
  }
}

/** Spec 8.4 steps 2-3 (CFD-1): take an open seat and pay its stake; `full` once every seat up to the tier maximum is filled. */
export async function joinCaper(input: {
  caperId: string; uid: string; role: CaperRoleKey; guildId: string | null; now?: Date;
}): Promise<{ caper: Caper; seat: CaperCrew; full: boolean }> {
  const now = input.now ?? new Date();
  const { caperId, uid, role } = input;
  const snapshot = await getCaper(caperId);
  if (!snapshot || snapshot.status !== "LOBBY" || snapshot.lobbyClosesAt <= now) throw new FamilyError(LOBBY_CLOSED);
  const tier = caperTier(snapshot.tier);
  if (role === "MASTERMIND") throw new FamilyError("The Mastermind seat belongs to the planner.");
  if (!tierRoles(tier).includes(role)) throw new FamilyError("That role is not part of this caper.");
  await seatGates(uid, { familyId: snapshot.familyId, tier, guildId: snapshot.guildId }, role, input.guildId, now);

  try {
    return await runFamilyTx(async (tx) => {
      const { count } = await tx.caper.updateMany({
        where: { id: caperId, status: "LOBBY", lobbyClosesAt: { gt: now } },
        data: { seatsVersion: { increment: 1 } },
      });
      if (count === 0) throw new FamilyError(LOBBY_CLOSED);
      await debitWalletInTx(tx, uid, tier.stake, "caper_stake", { caperId, role });
      const seat = await tx.caperCrew.create({ data: { caperId, familyId: snapshot.familyId, userId: uid, role, stake: tier.stake } });
      const caper = await tx.caper.findUniqueOrThrow({ where: { id: caperId } });
      const full = (await tx.caperCrew.count({ where: { caperId } })) === tier.crewMax;
      return { caper, seat, full };
    });
  } catch (err) {
    if (isUniqueViolation(err, "CaperCrew_caperId_role_key")) throw new FamilyError("Role just taken.");
    if (isUniqueViolation(err, "CaperCrew_caperId_userId_key") || isUniqueViolation(err, "CaperCrew_userId_liveSlot_key")) {
      throw new FamilyError("Already in this caper.");
    }
    throw err;
  }
}

/** Leave a lobby: the seat is refunded; the planner leaving cancels the caper and refunds everyone. */
export async function leaveCaper(caperId: string, uid: string, now: Date = new Date()): Promise<{ cancelled: boolean }> {
  return runFamilyTx(async (tx) => {
    const row = await tx.caperCrew.findFirst({ where: { caperId, userId: uid, liveSlot: "LIVE" } });
    if (!row) throw new FamilyError("You are not in this caper.");
    const caper = await tx.caper.findUnique({ where: { id: caperId }, select: { status: true } });
    if (caper?.status !== "LOBBY") throw new FamilyError("The caper has started; your seat is locked in.");
    if (row.role === "MASTERMIND") {
      await cancelCaperInTx(tx, caperId, now);
      return { cancelled: true };
    }
    await removeSeatInTx(tx, row, "leave");
    return { cancelled: false };
  });
}

/** Cancel a lobby and refund every stake. actorId null is the sweeper; a user must be the planner or the current Boss (edge 2). */
export async function cancelCaper(caperId: string, actorId: string | null, now: Date = new Date()): Promise<CaperCrew[]> {
  return runFamilyTx(async (tx) => {
    const caper = await tx.caper.findUnique({ where: { id: caperId } });
    if (!caper) throw new FamilyError(LOBBY_CLOSED);
    if (actorId !== null && actorId !== caper.plannerId) {
      const family = await tx.family.findUnique({ where: { id: caper.familyId }, select: { bossId: true } });
      if (family?.bossId !== actorId) throw new FamilyError("Only the planner or the Boss can cancel this caper.");
    }
    return cancelCaperInTx(tx, caperId, now);
  });
}
