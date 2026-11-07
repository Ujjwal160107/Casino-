// The city map's rows (amendment 6.3): a city and its 10 rackets, created or
// refreshed by upsert, never touching ownership, timers, strikes or the
// opened period.
import type { TurfCity } from "@prisma/client";
import prisma from "../../utils/prisma";
import { LEAGUE_RACKET_INCOME, RACKETS, RACKET_CLASSES, TURF_LEAGUES, leagueDef, type LeagueKey, type RacketDef } from "../../data/crimeFamilyCatalog";
import { isUniqueViolation } from "./tx";

/** No transaction is open, so a P2002 from a concurrent first create is caught and the write run once more. */
async function retryOnce<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return write();
  }
}

function upsertCityRacket(city: { id: string; league: string }, r: RacketDef) {
  const league = leagueDef(city.league).key;
  const def = {
    name: r.name, class: r.class, league, incomePerCycle: LEAGUE_RACKET_INCOME[league][r.class],
    baseDefense: RACKET_CLASSES[r.class].baseline, warDow: r.warDow, warHourUtc: r.warHourUtc,
  };
  return prisma.racket.upsert({
    where: { cityId_key: { cityId: city.id, key: r.key } }, create: { cityId: city.id, key: r.key, ...def }, update: def,
  });
}

/** The city's 10 racket definitions, by [cityId, key] (edge 61: never owner, timers, strikes or openedPeriodKey). */
export async function seedCityRackets(city: { id: string; league: string }): Promise<void> {
  for (const r of RACKETS) await retryOnce(() => upsertCityRacket(city, r));
}

/** The city by [league, number], created OPEN when missing, with its 10 rackets. */
export async function ensureCity(league: LeagueKey, number: number): Promise<TurfCity> {
  const city = await retryOnce(() => prisma.turfCity.upsert({
    where: { league_number: { league, number } }, create: { league, number }, update: {},
  }));
  await seedCityRackets(city);
  return city;
}

/**
 * Boot (job shard): city #1 of each league, then every other city's racket
 * definitions (OPEN or CLOSED, so a reopened city's definitions are current).
 */
export async function seedTurf(): Promise<void> {
  const firsts = new Set<string>();
  for (const l of TURF_LEAGUES) firsts.add((await ensureCity(l.key, 1)).id);
  const others = await prisma.turfCity.findMany({ where: { id: { notIn: [...firsts] } }, select: { id: true, league: true } });
  for (const city of others) await seedCityRackets(city);
}
