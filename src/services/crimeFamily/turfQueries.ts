// Read seams for turf: the cities a viewer sees, the S16 map, S17 racket
// detail, the S18/S21 board and a family's live war. No writes.
import type { Racket, TurfCity, War } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { RACKETS, cityLabel, leagueDef, leagueOf, racketDef, type LeagueKey } from "../../data/crimeFamilyCatalog";
import { bidBlockers, isObjectId, loadBidContext } from "./bidService";
import { familyLabel } from "./familyQueries";
import { pickPlacementCity } from "./leagueRules";
import { can } from "./permissions";
import { FamilyError } from "./tx";
import { bidFloor, bidPhase, isBlackout, minNextBid, nextWarStart, scoresOf, soonestWar, type WarSide } from "./warMath";
import type { WarStatus } from "./warService";
import type { RacketDetailView, TurfMapView, TurfRacketLine, WarBoardView } from "./views";

const STREET = "the Street";
const LIVE_STATUSES: WarStatus[] = ["BIDDING", "ARMED", "ACTIVE"];
const TOP_HITTERS = 5;

export type TurfCityRef = { id: string; league: LeagueKey; number: number; label: string };
export type ViewerCity = { city: TurfCityRef; placed: boolean; family: { id: string; level: number } | null };
/** Only before the first boot seed (H11: city #1 of each league never closes). */
export const TURF_NOT_READY = "The turf map is not ready yet.";

function cityRef(c: Pick<TurfCity, "id" | "league" | "number">): TurfCityRef {
  return { id: c.id, league: leagueDef(c.league).key, number: c.number, label: cityLabel(c.league, c.number) };
}

/** "[TAG] Name" per family id; ids with no row are left out. */
async function labelsOf(ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const families = await prisma.family.findMany({ where: { id: { in: wanted } }, select: { id: true, tag: true, name: true } });
  return new Map(families.map((f) => [f.id, familyLabel(f)]));
}

/** OPEN cities, lowest number first (one league, or all). */
export function openCities(league?: LeagueKey): Promise<TurfCity[]> {
  return prisma.turfCity.findMany({ where: { status: "OPEN", ...(league ? { league } : {}) }, orderBy: { number: "asc" } });
}

/** Placed active families (activeMembers ≥ racketEligibleMin) per asked city; 0 when none. */
export async function citySizes(cityIds: string[]): Promise<Map<string, number>> {
  const groups = await prisma.family.groupBy({
    by: ["cityId"],
    where: { cityId: { in: cityIds }, activeMembers: { gte: CRIME_FAMILY_CONFIG.racketEligibleMin } },
    _count: { _all: true },
  });
  const sizes = new Map(cityIds.map((id) => [id, 0]));
  for (const g of groups) sizes.set(g.cityId, g._count._all);
  return sizes;
}

/** The OPEN city of the league a family would be placed in now. */
export async function placementTarget(league: LeagueKey): Promise<TurfCityRef> {
  const cities = await openCities(league);
  const sizes = await citySizes(cities.map((c) => c.id));
  const pick = pickPlacementCity(cities.map((c) => ({ cityId: c.id, number: c.number, size: sizes.get(c.id) ?? 0 })));
  const city = pick && cities.find((c) => c.id === pick.cityId);
  if (!city) throw new FamilyError(TURF_NOT_READY);
  return cityRef(city);
}

/**
 * H10: a placed family's own OPEN city (no league check, H18); an unplaced
 * family's placement target in its league (read-only); a non-member's Low Town #1.
 */
export async function viewerCity(viewerId: string): Promise<ViewerCity> {
  const member = await prisma.familyMember.findUnique({ where: { userId: viewerId }, select: { familyId: true } });
  const family = member
    ? await prisma.family.findUnique({ where: { id: member.familyId }, select: { id: true, level: true, cityId: true } })
    : null;
  if (!family) {
    const low = await prisma.turfCity.findUnique({ where: { league_number: { league: "BRONZE", number: 1 } } });
    if (!low) throw new FamilyError(TURF_NOT_READY);
    return { city: cityRef(low), placed: false, family: null };
  }
  const own = family.cityId === "" ? null : await prisma.turfCity.findFirst({ where: { id: family.cityId, status: "OPEN" } });
  const ref = { id: family.id, level: family.level };
  if (own) return { city: cityRef(own), placed: true, family: ref };
  return { city: await placementTarget(leagueOf(family.level).key), placed: false, family: ref };
}

/** The racket with this key in this city. */
export function racketInCity(cityId: string, key: string): Promise<Racket | null> {
  return prisma.racket.findUnique({ where: { cityId_key: { cityId, key } } });
}

/** The lines of one city's rackets (all, or the given ids) in `RACKETS` order, in 3 queries. */
async function racketLines(cityId: string, now: Date, racketIds?: string[]): Promise<TurfRacketLine[]> {
  const ids = racketIds ? { id: { in: racketIds } } : {};
  const rows = await prisma.racket.findMany({ where: { cityId, ...ids } });
  const wars = await prisma.war.findMany({
    where: { cityId, status: { in: LIVE_STATUSES }, ...(racketIds ? { racketId: { in: racketIds } } : {}) },
    orderBy: { startsAt: "desc" },
  });
  const latest = new Map<string, War>();
  for (const w of wars) if (!latest.has(w.racketId)) latest.set(w.racketId, w);
  const labels = await labelsOf([...rows.map((r) => r.ownerFamilyId), ...wars.map((w) => w.topBidderFamilyId)]);
  const order = (key: string) => RACKETS.findIndex((d) => d.key === key);

  return [...rows].sort((a, b) => order(a.key) - order(b.key)).map((row) => {
    const owner = row.ownerFamilyId;
    const war = latest.get(row.id);
    const nextWarAt = nextWarStart(row, now);
    return {
      racketId: row.id, cityId: row.cityId, key: row.key, name: row.name, class: row.class as TurfRacketLine["class"], income: row.incomePerCycle,
      ownerFamilyId: owner, ownerLabel: (owner && labels.get(owner)) || STREET, strikes: row.neglectStrikes,
      war: war
        ? {
          id: war.id, status: war.status as WarStatus, topBid: war.topBid,
          topBidderLabel: war.topBidderFamilyId ? labels.get(war.topBidderFamilyId) ?? null : null,
          bidClosesAt: war.bidClosesAt, startsAt: war.startsAt,
        }
        : null,
      nextWarAt,
      bidding: bidPhase(nextWarAt, now),
    };
  });
}

/** S16: the asked city when it is an OPEN city, else the viewer's (H10: a stale button never errors). */
export async function getTurfMapView(viewerId: string, cityId: string | null, now: Date): Promise<TurfMapView> {
  const asked = cityId && isObjectId(cityId) ? await prisma.turfCity.findFirst({ where: { id: cityId, status: "OPEN" } }) : null;
  const city = asked ? cityRef(asked) : (await viewerCity(viewerId)).city;
  return { city, rackets: await racketLines(city.id, now), nextWar: soonestWar(now) };
}

/** S17: the bid figures and the viewer's blockers, from the same context placeBid checks (read-only). */
export async function getRacketDetailView(racketId: string, viewerId: string, now: Date): Promise<RacketDetailView> {
  const member = await prisma.familyMember.findUnique({ where: { userId: viewerId }, select: { familyId: true } });
  const ctx = await loadBidContext(prisma, member?.familyId ?? null, viewerId, racketId, now);
  const { racket } = ctx;
  const [line] = await racketLines(racket.cityId, now, [racket.id]);
  const city = await prisma.turfCity.findUniqueOrThrow({ where: { id: racket.cityId } });
  const blockers = bidBlockers(ctx);
  const floor = bidFloor(racket);
  return {
    line, floor, minBid: minNextBid(ctx.war?.topBid ?? 0, floor), city: cityRef(city),
    viewerIsOfficer: ctx.member ? can(ctx.member, "bid", now) : false, canBid: blockers.length === 0, blockers,
  };
}

export async function getWarBoardView(warId: string, now: Date): Promise<WarBoardView> {
  const war = await prisma.war.findUnique({ where: { id: warId } });
  const def = war && racketDef(war.racketKey);
  if (!war || !def) throw new FamilyError("This war is over.");
  const contributions = await prisma.warContribution.findMany({ where: { warId }, select: { userId: true, side: true, hits: true, points: true } });
  const labels = await labelsOf([war.attackerFamilyId, war.defenderFamilyId]);
  const side = (familyId: string) => ({ familyId, label: (familyId && labels.get(familyId)) || STREET });
  const ofSide = (s: WarSide) => contributions.filter((c) => c.side === s);
  const top = (s: WarSide) => ofSide(s)
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, TOP_HITTERS)
    .map((c) => ({ userId: c.userId, points: c.points }));
  const hits = (s: WarSide) => ofSide(s).reduce((sum, c) => sum + c.hits, 0);
  return {
    warId: war.id, racketKey: war.racketKey, racketName: def.name, racketClass: def.class, startsAt: war.startsAt, endsAt: war.endsAt,
    attacker: side(war.attackerFamilyId), defender: side(war.defenderFamilyId), scores: scoresOf(war),
    hits: { atk: hits("ATK"), def: hits("DEF") }, top: { atk: top("ATK"), def: top("DEF") }, blackout: isBlackout(war.endsAt, now),
  };
}

/** The family's ARMED or ACTIVE war, attacking or defending (wars never overlap: each racket has its own window). */
export function getLiveWarFor(familyId: string): Promise<War | null> {
  return prisma.war.findFirst({
    where: { status: { in: ["ARMED", "ACTIVE"] }, OR: [{ attackerFamilyId: familyId }, { defenderFamilyId: familyId }] },
  });
}
