// Caper refund primitives, inside the caller's transaction: refund a stake,
// remove a lobby seat, cancel a lobby, void a run. Every one is guarded by a
// CAS on the caper document or the crew row's `refunded` flag, so a retry or a
// second caller never refunds twice. None opens a transaction.
// A hook module imports this file: never import familyQueries, eligibility,
// membershipService or disbandService here (cycle through extensions.ts).
import type { CaperCrew, Prisma } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { creditWalletInTx, type CreditResult } from "../walletService";
import { FamilyError } from "./tx";

const LOBBY_CLOSED = "Lobby closed.";

/**
 * Returns a seat's stake as unearned income (D60: never afterEarnedCredit). The
 * stake's source is the wallet the clamp just filled, so a MAX_SAFE_BALANCE
 * clamp cannot go back: it is burned into an audit row, as payShare burns a
 * clamp it cannot return (F5).
 */
export async function refundStakeInTx(tx: Prisma.TransactionClient, row: CaperCrew, reason: string): Promise<CreditResult> {
  const meta = { caperId: row.caperId, role: row.role, reason };
  const credit = await creditWalletInTx(tx, row.userId, row.userId, row.stake, "caper_stake_refund", meta, false);
  const burned = row.stake - credit.appliedAmount;
  if (burned > 0) await tx.audit.create({ data: { userId: row.userId, type: "caper_stake_clamp_burn", meta: { ...meta, familyId: row.familyId, burned } } });
  return credit;
}

/** Deletes one unstarted lobby seat and refunds it; bumps seatsVersion so it conflicts with join, start and cancel. */
export async function removeSeatInTx(tx: Prisma.TransactionClient, row: CaperCrew, reason: "leave" | "kick" | "pinched"): Promise<void> {
  const { count } = await tx.caper.updateMany({ where: { id: row.caperId, status: "LOBBY" }, data: { seatsVersion: { increment: 1 } } });
  if (count === 0) throw new FamilyError(LOBBY_CLOSED);
  const removed = await tx.caperCrew.deleteMany({ where: { id: row.id, started: false } });
  if (removed.count === 0) throw new FamilyError("That seat is already gone.");
  await refundStakeInTx(tx, row, reason);
}

/** Refunds every crew row not yet refunded and frees its live slot; returns the rows this call refunded. */
async function refundCrewInTx(tx: Prisma.TransactionClient, caperId: string, reason: string, extra: Prisma.CaperCrewUpdateManyMutationInput): Promise<CaperCrew[]> {
  const rows = await tx.caperCrew.findMany({ where: { caperId, refunded: false } });
  const refunded: CaperCrew[] = [];
  for (const row of rows) {
    const { count } = await tx.caperCrew.updateMany({ where: { id: row.id, refunded: false }, data: { refunded: true, liveSlot: caperId, ...extra } });
    if (count !== 1) continue;
    await refundStakeInTx(tx, row, reason);
    refunded.push(row);
  }
  return refunded;
}

/** LOBBY → CANCELLED: refunds every seat once and starts the cancelled-lobby family cooldown. */
export async function cancelCaperInTx(tx: Prisma.TransactionClient, caperId: string, now: Date): Promise<CaperCrew[]> {
  const { count } = await tx.caper.updateMany({
    where: { id: caperId, status: "LOBBY" },
    data: { status: "CANCELLED", outcome: "CANCELLED", liveSlot: caperId, seatsVersion: { increment: 1 } },
  });
  if (count === 0) throw new FamilyError(LOBBY_CLOSED);
  const refunded = await refundCrewInTx(tx, caperId, "cancelled", {});
  const { familyId } = await tx.caper.findUniqueOrThrow({ where: { id: caperId }, select: { familyId: true } });
  await tx.family.update({
    where: { id: familyId },
    data: { nextCaperAt: new Date(now.getTime() + CRIME_FAMILY_CONFIG.cancelledLobbyCooldownSeconds * 1000) },
  });
  return refunded;
}

/**
 * RUNNING → CANCELLED/VOID: refunds every seat once and un-starts it, so a void
 * run never counts as a seat. Only a RUNNING caper is voided (resolveCaper
 * checks before its RUNNING → SETTLING CAS); a lost CAS returns [].
 */
export async function voidCaperInTx(tx: Prisma.TransactionClient, caperId: string): Promise<CaperCrew[]> {
  const { count } = await tx.caper.updateMany({
    where: { id: caperId, status: "RUNNING" },
    data: { status: "CANCELLED", outcome: "VOID", liveSlot: caperId },
  });
  if (count === 0) return [];
  return refundCrewInTx(tx, caperId, "void", { started: false });
}
