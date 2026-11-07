// Turf bidding (spec 9.4): who may bid on a racket's weekly war, the 14-day
// pair rule, the bid amount text, and placing a bid: earnings into escrow,
// the outbid family refunded, the top bid moved by compare-and-swap.
import type { Prisma, PrismaClient } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes, parsePositiveAmount } from "../../utils/format";
import { RACKETS, WAR_RULES, cityLabel, levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { checkJailStatus } from "../jailService";
import { familyLabel, getMembership, isUnderInvestigation } from "./familyQueries";
import { nextCensusAt } from "./leagueRules";
import { can } from "./permissions";
import { FamilyError, runFamilyTx, VaultShort } from "./tx";
import { creditEarnings, spendFromVault } from "./vaultService";
import { bidFloor, minNextBid, type RacketClass } from "./warMath";

type Db = Prisma.TransactionClient | PrismaClient;

export interface BidContext {
  now: Date;
  member: { role: FamilyRole; joinedAt: Date } | null;
  jailed: boolean;
  family: { id: string; level: number; duesArrears: number; homeChannelId: string; cityId: string } | null;
  /** The family's city's label when it is placed, else null. */
  familyCityLabel: string | null;
  underInvestigation: boolean;
  racket: { id: string; key: string; name: string; ownerFamilyId: string; class: RacketClass; cityId: string; cityLabel: string; incomePerCycle: number };
  war: { id: string; status: string; startsAt: Date; bidClosesAt: Date; topBid: number; topBidderFamilyId: string } | null;
  held: number;
  liveBids: number;
  crownsHeldOrBid: number;
  pairBlocked: boolean;
}

export type BidResult = {
  warId: string; racketId: string; racketKey: string; racketName: string; amount: number; familyId: string; familyLabel: string;
  startsAt: Date; bidClosesAt: Date; ownerFamilyId: string; previous: { familyId: string; amount: number } | null;
};

const NOT_IN_FAMILY = "You are not in a crime family.";
const ALL_WORDS = /^(all|max|allin)$/i;
const BARE_FRACTION = /^[\d,]*\.\d*$/;   // "2.5": parsePositiveAmount floors it, a bid refuses it
// "8.03m": parseSmartAmount's float multiply floors it to 8,029,999, so suffixed bids use string digits.
const SUFFIXED = /^(\d[\d,]*)(?:\.(\d+))?([kmb])$/i;
const SUFFIX_PLACES: Record<string, number> = { k: 3, m: 6, b: 9 };
export const BAD_AMOUNT = "Enter an amount like 2.1m or 2,100,000.";
const EARNINGS_SHORT = "Not enough earnings for this bid (bids never use the treasury). Check `!crew vault`.";
const CROWN_KEYS = RACKETS.filter((r) => r.class === "CROWN").map((r) => r.key);
const AFTER_BIDDING = ["ARMED", "ACTIVE", "SETTLING"];
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/** A 24-hex id: checked before any findUnique on an id from a customId (Prisma throws on a malformed ObjectId). */
export function isObjectId(s: string): boolean {
  return OBJECT_ID.test(s);
}

/** 6.6: why an unplaced family may not bid yet, and when the census next runs. */
export function noCityLine(now: Date): string {
  return `Your family has no city yet: it gets one at the daily census once ${CRIME_FAMILY_CONFIG.racketEligibleMin} members are active (next <t:${unix(nextCensusAt(now))}:R>).`;
}

/** Every reason this family may not bid now, in the order the player reads them (pure). */
export function bidBlockers(ctx: BidContext): string[] {
  const { member, family, racket, war } = ctx;
  if (!member || !family) return [NOT_IN_FAMILY];
  const out: string[] = [];
  // No league check (H18): placement and the level-up keep a family's city in its league.
  if (family.cityId === "") out.push(noCityLine(ctx.now));
  else if (family.cityId !== racket.cityId) out.push(`This racket is in ${racket.cityLabel}. Your family plays in ${ctx.familyCityLabel}.`);
  if (!can(member, "bid", ctx.now)) out.push("Only the Boss or Underboss can bid.");
  if (ctx.jailed) out.push("You can't bid while jailed.");
  if (!war) out.push("Bidding is not open for this racket.");
  if (racket.ownerFamilyId === family.id) out.push("You already own this racket.");
  if (war && war.topBidderFamilyId === family.id) out.push("You already hold the top bid.");
  if (family.duesArrears > 0) out.push("Clear dues arrears first.");
  if (ctx.underInvestigation) out.push("Your family is under investigation.");
  if (!family.homeChannelId) out.push("Set a home channel first (`!crew home`).");
  const cap = levelDef(family.level).racketCap;
  if (ctx.held + ctx.liveBids + 1 > cap) out.push(`Racket cap reached (${ctx.held + ctx.liveBids}/${cap} held or bid).`);
  if (racket.class === "CROWN" && ctx.crownsHeldOrBid + 1 > WAR_RULES.crownCap) out.push("Only one Crown racket at a time, held or bid on.");
  if (ctx.pairBlocked) out.push("Blocked: your families shared a Boss or two members in the last 14 days.");
  return out;
}

/** Distinct current members of `fromFamilyId` who left `intoFamilyId` since `since`. */
async function membersFrom(db: Db, fromFamilyId: string, intoFamilyId: string, since: Date): Promise<number> {
  const members = await db.familyMember.findMany({ where: { familyId: fromFamilyId }, select: { userId: true } });
  if (members.length === 0) return 0;
  const exits = await db.familyExit.findMany({
    where: { familyId: intoFamilyId, userId: { in: members.map((m) => m.userId) }, leftAt: { gte: since } },
    select: { userId: true },
  });
  return new Set(exits.map((e) => e.userId)).size;
}

/**
 * D28: a family may not bid on a racket held by a family it shared a Boss
 * with (either current Boss left the other family) or two members with, in
 * the last pairRuleSeconds. The Street (owner "") never blocks.
 */
export async function pairRuleBlocks(db: Db, bidderFamilyId: string, ownerFamilyId: string, now: Date): Promise<boolean> {
  if (ownerFamilyId === "") return false;
  const since = new Date(now.getTime() - CRIME_FAMILY_CONFIG.pairRuleSeconds * 1000);
  const families = await db.family.findMany({ where: { id: { in: [bidderFamilyId, ownerFamilyId] } }, select: { id: true, bossId: true } });
  const bossOf = (id: string) => families.find((f) => f.id === id)?.bossId ?? "";
  const bossExits = await db.familyExit.count({
    where: {
      leftAt: { gte: since },
      OR: [
        { userId: bossOf(bidderFamilyId), familyId: ownerFamilyId },
        { userId: bossOf(ownerFamilyId), familyId: bidderFamilyId },
      ],
    },
  });
  if (bossExits > 0) return true;
  return (await membersFrom(db, bidderFamilyId, ownerFamilyId, since)) >= 2
    || (await membersFrom(db, ownerFamilyId, bidderFamilyId, since)) >= 2;
}

/** A bid amount: never `all`/`max`/`allin` (T6) nor a fraction of a fortune; null means "Enter an amount like 2.1m or 2,100,000.". */
export function parseBidAmount(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s || ALL_WORDS.test(s) || BARE_FRACTION.test(s)) return null;
  const m = SUFFIXED.exec(s);
  if (!m) return parsePositiveAmount(s, Number.MAX_SAFE_INTEGER);
  const places = SUFFIX_PLACES[m[3].toLowerCase()];
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > places) return null;   // "1.0001k" is a fraction of a fortune
  const n = Number(m[1].replace(/,/g, "") + frac.padEnd(places, "0"));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Everything bidBlockers reads, for one viewer and racket. placeBid calls it
 * inside its transaction (so every retry re-checks); the S17 view calls it on
 * the global client, read-only.
 */
export async function loadBidContext(db: Db, familyId: string | null, viewerId: string, racketId: string, now: Date): Promise<BidContext> {
  if (!isObjectId(racketId)) throw new FamilyError("Unknown racket.");
  // Sequential reads: queries on one transaction's session never run concurrently.
  const racket = await db.racket.findUnique({
    where: { id: racketId },
    select: { id: true, key: true, name: true, class: true, cityId: true, ownerFamilyId: true, incomePerCycle: true },
  });
  if (!racket) throw new FamilyError("Unknown racket.");
  const city = await db.turfCity.findUniqueOrThrow({ where: { id: racket.cityId }, select: { league: true, number: true } });
  const row = await db.familyMember.findUnique({ where: { userId: viewerId } });
  const war = await db.war.findFirst({
    where: { racketId, status: "BIDDING", bidClosesAt: { gt: now } },
    select: { id: true, status: true, startsAt: true, bidClosesAt: true, topBid: true, topBidderFamilyId: true },
  });
  const base = {
    now, jailed: false, underInvestigation: false, war, held: 0, liveBids: 0, crownsHeldOrBid: 0, pairBlocked: false, familyCityLabel: null,
    racket: { ...racket, class: racket.class as RacketClass, cityLabel: cityLabel(city.league, city.number) },
  };
  const family = familyId && row?.familyId === familyId
    ? await db.family.findUnique({ where: { id: familyId }, select: { id: true, level: true, duesArrears: true, homeChannelId: true, cityId: true } })
    : null;
  if (!row || !family) return { ...base, member: null, family: null };
  const own = family.cityId === "" ? null
    : family.cityId === racket.cityId ? city
    : await db.turfCity.findUnique({ where: { id: family.cityId }, select: { league: true, number: true } });

  const notThisWar = war ? { id: { not: war.id } } : {};
  const liveWhere = (extra: Prisma.WarWhereInput): Prisma.WarWhereInput => ({
    ...notThisWar, ...extra,
    OR: [{ status: "BIDDING", topBidderFamilyId: family.id }, { status: { in: AFTER_BIDDING }, attackerFamilyId: family.id }],
  });
  const jail = await checkJailStatus(viewerId);
  const underInvestigation = await isUnderInvestigation(family.id);
  const held = await db.racket.count({ where: { ownerFamilyId: family.id } });
  const liveBids = await db.war.count({ where: liveWhere({}) });
  const crownWars = await db.war.count({ where: liveWhere({ racketKey: { in: CROWN_KEYS } }) });
  const crownsHeld = await db.racket.count({ where: { ownerFamilyId: family.id, class: "CROWN" } });
  const pairBlocked = await pairRuleBlocks(db, family.id, base.racket.ownerFamilyId, now);
  return {
    ...base, member: { role: row.role as FamilyRole, joinedAt: row.joinedAt }, family, familyCityLabel: own ? cityLabel(own.league, own.number) : null,
    jailed: jail.isJailed, underInvestigation, held, liveBids, crownsHeldOrBid: crownWars + crownsHeld, pairBlocked,
  };
}

/**
 * Spec 9.4: earnings-only escrow (never the treasury), the outbid family
 * refunded to earnings, and a CAS on the top bid so two bids in the same
 * second leave exactly one standing (edge 13).
 */
export async function placeBid(input: { racketId: string; actorId: string; amount: number; now?: Date }): Promise<BidResult> {
  const now = input.now ?? new Date();
  const { racketId, actorId, amount } = input;
  const membership = await getMembership(actorId);

  return runFamilyTx(async (tx) => {
    const ctx = await loadBidContext(tx, membership?.family.id ?? null, actorId, racketId, now);
    const blocker = bidBlockers(ctx)[0];
    if (blocker) throw new FamilyError(blocker);
    const family = ctx.family!;
    const war = ctx.war!;
    const racketKey = ctx.racket.key;
    const floor = bidFloor(ctx.racket);

    if (!Number.isSafeInteger(amount) || amount <= 0) throw new FamilyError(BAD_AMOUNT);
    const min = minNextBid(war.topBid, floor);
    if (amount < min) {
      throw new FamilyError(war.topBid === 0
        ? `Bid at least the floor of ${fmtFortunes(floor)}.`
        : `The top bid is ${fmtFortunes(war.topBid)}. Bid at least ${fmtFortunes(min)}.`);
    }

    try {
      await spendFromVault(tx, family.id, amount, "bid_escrow", actorId, { warId: war.id, racketKey }, { earningsOnly: true });
    } catch (err) {
      if (err instanceof VaultShort) throw new FamilyError(EARNINGS_SHORT);
      throw err;
    }
    const previous = war.topBidderFamilyId ? { familyId: war.topBidderFamilyId, amount: war.topBid } : null;
    if (previous) {
      await creditEarnings(tx, previous.familyId, previous.amount, "bid_refund", "system", { warId: war.id, outbidBy: family.id });
    }

    const { count } = await tx.war.updateMany({
      where: { id: war.id, status: "BIDDING", bidClosesAt: { gt: now }, topBid: war.topBid, topBidderFamilyId: war.topBidderFamilyId },
      data: { topBid: amount, topBidderFamilyId: family.id },
    });
    if (count !== 1) {
      const fresh = await tx.war.findUnique({ where: { id: war.id }, select: { topBid: true } });
      throw new FamilyError(`Outbid while you were bidding: top is now ${fmtFortunes(fresh?.topBid ?? 0)}.`);
    }

    const named = await tx.family.findUniqueOrThrow({ where: { id: family.id }, select: { tag: true, name: true } });
    return {
      warId: war.id, racketId, racketKey, racketName: ctx.racket.name, amount, familyId: family.id, familyLabel: familyLabel(named),
      startsAt: war.startsAt, bidClosesAt: war.bidClosesAt, ownerFamilyId: ctx.racket.ownerFamilyId, previous,
    };
  });
}
