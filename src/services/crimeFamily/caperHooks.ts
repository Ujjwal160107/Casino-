// The Caper's entries in plan 1's family registries: seats count toward payday
// activity (7.3), a live seat blocks leaving or a kick mid-run, a kick from a
// lobby frees the seat (or cancels the lobby when it is the planner's), and a
// live caper blocks disband (6.4).
// Imports only prisma, config, caperRefunds and types: never familyQueries,
// eligibility, membershipService or disbandService (cycle through extensions.ts).
import type { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { ActivityRule, FamilyHook } from "./extensions";
import { cancelCaperInTx, removeSeatInTx } from "./caperRefunds";

const IN_FLIGHT = new Set(["RUNNING", "SETTLING"]);

/** The user's live seat and the status of its caper, or null when they hold none. */
async function liveSeatInTx(tx: Prisma.TransactionClient, userId: string) {
  const seat = await tx.caperCrew.findFirst({ where: { userId, liveSlot: "LIVE" } });
  if (!seat) return null;
  const caper = await tx.caper.findUnique({ where: { id: seat.caperId }, select: { status: true } });
  return caper ? { seat, status: caper.status } : null;
}

export const CAPER_ACTIVITY_RULE: ActivityRule = {
  key: "caper_seats",
  label: "crew heist seats",
  need: CRIME_FAMILY_CONFIG.activeCaperSeats,
  count: (userId, since) => prisma.caperCrew.count({ where: { userId, started: true, startedAt: { gte: since } } }),
};

export const CAPER_FAMILY_HOOK: FamilyHook = {
  key: "caper",

  async memberExitBlock(tx, { userId, kind }) {
    const live = await liveSeatInTx(tx, userId);
    if (!live) return null;
    if (kind === "LEFT") return "You are seated in a live crew heist. Leave its lobby with `!heist leave`, or wait for it to finish.";
    return IN_FLIGHT.has(live.status) ? `<@${userId}> is in a running crew heist.` : null;
  },

  async onMemberExit(tx, { userId, kind, now }) {
    if (kind !== "KICKED") return [];
    const live = await liveSeatInTx(tx, userId);
    if (!live || live.status !== "LOBBY") return [];
    if (live.seat.role === "MASTERMIND") return (await cancelCaperInTx(tx, live.seat.caperId, now)).map((r) => r.userId);
    await removeSeatInTx(tx, live.seat, "kick");
    return [userId];
  },

  async disbandBlock(tx, familyId) {
    const caper = await tx.caper.findFirst({ where: { familyId, liveSlot: "LIVE" }, select: { status: true } });
    if (!caper) return null;
    if (caper.status === "LOBBY") return "A crew heist is in its lobby.";
    return IN_FLIGHT.has(caper.status) ? "A crew heist is running." : null;
  },
};
