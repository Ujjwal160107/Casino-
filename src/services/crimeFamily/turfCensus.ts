// The turf census steps (amendment 6.3–6.4, A22–A27, A43): each league's
// cities are opened, counted as surplus and closed, unplaced active families
// placed, and movable families rebalanced. Each write is one runFamilyTx behind
// a CAS; a rerun after a crash repeats only what did not commit.
import type { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { TURF_LEAGUES, cityLabel, leagueDef, type LeagueKey } from "../../data/crimeFamilyCatalog";
import { turfCityMovedNotice } from "../dmNoticeService";
import type { CensusNotice, CensusStep } from "./census";
import { listMembers } from "./familyQueries";
import { citiesFor, pickPlacementCity, planRebalance } from "./leagueRules";
import { ensureCity } from "./turfCities";
import { citySizes, openCities } from "./turfQueries";
import { familiesWithStake, turfStake } from "./turfStake";
import { runFamilyTx } from "./tx";
import { utcDayKey } from "./vaultService";

type Placement = { familyId: string; cityId: string };

/** Rolls a city transaction back: the city is no longer OPEN, or still has turf in play. Never retried. */
class CityBusy extends Error {
  constructor() {
    super("City busy");
    this.name = "CityBusy";
  }
}

const levelRange = (league: LeagueKey) => {
  const def = leagueDef(league);
  return { gte: def.minLevel, lte: def.maxLevel };
};
const activeMin = () => ({ gte: CRIME_FAMILY_CONFIG.racketEligibleMin });

/**
 * Writes an OPEN city's document so a racing closure conflicts with this
 * placement or move (the closeBidding touch: always later than the stored value).
 */
async function touchCity(tx: Prisma.TransactionClient, cityId: string, now: Date): Promise<boolean> {
  const city = await tx.turfCity.findUnique({ where: { id: cityId }, select: { status: true, updatedAt: true } });
  if (city?.status !== "OPEN") return false;
  await tx.turfCity.update({ where: { id: cityId }, data: { updatedAt: new Date(Math.max(now.getTime(), city.updatedAt.getTime() + 1)) } });
  return true;
}

/** One family's census write; a lost race or error is logged and the family waits for the next census. */
async function censusWrite(what: string, familyId: string, fn: (tx: Prisma.TransactionClient) => Promise<boolean>): Promise<boolean> {
  try {
    return await runFamilyTx(fn);
  } catch (err) {
    if (!(err instanceof CityBusy)) console.error(`[crimeFamily] census ${what} ${familyId} error`, err);
    return false;
  }
}

/**
 * A27: closes an OPEN city with nothing at stake in one transaction. The
 * closure cancels its unbid BIDDING wars (the documents a racing bid writes),
 * then re-reads that no racket is owned and no war is live, and unplaces
 * every family placed there.
 */
export async function closeCityIfIdle(cityId: string, now: Date): Promise<{ closed: boolean; cleared: string[] }> {
  try {
    return await runFamilyTx<{ closed: boolean; cleared: string[] }>(async (tx) => {
      const { count } = await tx.turfCity.updateMany({
        where: { id: cityId, status: "OPEN" }, data: { status: "CLOSED", closedAt: now, surplusDays: 0, surplusDayKey: "" },
      });
      if (count !== 1) return { closed: false, cleared: [] };
      await tx.war.updateMany({ where: { cityId, status: "BIDDING", topBidderFamilyId: "" }, data: { status: "CANCELLED" } });
      const owned = await tx.racket.count({ where: { cityId, ownerFamilyId: { not: "" } } });
      const live = await tx.war.count({ where: { cityId, status: { in: ["BIDDING", "ARMED", "ACTIVE", "SETTLING"] } } });
      if (owned > 0 || live > 0) throw new CityBusy();
      const cleared = (await tx.family.findMany({ where: { cityId }, select: { id: true } })).map((f) => f.id);
      await tx.family.updateMany({ where: { cityId }, data: { cityId: "" } });
      return { closed: true, cleared };
    });
  } catch (err) {
    if (err instanceof CityBusy) return { closed: false, cleared: [] };
    throw err;
  }
}

/**
 * 6.3: opens cities up to the league's target (reopening the lowest-numbered
 * CLOSED city first), counts surplus once per UTC day while there are more
 * OPEN cities than the target (H12), and closes the highest-numbered OPEN city
 * once its surplus reaches citySurplusDaysToClose and it is idle.
 */
export async function syncLeagueCities(league: LeagueKey, now: Date): Promise<{ target: number; opened: number[]; closed: number[]; cleared: string[] }> {
  const active = await prisma.family.count({ where: { level: levelRange(league), activeMembers: activeMin() } });
  const target = citiesFor(active);
  const opened: number[] = [];
  const closed: number[] = [];
  const cleared: string[] = [];
  const openCount = () => prisma.turfCity.count({ where: { league, status: "OPEN" } });

  while ((await openCount()) < target) {
    const reopen = await prisma.turfCity.findFirst({ where: { league, status: "CLOSED" }, orderBy: { number: "asc" } });
    if (reopen) {
      const { count } = await prisma.turfCity.updateMany({
        where: { id: reopen.id, status: "CLOSED" }, data: { status: "OPEN", openedAt: now, surplusDays: 0, surplusDayKey: "" },
      });
      if (count === 1) opened.push(reopen.number);
    } else {
      const last = await prisma.turfCity.findFirst({ where: { league }, orderBy: { number: "desc" }, select: { number: true } });
      opened.push((await ensureCity(league, (last?.number ?? 0) + 1)).number);
    }
  }

  const today = utcDayKey(now);
  if ((await openCount()) > target) {
    await prisma.turfCity.updateMany({
      where: { league, status: "OPEN", surplusDayKey: { not: today } }, data: { surplusDays: { increment: 1 }, surplusDayKey: today },
    });
    while ((await openCount()) > target) {
      const top = await prisma.turfCity.findFirst({ where: { league, status: "OPEN" }, orderBy: { number: "desc" } });
      if (!top || top.surplusDays < CRIME_FAMILY_CONFIG.citySurplusDaysToClose) break;
      const result = await closeCityIfIdle(top.id, now);
      if (!result.closed) break;
      closed.push(top.number);
      cleared.push(...result.cleared);
    }
  } else {
    await prisma.turfCity.updateMany({ where: { league, status: "OPEN", surplusDays: { not: 0 } }, data: { surplusDays: 0, surplusDayKey: today } });
  }
  return { target, opened, closed, cleared };
}

/**
 * 6.4 step 4: every active family of the league not in one of its OPEN cities
 * (or only the given ids) joins the OPEN city with the fewest placed active
 * families, most active first. The CAS also checks the level (H14), so a
 * racing league-changing level-up wins. Sends nothing (6.9).
 */
export async function placeUnplaced(league: LeagueKey, now: Date, only?: string[]): Promise<Placement[]> {
  const cities = await openCities(league);
  const openIds = new Set(cities.map((c) => c.id));
  const sizes = await citySizes([...openIds]);
  const level = levelRange(league);
  const candidates = await prisma.family.findMany({
    where: { level, activeMembers: activeMin(), ...(only ? { id: { in: only } } : {}) },
    orderBy: [{ activeMembers: "desc" }, { createdAt: "asc" }],
    select: { id: true, cityId: true },
  });
  const placed: Placement[] = [];
  for (const f of candidates) {
    if (openIds.has(f.cityId)) continue;
    const pick = pickPlacementCity(cities.map((c) => ({ cityId: c.id, number: c.number, size: sizes.get(c.id) ?? 0 })));
    if (!pick) break;
    const ok = await censusWrite("place", f.id, async (tx) => {
      const { count } = await tx.family.updateMany({ where: { id: f.id, cityId: f.cityId, level }, data: { cityId: pick.cityId, cityPlacedAt: now } });
      if (count !== 1) return false;
      if (!(await touchCity(tx, pick.cityId, now))) throw new CityBusy();
      return true;
    });
    if (!ok) continue;
    sizes.set(pick.cityId, pick.size + 1);
    placed.push({ familyId: f.id, cityId: pick.cityId });
  }
  return placed;
}

/**
 * 6.4 step 5 (A43): moves movable families from the fullest OPEN city to the
 * emptiest per planRebalance; each move re-checks the family's stake inside
 * its transaction (edge 12).
 */
export async function rebalanceLeague(league: LeagueKey, now: Date): Promise<Placement[]> {
  const cities = await openCities(league);
  if (cities.length < 2) return [];
  const ids = cities.map((c) => c.id);
  const families = await prisma.family.findMany({
    where: { cityId: { in: ids }, activeMembers: activeMin() }, select: { id: true, cityId: true, cityPlacedAt: true },
  });
  const staked = await familiesWithStake(prisma, ids);
  const plan = planRebalance(
    cities.map((c) => ({ cityId: c.id, number: c.number })),
    families.map((f) => ({ familyId: f.id, cityId: f.cityId, placedAt: f.cityPlacedAt, movable: !staked.has(f.id) })),
  );
  const moved: Placement[] = [];
  for (const m of plan) {
    const ok = await censusWrite("move", m.familyId, async (tx) => {
      const stake = await turfStake(tx, m.familyId);
      if (stake.rackets + stake.topBids + stake.liveWars > 0) return false;
      const { count } = await tx.family.updateMany({ where: { id: m.familyId, cityId: m.from }, data: { cityId: m.to, cityPlacedAt: now } });
      if (count !== 1) return false;
      if (!(await touchCity(tx, m.to, now))) throw new CityBusy();
      return true;
    });
    if (ok) moved.push({ familyId: m.familyId, cityId: m.to });
  }
  return moved;
}

/** One "New city" DM batch per moved family, to all its members (6.9). */
async function movedNotices(moves: Placement[]): Promise<CensusNotice[]> {
  if (moves.length === 0) return [];
  const cities = await prisma.turfCity.findMany({ where: { id: { in: [...new Set(moves.map((m) => m.cityId))] } } });
  const labels = new Map(cities.map((c) => [c.id, cityLabel(c.league, c.number)]));
  const notices: CensusNotice[] = [];
  for (const m of moves) {
    const label = labels.get(m.cityId)!;
    notices.push({ type: "turf", userIds: (await listMembers(m.familyId)).map((u) => u.userId), build: () => turfCityMovedNotice({ cityLabel: label }) });
  }
  return notices;
}

/** Runs `fn` for each league in order, only while turf is on (Review Focus 4). */
async function eachLeague(fn: (league: LeagueKey) => Promise<CensusNotice[]>): Promise<CensusNotice[]> {
  if (!CRIME_FAMILY_CONFIG.turfEnabled) return [];
  const notices: CensusNotice[] = [];
  for (const l of TURF_LEAGUES) notices.push(...(await fn(l.key)));
  return notices;
}

/**
 * Census steps 3–5. A family a closure unplaced is re-placed by the cities
 * step itself and told its new city; turf_placement's first placements are silent.
 */
export const TURF_CENSUS_STEPS: CensusStep[] = [
  {
    key: "turf_cities",
    run: (now) => eachLeague(async (league) => {
      const { cleared } = await syncLeagueCities(league, now);
      return cleared.length > 0 ? movedNotices(await placeUnplaced(league, now, cleared)) : [];
    }),
  },
  {
    key: "turf_placement",
    run: (now) => eachLeague(async (league) => {
      await placeUnplaced(league, now);
      return [];
    }),
  },
  {
    key: "turf_rebalance",
    run: (now) => eachLeague(async (league) => movedNotices(await rebalanceLeague(league, now))),
  },
];
