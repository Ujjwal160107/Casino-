// Turf's entries in plan 1's family registries: correct war hits count toward
// payday activity (7.3), a live war blocks leaving, kicks and disband, a
// disbanding top bidder gets its escrow back into earnings (burned with the
// vault) and its rackets go to the Street (6.4), and racket counts feed the
// dashboard and leaderboard (10.4) while turf is on.
// No top-level calls, and only extensions.ts imports this file (T12): the cycle
// extensions → turfHooks → vaultService → familyQueries → extensions is safe
// because every use is at call time. Never import membershipService or
// disbandService (they import extensions.ts).
import type { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { ActivityRule, FamilyHook } from "./extensions";
import { creditEarnings } from "./vaultService";
import { VaultBusy } from "./tx";

const LIVE = ["ARMED", "ACTIVE"];
const LOCKED = ["ARMED", "ACTIVE", "SETTLING"];
const involving = (familyId: string) => [{ attackerFamilyId: familyId }, { defenderFamilyId: familyId }];

export const WAR_HITS_RULE: ActivityRule = {
  key: "war_hits",
  label: "correct war hits",
  need: CRIME_FAMILY_CONFIG.activeCorrectHits,
  count: (userId, since) => prisma.warHit.count({ where: { userId, state: "HIT", createdAt: { gte: since } } }),
};

/** The BIDDING wars where this family holds the top bid, with the escrow each holds. */
function heldBids(db: Prisma.TransactionClient | typeof prisma, familyId: string) {
  return db.war.findMany({ where: { status: "BIDDING", topBidderFamilyId: familyId }, select: { id: true, topBid: true } });
}

export const TURF_FAMILY_HOOK: FamilyHook = {
  key: "turf",

  async memberExitBlock(tx, { familyId, userId, kind }) {
    if (kind === "KICKED") {
      const active = await tx.war.findFirst({ where: { status: "ACTIVE", OR: involving(familyId) }, select: { id: true } });
      if (active) return "No kicks during an active turf war.";
    }
    const fought = await tx.warContribution.findMany({ where: { userId }, select: { warId: true } });
    if (fought.length === 0) return null;
    const live = await tx.war.count({ where: { id: { in: fought.map((c) => c.warId) }, status: { in: LIVE } } });
    return live > 0 ? "Members who fought in a live turf war stay until it resolves." : null;
  },

  async disbandBlock(tx, familyId) {
    const war = await tx.war.findFirst({ where: { status: { in: LOCKED }, OR: involving(familyId) }, select: { id: true } });
    return war ? "Your family is in a turf war; disband after it resolves." : null;
  },

  async onDisband(tx, { familyId, now }) {
    for (const war of await heldBids(tx, familyId)) {
      const { count } = await tx.war.updateMany({
        where: { id: war.id, status: "BIDDING", topBidderFamilyId: familyId, topBid: war.topBid },
        data: { topBid: 0, topBidderFamilyId: "" },
      });
      if (count !== 1) throw new VaultBusy();
      await creditEarnings(tx, familyId, war.topBid, "bid_refund", "system", { warId: war.id, reason: "disband" }, { retryArrears: false });
    }
    await tx.racket.updateMany({ where: { ownerFamilyId: familyId }, data: { ownerFamilyId: "", neglectStrikes: 0, lastPayoutAt: now } });
  },

  async disbandPreview(familyId) {
    const bids = await heldBids(prisma, familyId);
    return { returnedToEarnings: bids.reduce((sum, b) => sum + b.topBid, 0) };
  },

  async racketsHeld(familyIds) {
    if (!CRIME_FAMILY_CONFIG.turfEnabled) return null;   // no turf, no rackets shown (P23)
    const rows = await prisma.racket.groupBy({ by: ["ownerFamilyId"], where: { ownerFamilyId: { in: familyIds } }, _count: { _all: true } });
    const held = new Map(rows.map((r) => [r.ownerFamilyId, r._count._all]));
    return new Map(familyIds.map((id) => [id, held.get(id) ?? 0]));
  },
};
