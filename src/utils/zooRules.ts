import {
  AnimalRarity,
  FED_WINDOW_MS,
  HUNGER_GRACE_MS,
  RARITY_FEED_COST,
  RARITY_INCOME_PER_DAY,
  RARITY_STACK_LIMIT,
  ZOO_TIERS,
  ZooTierKey,
} from "./animalCatalog";

/** Cheapest first — partial feeding spends in this order. */
const RARITY_ORDER: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

export type AnimalState = "fed" | "hungry" | "dead";

export interface HungerInput {
  fedUntil: Date | null;
  caughtAt: Date;
}

/**
 * A row written by a path that forgot to set fedUntil reads as "fed since it
 * was caught", never as starving since the epoch — otherwise a missed write
 * would silently kill animals.
 */
export function effectiveFedUntil(a: HungerInput): Date {
  return a.fedUntil ?? new Date(a.caughtAt.getTime() + FED_WINDOW_MS);
}

export function animalState(a: HungerInput, now: Date): AnimalState {
  const until = effectiveFedUntil(a).getTime();
  const t = now.getTime();
  if (t <= until) return "fed";
  if (t <= until + HUNGER_GRACE_MS) return "hungry";
  return "dead";
}

export function msUntilDeath(a: HungerInput, now: Date): number {
  return effectiveFedUntil(a).getTime() + HUNGER_GRACE_MS - now.getTime();
}

export interface RuleAnimal {
  id: string;
  animalKey: string;
  rarity: AnimalRarity;
  caughtAt: Date;
}

/**
 * The one place housing legality is decided. Every zoo read and the daily claim
 * run this, so the rules cannot drift between adding, claiming, and rendering.
 *
 * Two passes, in order:
 *   1. per species, keep the oldest up to the rarity's stack limit
 *   2. per rarity, keep the longest-held species up to the tier's mix
 *
 * `caughtAt` is the tiebreaker because there is no housedAt column; oldest-caught
 * is deterministic and stable across reads. Ids break exact ties so the result
 * never depends on query order.
 */
export function resolveLegalHousing(
  animals: RuleAnimal[],
  tierKey: ZooTierKey | null,
): { keep: string[]; evict: string[] } {
  if (!tierKey) return { keep: [], evict: animals.map((a) => a.id) };
  const tier = ZOO_TIERS[tierKey];
  const evict: string[] = [];

  const bySpecies = new Map<string, RuleAnimal[]>();
  for (const a of animals) {
    const list = bySpecies.get(a.animalKey) ?? [];
    list.push(a);
    bySpecies.set(a.animalKey, list);
  }

  const survivors: { animalKey: string; rarity: AnimalRarity; oldest: number; ids: string[] }[] = [];
  for (const [animalKey, list] of bySpecies) {
    const sorted = [...list].sort(
      (x, y) => x.caughtAt.getTime() - y.caughtAt.getTime() || x.id.localeCompare(y.id),
    );
    const rarity = sorted[0].rarity;
    const kept = sorted.slice(0, RARITY_STACK_LIMIT[rarity]);
    evict.push(...sorted.slice(RARITY_STACK_LIMIT[rarity]).map((a) => a.id));
    survivors.push({
      animalKey,
      rarity,
      oldest: kept[0].caughtAt.getTime(),
      ids: kept.map((a) => a.id),
    });
  }

  const keep: string[] = [];
  for (const rarity of RARITY_ORDER) {
    const bucket = survivors
      .filter((s) => s.rarity === rarity)
      .sort((x, y) => x.oldest - y.oldest || x.animalKey.localeCompare(y.animalKey));
    const allowed = tier.mix[rarity];
    for (const [i, species] of bucket.entries()) {
      if (i < allowed) keep.push(...species.ids);
      else evict.push(...species.ids);
    }
  }

  return { keep, evict };
}

export interface FeedLine {
  rarity: AnimalRarity;
  units: number;
  cost: number;
}

/** One feed unit per hungry animal. Already-fed animals are never billed. */
export function feedBill(hungry: { rarity: AnimalRarity }[]): { lines: FeedLine[]; total: number } {
  const counts = new Map<AnimalRarity, number>();
  for (const a of hungry) counts.set(a.rarity, (counts.get(a.rarity) ?? 0) + 1);

  const lines: FeedLine[] = [];
  let total = 0;
  for (const rarity of RARITY_ORDER) {
    const units = counts.get(rarity) ?? 0;
    if (units === 0) continue;
    const cost = units * RARITY_FEED_COST[rarity];
    lines.push({ rarity, units, cost });
    total += cost;
  }
  return { lines, total };
}

export interface IncomeAnimal extends HungerInput {
  animalKey: string;
  rarity: AnimalRarity;
}

export interface IncomeLine {
  animalKey: string;
  rarity: AnimalRarity;
  fedCount: number;
  hungryCount: number;
  incomePerDay: number;
}

/**
 * Per-species income for one daily claim, shaped like feedBill ({ lines, total })
 * so the pairing between "what a day of care costs" and "what a day of care
 * pays" is obvious. Only fed animals earn RARITY_INCOME_PER_DAY; hungry ones
 * earn nothing — the one rule both getZooStatus (a preview) and
 * claimZooIncome (the payout) must agree on.
 *
 * Lines are keyed by species, not just rarity, because getZooStatus renders one
 * line per zoo slot and a rarity can hold several species at once (a City Zoo
 * houses up to 2 Rare species side by side). claimZooIncome only needs the
 * total plus a fed count, both summed from these same lines, so neither caller
 * re-derives the income rule itself.
 */
export function incomeBill(housed: IncomeAnimal[], now: Date): { lines: IncomeLine[]; total: number } {
  const bySpecies = new Map<string, { rarity: AnimalRarity; fed: number; hungry: number }>();
  for (const a of housed) {
    const entry = bySpecies.get(a.animalKey) ?? { rarity: a.rarity, fed: 0, hungry: 0 };
    const state = animalState(a, now);
    if (state === "fed") entry.fed++;
    else if (state === "hungry") entry.hungry++;
    bySpecies.set(a.animalKey, entry);
  }

  const lines: IncomeLine[] = [];
  let total = 0;
  for (const rarity of RARITY_ORDER) {
    const species = [...bySpecies]
      .filter(([, v]) => v.rarity === rarity)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [animalKey, v] of species) {
      const incomePerDay = v.fed * RARITY_INCOME_PER_DAY[rarity];
      lines.push({ animalKey, rarity, fedCount: v.fed, hungryCount: v.hungry, incomePerDay });
      total += incomePerDay;
    }
  }
  return { lines, total };
}
