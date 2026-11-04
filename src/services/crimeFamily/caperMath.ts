// Pure caper rules (spec 8.2, 8.5, 8.6): the patrol chance, the outcome, the
// pool split and the crew edge. Integer percent arithmetic only, so every
// figure matches the spec tables exactly.
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { CRIME_PREP_WHITELIST } from "../../data/crimePrepWhitelist";
import { CAPER_OUTCOME_PCT, CAPER_SPLIT_PCT, caperRole, type CaperRoleKey } from "../../data/crimeFamilyCatalog";

export type CaperOutcome = "CLEAN" | "MESSY" | "BUST";

/** q = min(cap, base × (1 − edge) + perPoint × H), rounded to 6 decimals so 0.1 × 0.9 is exactly 0.09. */
export function patrolChance(base: number, edge: number, hottestHeat: number): number {
  const q = base * (1 - edge) + CRIME_FAMILY_CONFIG.heatPenaltyPerPoint * hottestHeat;
  return Math.round(Math.min(CRIME_FAMILY_CONFIG.patrolCap, q) * 1e6) / 1e6;
}

/** Spec 8.5: misses at bustAt Bust, any miss is Messy, a perfect run is Messy below q. */
export function resolveCaperOutcome(i: { n: number; misses: number; roll: number; base: number; edge: number; hottestHeat: number }): CaperOutcome {
  const bustAt = i.n <= 4 ? 2 : 3;
  if (i.misses >= bustAt) return "BUST";
  if (i.misses >= 1) return "MESSY";
  return i.roll < patrolChance(i.base, i.edge, i.hottestHeat) ? "MESSY" : "CLEAN";
}

/** Spec 8.6: crew 80%, vault 10%, fence 10%; a seat that did not lock gets 0; remainders are never minted. */
export function splitCaperPool(i: { poolPerSeat: number; n: number; outcome: CaperOutcome; locked: readonly boolean[] }): {
  pool: number; crewShare: number; vaultCut: number; cutPerSeat: number; cuts: number[];
} {
  const pool = Math.floor((i.poolPerSeat * i.n * CAPER_OUTCOME_PCT[i.outcome]) / 100);
  const crewShare = Math.floor((pool * CAPER_SPLIT_PCT.crew) / 100);
  const vaultCut = Math.floor((pool * CAPER_SPLIT_PCT.vault) / 100);
  const cutPerSeat = Math.floor(crewShare / i.n);
  return { pool, crewShare, vaultCut, cutPerSeat, cuts: i.locked.map((l) => (l ? cutPerSeat : 0)) };
}

/** The best successBonus among the role's prep items the member owns; 0 when none. */
export function bestRoleBonus(role: CaperRoleKey, owned: ReadonlySet<string>): number {
  const keys = new Set(caperRole(role).prepKeys);
  return CRIME_PREP_WHITELIST
    .filter((p) => keys.has(p.key) && owned.has(p.key))
    .reduce((best, p) => Math.max(best, p.successBonus), 0);
}

/** Crew edge = mean item bonus over filled seats; 0 for none. */
export function crewEdge(bonuses: readonly number[]): number {
  return bonuses.length === 0 ? 0 : bonuses.reduce((a, b) => a + b, 0) / bonuses.length;
}
