// Turf's entries in plan 1's family registries: correct war hits count toward
// payday activity (7.3), a live war blocks leaving, kicks and disband, a
// disbanding top bidder gets its escrow back into earnings (burned with the
// vault) and its rackets go to the Street (6.4), racket counts feed the
// dashboard and leaderboard (10.4) while turf is on, and a league-changing
// level-up releases its rackets (amendment 6.6).
// No top-level calls, and only extensions.ts imports this file (T12): the cycle
// extensions → turfHooks → vaultService → familyQueries → extensions is safe
// because every use is at call time. Never import membershipService or
// disbandService (they import extensions.ts).
import type { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { RACKETS, leagueOf } from "../../data/crimeFamilyCatalog";
import type { ActivityRule, FamilyHook } from "./extensions";
import { nextCensusAt } from "./leagueRules";
import { writeLedger } from "./ledger";
import { turfStake } from "./turfStake";
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

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const changesLeague = (from: number, to: number) => leagueOf(from).key !== leagueOf(to).key;

/** The rackets this family owns, in RACKETS order. */
async function ownedRackets(db: Prisma.TransactionClient | typeof prisma, familyId: string) {
  const rows = await db.racket.findMany({ where: { ownerFamilyId: familyId }, select: { id: true, key: true, name: true } });
  const order = (key: string) => RACKETS.findIndex((r) => r.key === key);
  return rows.sort((a, b) => order(a.key) - order(b.key));
}

export const TURF_FAMILY_HOOK: FamilyHook = {
  key: "turf",

  async memberExitBlock(tx, { familyId, userId, kind }) {
    if (kind === "KICKED") {
      const active = await tx.war.findFirst({ where: { status: "ACTIVE", OR: involving(familyId) }, select: { id: true } });
      if (active) return "No kicks during an active turf war.";
    }
    // The family's live wars first, then a [warId, userId] index hit, not a scan of the member's war history.
    const live = await tx.war.findMany({ where: { status: { in: LIVE }, OR: involving(familyId) }, select: { id: true } });
    if (live.length === 0) return null;
    const fought = await tx.warContribution.count({ where: { warId: { in: live.map((w) => w.id) }, userId } });
    return fought > 0 ? "Members who fought in a live turf war stay until it resolves." : null;
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

  async levelUpBlock(db, { familyId, from, to }) {
    if (!changesLeague(from, to)) return null;
    const stake = await turfStake(db, familyId);
    return stake.topBids + stake.liveWars > 0
      ? `Finish your turf first: a family can't move up to the ${leagueOf(to).name} league while it holds a top bid or fights in a turf war.`
      : null;
  },

  async levelUpNotes(familyId, { from, to, now }) {
    if (!changesLeague(from, to)) return [];
    const league = leagueOf(to).name;
    const names = (await ownedRackets(prisma, familyId)).map((r) => r.name);
    // Rackets can still be owned after turf was switched off; the census places families only while it is on.
    return [
      ...(names.length ? [`Moving up to the ${league} league releases ${names.join(", ")} to the Street.`] : []),
      ...(CRIME_FAMILY_CONFIG.turfEnabled ? [`Your family gets a ${league} city at the next census (<t:${unix(nextCensusAt(now))}:R>).`] : []),
    ];
  },

  // The partial racket cycle is forfeited, as at a capture; the census places the family in its new league.
  async onLevelUp(tx, { familyId, from, to, now }) {
    if (!changesLeague(from, to)) return [];
    const owned = await ownedRackets(tx, familyId);
    if (owned.length) {
      await tx.racket.updateMany({
        where: { id: { in: owned.map((r) => r.id) }, ownerFamilyId: familyId },
        data: { ownerFamilyId: "", neglectStrikes: 0, lastPayoutAt: now },
      });
    }
    const family = await tx.family.update({ where: { id: familyId }, data: { cityId: "" } });
    if (!CRIME_FAMILY_CONFIG.turfEnabled && owned.length === 0) return [];   // no turf, no unexplained league_move row
    await writeLedger(tx, {
      familyId, actorId: "system", type: "league_move", amount: 0, treasuryAfter: family.treasury, earningsAfter: family.earnings,
      meta: { from: leagueOf(from).key, to: leagueOf(to).key, released: owned.map((r) => r.key) },
    });
    return owned.length ? [`Released to the Street: ${owned.map((r) => r.name).join(", ")}.`] : [];
  },

  async racketsHeld(familyIds) {
    if (!CRIME_FAMILY_CONFIG.turfEnabled) return null;   // no turf, no rackets shown (P23)
    const rows = await prisma.racket.groupBy({ by: ["ownerFamilyId"], where: { ownerFamilyId: { in: familyIds } }, _count: { _all: true } });
    const held = new Map(rows.map((r) => [r.ownerFamilyId, r._count._all]));
    return new Map(familyIds.map((id) => [id, held.get(id) ?? 0]));
  },
};
