// Pure league math (amendment 6.3–6.4): how many cities a league needs, which
// city a family joins, the rebalance plan and the next census. No I/O.
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";

const DAY_MS = 86_400_000;

/** Cities a league needs for its active families: max(1, ceil(n / familiesPerCity)). */
export function citiesFor(activeFamilies: number): number {
  return Math.max(1, Math.ceil(activeFamilies / CRIME_FAMILY_CONFIG.familiesPerCity));
}

export type CitySize = { cityId: string; number: number; size: number };

/** The city a family joins: the fewest families, ties to the lowest number; null when none is open. */
export function pickPlacementCity(cities: CitySize[]): CitySize | null {
  return [...cities].sort((a, b) => a.size - b.size || a.number - b.number)[0] ?? null;
}

export type RebalanceFamily = { familyId: string; cityId: string; placedAt: Date; movable: boolean };
export type RebalanceMove = { familyId: string; from: string; to: string };

/**
 * The moves that even out one league's OPEN cities (A43). `families` holds the
 * placed active families of those cities. Each step moves the most recently
 * placed movable family from the fullest city that has one to the emptiest,
 * while the gap is at least the slack and a city sits outside avg ± slack.
 * Each move lowers the sum of squared city sizes, so the loop ends.
 */
export function planRebalance(cities: { cityId: string; number: number }[], families: RebalanceFamily[]): RebalanceMove[] {
  const s = CRIME_FAMILY_CONFIG.cityRebalanceSlack;
  if (s < 2) throw new Error("cityRebalanceSlack must be at least 2");
  const avg = families.length / cities.length;
  // each city's families, newest placement first
  const members = new Map(cities.map((c) => [c.cityId, [] as RebalanceFamily[]]));
  for (const f of [...families].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())) members.get(f.cityId)!.push(f);
  const size = (c: { cityId: string }) => members.get(c.cityId)!.length;
  const moves: RebalanceMove[] = [];
  for (;;) {
    const empty = [...cities].sort((a, b) => size(a) - size(b) || a.number - b.number)[0];
    const full = cities
      .filter((c) => members.get(c.cityId)!.some((f) => f.movable))
      .sort((a, b) => size(b) - size(a) || b.number - a.number)[0];
    if (!full) break;
    const gap = size(full) - size(empty);
    if (gap < s || !(size(full) > avg + s || size(empty) < avg - s)) break;
    const from = members.get(full.cityId)!;
    const fam = from.splice(from.findIndex((f) => f.movable), 1)[0];
    members.get(empty.cityId)!.unshift(fam);
    moves.push({ familyId: fam.familyId, from: full.cityId, to: empty.cityId });
  }
  return moves;
}

/** The next 00:10 UTC strictly after `now`: the run of the hourly census job that claims the day (H8). */
export function nextCensusAt(now: Date): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 10);
  return new Date(today <= now.getTime() ? today + DAY_MS : today);
}
