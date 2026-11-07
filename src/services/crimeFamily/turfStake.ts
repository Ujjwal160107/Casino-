// Whether a family has turf at stake (amendment 6.4 step 5, 6.6; H13): a racket
// it owns, a top bid in a BIDDING war, or a side of an ARMED, ACTIVE or
// SETTLING war. One definition for the census rebalance and the level-up hook.
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

export type TurfStake = { rackets: number; topBids: number; liveWars: number };

const LIVE_WAR = ["ARMED", "ACTIVE", "SETTLING"];

/** One family's stake. Sequential reads: queries on one transaction's session never run concurrently. */
export async function turfStake(db: Db, familyId: string): Promise<TurfStake> {
  const rackets = await db.racket.count({ where: { ownerFamilyId: familyId } });
  const topBids = await db.war.count({ where: { status: "BIDDING", topBidderFamilyId: familyId } });
  const liveWars = await db.war.count({
    where: { status: { in: LIVE_WAR }, OR: [{ attackerFamilyId: familyId }, { defenderFamilyId: familyId }] },
  });
  return { rackets, topBids, liveWars };
}

/** Every family with a stake in these cities: racket owners, top bidders of BIDDING wars and both sides of live wars. */
export async function familiesWithStake(db: Db, cityIds: string[]): Promise<Set<string>> {
  const owners = await db.racket.findMany({ where: { cityId: { in: cityIds }, ownerFamilyId: { not: "" } }, select: { ownerFamilyId: true } });
  const wars = await db.war.findMany({
    where: { cityId: { in: cityIds }, status: { in: ["BIDDING", ...LIVE_WAR] } },
    select: { status: true, topBidderFamilyId: true, attackerFamilyId: true, defenderFamilyId: true },
  });
  const ids = owners.map((r) => r.ownerFamilyId);
  for (const w of wars) {
    if (w.status === "BIDDING") ids.push(w.topBidderFamilyId);
    else ids.push(w.attackerFamilyId, w.defenderFamilyId);
  }
  return new Set(ids.filter(Boolean));
}
