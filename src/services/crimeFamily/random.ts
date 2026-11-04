// The one randomness seam for Crime Families: every draw is crypto.randomInt
// through an injectable Rng, so tests script it and production never uses
// Math.random for money.
import { randomInt } from "crypto";

/** An integer in [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

export const cryptoRng: Rng = (maxExclusive) => randomInt(0, maxExclusive);

/** A unit roll in [0, 1) in 1/10,000 steps (spec 8.5). */
export function rollUnit(rng: Rng): number {
  return rng(10_000) / 10_000;
}
