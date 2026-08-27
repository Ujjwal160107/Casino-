# Zoo Care Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the zoo money farm by capping how many animals a zoo can hold, charging daily upkeep in feed, paying income once a day for fed animals only, and cutting hunt volume so restocking cannot outrun starvation.

**Architecture:** Pure rules (hunger state, legal-housing resolution, feed billing) live in a new `src/utils/zooRules.ts` with no database access, so they are unit-testable in isolation. A new `src/services/zooService.ts` owns all zoo database work and calls those rules; `huntService.ts` keeps only hunting and parts. Hunger is a single `fedUntil` timestamp on each `CaughtAnimal`, evaluated lazily on read — there is no cron and no scheduled tick.

**Tech Stack:** TypeScript, discord.js v14 (ComponentsV2), Prisma on MongoDB, Redis, vitest.

Spec: `docs/superpowers/specs/2026-08-27-zoo-care-economy-design.md`.

## Global Constraints

- Identity is always `discordId`. Never `discordId_guildId`.
- ComponentsV2 messages are capped at **40 components** and 10 attachments. `src/index.ts` swallows Discord error 50035, so an oversized payload fails silently with no error surfaced. `zoo.ts` already caps detailed slots at `MAX_DETAILED_ZOO_SLOTS = 6` for this reason. Do not add per-species buttons.
- Button labels do not render custom emoji markup. Use `fmtAmount`, not `fmtCurrency`, in any `.setLabel(...)`.
- Any compare-and-set on a nullable `User` date must use `userDateUnchanged(field, prior)` from `src/anticheat/claim.ts`. A plain `{ field: null }` filter does not match an absent field in Prisma's MongoDB connector and permanently blocks first-ever claims.
- Every commit must leave `npm run typecheck` passing. Tasks are ordered so no commit has a broken build.
- Run unit tests with `npx vitest run test/zoo` — integration tests need `.env.test` and a local `mongod`; if that is not configured, say so rather than skipping silently.
- Exact economy numbers (copy verbatim):
  - Income per animal per day: Common **4000**, Uncommon **16000**, Rare **60000**, Legendary **200000**
  - Feed cost per animal per day: Common **1500**, Uncommon **6000**, Rare **22000**, Legendary **75000**
  - Stack per species: Common **4**, Uncommon **3**, Rare **3**, Legendary **1**
  - Zoo mix: Mini 3/2/0/0 (5 types), City 4/4/2/0 (10 types), World 4/4/3/1 (12 types)
  - Zoo prices: Mini **800000**, City **5000000**, World **18000000**
  - Fed window **24h**, starve grace **72h**
  - Buff ceilings: Legendary **0.05**, Rare **0.20**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/animalCatalog.ts` (modify) | All zoo/hunt constants and the animal catalog. No logic. |
| `src/utils/zooRules.ts` (create) | Pure zoo rules: hunger state, legal-housing resolution, feed billing. No I/O. |
| `src/services/zooService.ts` (create) | All zoo database work: purge, enforce housing, status, house, feed, claim. |
| `src/services/huntService.ts` (modify) | Hunting and parts only. Zoo functions removed. |
| `src/services/propertyService.ts` (modify) | Shares the zoo claim rule; evicts animals when a zoo is sold. |
| `src/utils/shopCatalog.ts` (modify) | Four feed items; Bait Box copy. |
| `src/commands/games/zoo.ts` (modify) | Zoo view and `!zoo feed`. |
| `src/handlers/huntInteractionHandler.ts` (modify) | Zoo buttons point at `zooService`. |
| `src/scripts/zooCareMigration.ts` (create) | One-time `fedUntil` backfill and zoo price recompute. |
| `test/zoo/*.test.ts` (create) | Unit tests for rules and constants. |

---

### Task 1: Zoo tier and rate constants

Additive only — nothing is deleted, so every existing caller keeps compiling.

**Files:**
- Modify: `src/utils/animalCatalog.ts`
- Test: `test/zoo/catalog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ZooTierKey`, `ZooTier`, `ZOO_TIERS`, `RARITY_STACK_LIMIT`, `RARITY_INCOME_PER_DAY`, `RARITY_FEED_COST`, `RARITY_FEED_KEY`, `FED_WINDOW_MS`, `HUNGER_GRACE_MS`. `ZOO_CAPACITY` keeps its existing `Record<string, number>` shape but is now derived from `ZOO_TIERS`.

- [ ] **Step 1: Write the failing test**

Create `test/zoo/catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ZOO_TIERS,
  ZOO_CAPACITY,
  RARITY_STACK_LIMIT,
  RARITY_INCOME_PER_DAY,
  RARITY_FEED_COST,
  RARITY_FEED_KEY,
  AnimalRarity,
} from "../../src/utils/animalCatalog";

const RARITIES: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

function headcount(tierKey: keyof typeof ZOO_TIERS): number {
  const tier = ZOO_TIERS[tierKey];
  return RARITIES.reduce((sum, r) => sum + tier.mix[r] * RARITY_STACK_LIMIT[r], 0);
}

function grossPerDay(tierKey: keyof typeof ZOO_TIERS): number {
  const tier = ZOO_TIERS[tierKey];
  return RARITIES.reduce((sum, r) => sum + tier.mix[r] * RARITY_STACK_LIMIT[r] * RARITY_INCOME_PER_DAY[r], 0);
}

function feedPerDay(tierKey: keyof typeof ZOO_TIERS): number {
  const tier = ZOO_TIERS[tierKey];
  return RARITIES.reduce((sum, r) => sum + tier.mix[r] * RARITY_STACK_LIMIT[r] * RARITY_FEED_COST[r], 0);
}

describe("zoo tiers", () => {
  it("each tier's rarity mix sums to its type cap", () => {
    for (const key of Object.keys(ZOO_TIERS) as (keyof typeof ZOO_TIERS)[]) {
      const tier = ZOO_TIERS[key];
      const sum = RARITIES.reduce((s, r) => s + tier.mix[r], 0);
      expect(sum, `${key} mix must sum to types`).toBe(tier.types);
    }
  });

  it("only the World Zoo can house a Legendary", () => {
    expect(ZOO_TIERS.mini_zoo.mix.Legendary).toBe(0);
    expect(ZOO_TIERS.city_zoo.mix.Legendary).toBe(0);
    expect(ZOO_TIERS.world_zoo.mix.Legendary).toBe(1);
  });

  it("max headcount matches the spec", () => {
    expect(headcount("mini_zoo")).toBe(18);
    expect(headcount("city_zoo")).toBe(34);
    expect(headcount("world_zoo")).toBe(38);
  });

  it("gross daily income matches the spec", () => {
    expect(grossPerDay("mini_zoo")).toBe(144_000);
    expect(grossPerDay("city_zoo")).toBe(616_000);
    expect(grossPerDay("world_zoo")).toBe(996_000);
  });

  it("daily feed bill matches the spec", () => {
    expect(feedPerDay("mini_zoo")).toBe(54_000);
    expect(feedPerDay("city_zoo")).toBe(228_000);
    expect(feedPerDay("world_zoo")).toBe(369_000);
  });

  it("net daily income matches the spec", () => {
    expect(grossPerDay("mini_zoo") - feedPerDay("mini_zoo")).toBe(90_000);
    expect(grossPerDay("city_zoo") - feedPerDay("city_zoo")).toBe(388_000);
    expect(grossPerDay("world_zoo") - feedPerDay("world_zoo")).toBe(627_000);
  });

  it("ZOO_CAPACITY stays in sync with the tier type caps", () => {
    expect(ZOO_CAPACITY.mini_zoo).toBe(5);
    expect(ZOO_CAPACITY.city_zoo).toBe(10);
    expect(ZOO_CAPACITY.world_zoo).toBe(12);
  });

  it("every rarity has a feed item key", () => {
    for (const r of RARITIES) {
      expect(RARITY_FEED_KEY[r]).toMatch(/_feed$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/zoo/catalog.test.ts`
Expected: FAIL — `ZOO_TIERS` is not exported from `animalCatalog`.

- [ ] **Step 3: Add the constants**

In `src/utils/animalCatalog.ts`, **replace** the existing `ZOO_CAPACITY` block:

```ts
export const ZOO_CAPACITY: Record<string, number> = {
  mini_zoo:  5,
  city_zoo:  10,
  world_zoo: 16,
};
```

with:

```ts
export type ZooTierKey = "mini_zoo" | "city_zoo" | "world_zoo";

export interface ZooTier {
  key: ZooTierKey;
  /** Distinct species the zoo may house. Always equals the sum of `mix`. */
  types: number;
  /** How many distinct species of each rarity may be housed. */
  mix: Record<AnimalRarity, number>;
}

// Three limits apply together: type cap, rarity mix, and per-species stack.
// Only a World Zoo may house a Legendary — that exclusivity is the reason to
// make the last upgrade, independent of the income arithmetic.
export const ZOO_TIERS: Record<ZooTierKey, ZooTier> = {
  mini_zoo:  { key: "mini_zoo",  types: 5,  mix: { Common: 3, Uncommon: 2, Rare: 0, Legendary: 0 } },
  city_zoo:  { key: "city_zoo",  types: 10, mix: { Common: 4, Uncommon: 4, Rare: 2, Legendary: 0 } },
  world_zoo: { key: "world_zoo", types: 12, mix: { Common: 4, Uncommon: 4, Rare: 3, Legendary: 1 } },
};

/** Copies of the same species a zoo may hold. Falls as rarity rises. */
export const RARITY_STACK_LIMIT: Record<AnimalRarity, number> = {
  Common:    4,
  Uncommon:  3,
  Rare:      3,
  Legendary: 1,
};

/** Paid per fed, housed animal on each daily claim. Replaces hourly accrual. */
export const RARITY_INCOME_PER_DAY: Record<AnimalRarity, number> = {
  Common:    4_000,
  Uncommon:  16_000,
  Rare:      60_000,
  Legendary: 200_000,
};

/** Cost of one feed unit, which keeps one animal fed for one day. */
export const RARITY_FEED_COST: Record<AnimalRarity, number> = {
  Common:    1_500,
  Uncommon:  6_000,
  Rare:      22_000,
  Legendary: 75_000,
};

/** Shop catalogKey of the feed that works on each rarity. */
export const RARITY_FEED_KEY: Record<AnimalRarity, string> = {
  Common:    "common_feed",
  Uncommon:  "uncommon_feed",
  Rare:      "rare_feed",
  Legendary: "legendary_feed",
};

export const FED_WINDOW_MS = 24 * 3_600_000;
export const HUNGER_GRACE_MS = 72 * 3_600_000;

// Derived so callers that only need the type cap (propertyService, zoo.ts,
// collapseMultiZoos) keep working unchanged.
export const ZOO_CAPACITY: Record<string, number> = Object.fromEntries(
  Object.values(ZOO_TIERS).map((t) => [t.key, t.types]),
);
```

`ZooTier` references `AnimalRarity`, which is declared at the top of the file, so this block must sit **after** the `AnimalRarity` type alias. Placing it where the old `ZOO_CAPACITY` was satisfies that.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/zoo/catalog.test.ts && npm run typecheck`
Expected: PASS, and typecheck clean (the World Zoo cap silently drops 16 → 12 for existing callers, which is intended).

- [ ] **Step 5: Commit**

```bash
git add src/utils/animalCatalog.ts test/zoo/catalog.test.ts
git commit -m "feat(zoo): add tier mix, stack, daily income and feed constants"
```

---

### Task 2: Pure zoo rules

**Files:**
- Create: `src/utils/zooRules.ts`
- Test: `test/zoo/rules.test.ts`

**Interfaces:**
- Consumes: `ZOO_TIERS`, `ZooTierKey`, `RARITY_STACK_LIMIT`, `RARITY_FEED_COST`, `FED_WINDOW_MS`, `HUNGER_GRACE_MS`, `AnimalRarity` from Task 1.
- Produces:
  - `type AnimalState = "fed" | "hungry" | "dead"`
  - `interface HungerInput { fedUntil: Date | null; caughtAt: Date }`
  - `effectiveFedUntil(a: HungerInput): Date`
  - `animalState(a: HungerInput, now: Date): AnimalState`
  - `msUntilDeath(a: HungerInput, now: Date): number`
  - `interface RuleAnimal { id: string; animalKey: string; rarity: AnimalRarity; caughtAt: Date }`
  - `resolveLegalHousing(animals: RuleAnimal[], tierKey: ZooTierKey | null): { keep: string[]; evict: string[] }`
  - `feedBill(hungry: { rarity: AnimalRarity }[]): { lines: { rarity: AnimalRarity; units: number; cost: number }[]; total: number }`

- [ ] **Step 1: Write the failing test**

Create `test/zoo/rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  animalState,
  effectiveFedUntil,
  msUntilDeath,
  resolveLegalHousing,
  feedBill,
  RuleAnimal,
} from "../../src/utils/zooRules";

const T0 = new Date("2026-08-27T00:00:00.000Z");
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

describe("animalState", () => {
  const caughtAt = T0;
  const fedUntil = hours(24);

  it("is fed right up to and including fedUntil", () => {
    expect(animalState({ fedUntil, caughtAt }, hours(23))).toBe("fed");
    expect(animalState({ fedUntil, caughtAt }, hours(24))).toBe("fed");
  });

  it("is hungry one millisecond after fedUntil", () => {
    const justAfter = new Date(fedUntil.getTime() + 1);
    expect(animalState({ fedUntil, caughtAt }, justAfter)).toBe("hungry");
  });

  it("is still hungry exactly at the end of the 72h grace", () => {
    expect(animalState({ fedUntil, caughtAt }, hours(24 + 72))).toBe("hungry");
  });

  it("is dead one millisecond past the grace", () => {
    const dead = new Date(fedUntil.getTime() + 72 * 3_600_000 + 1);
    expect(animalState({ fedUntil, caughtAt }, dead)).toBe("dead");
  });

  it("treats a null fedUntil as caughtAt + 24h, not as starving forever", () => {
    expect(effectiveFedUntil({ fedUntil: null, caughtAt }).getTime()).toBe(hours(24).getTime());
    expect(animalState({ fedUntil: null, caughtAt }, hours(1))).toBe("fed");
    expect(animalState({ fedUntil: null, caughtAt }, hours(30))).toBe("hungry");
  });

  it("reports time left before death", () => {
    expect(msUntilDeath({ fedUntil, caughtAt }, hours(48))).toBe(48 * 3_600_000);
  });
});

function animal(id: string, animalKey: string, rarity: RuleAnimal["rarity"], caughtAtHours: number): RuleAnimal {
  return { id, animalKey, rarity, caughtAt: hours(caughtAtHours) };
}

describe("resolveLegalHousing", () => {
  it("evicts everything when the player owns no zoo", () => {
    const animals = [animal("a", "rabbit", "Common", 0)];
    expect(resolveLegalHousing(animals, null)).toEqual({ keep: [], evict: ["a"] });
  });

  it("keeps a legal zoo untouched", () => {
    const animals = [
      animal("a", "rabbit", "Common", 0),
      animal("b", "fox", "Common", 1),
      animal("c", "deer", "Uncommon", 2),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "mini_zoo");
    expect(evict).toEqual([]);
    expect(keep.sort()).toEqual(["a", "b", "c"]);
  });

  it("trims a species to its stack limit, keeping the oldest", () => {
    const animals = [
      animal("r1", "rabbit", "Common", 0),
      animal("r2", "rabbit", "Common", 1),
      animal("r3", "rabbit", "Common", 2),
      animal("r4", "rabbit", "Common", 3),
      animal("r5", "rabbit", "Common", 4),
      animal("r6", "rabbit", "Common", 5),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "world_zoo");
    expect(keep.sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(evict.sort()).toEqual(["r5", "r6"]);
  });

  it("caps Legendaries at one copy", () => {
    const animals = [
      animal("t1", "white_tiger", "Legendary", 0),
      animal("t2", "white_tiger", "Legendary", 1),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "world_zoo");
    expect(keep).toEqual(["t1"]);
    expect(evict).toEqual(["t2"]);
  });

  it("evicts a Legendary entirely from a City Zoo", () => {
    const animals = [
      animal("c1", "rabbit", "Common", 0),
      animal("t1", "white_tiger", "Legendary", 1),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "city_zoo");
    expect(keep).toEqual(["c1"]);
    expect(evict).toEqual(["t1"]);
  });

  it("trims species over the rarity mix, keeping the longest-held", () => {
    // Mini Zoo allows 3 Common species; four are housed.
    const animals = [
      animal("a", "rabbit", "Common", 0),
      animal("b", "fox", "Common", 1),
      animal("c", "duck", "Common", 2),
      animal("d", "squirrel", "Common", 3),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "mini_zoo");
    expect(keep.sort()).toEqual(["a", "b", "c"]);
    expect(evict).toEqual(["d"]);
  });

  it("applies the stack cap before the mix cap", () => {
    // squirrel is newest as a species, so it loses the 3rd Common slot even
    // though rabbit contributes more animals.
    const animals = [
      animal("r1", "rabbit", "Common", 0),
      animal("r2", "rabbit", "Common", 1),
      animal("r3", "rabbit", "Common", 2),
      animal("r4", "rabbit", "Common", 3),
      animal("r5", "rabbit", "Common", 4),
      animal("f1", "fox", "Common", 5),
      animal("d1", "duck", "Common", 6),
      animal("s1", "squirrel", "Common", 7),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "mini_zoo");
    expect(keep.sort()).toEqual(["d1", "f1", "r1", "r2", "r3", "r4"]);
    expect(evict.sort()).toEqual(["r5", "s1"]);
  });

  it("handles an empty zoo", () => {
    expect(resolveLegalHousing([], "world_zoo")).toEqual({ keep: [], evict: [] });
  });
});

describe("feedBill", () => {
  it("bills one unit per hungry animal at that rarity's price", () => {
    const bill = feedBill([
      { rarity: "Common" }, { rarity: "Common" },
      { rarity: "Legendary" },
    ]);
    expect(bill.total).toBe(2 * 1_500 + 75_000);
    expect(bill.lines).toEqual([
      { rarity: "Common", units: 2, cost: 3_000 },
      { rarity: "Legendary", units: 1, cost: 75_000 },
    ]);
  });

  it("orders lines cheapest rarity first so partial feeding starts there", () => {
    const bill = feedBill([{ rarity: "Rare" }, { rarity: "Common" }, { rarity: "Uncommon" }]);
    expect(bill.lines.map((l) => l.rarity)).toEqual(["Common", "Uncommon", "Rare"]);
  });

  it("is empty when nothing is hungry", () => {
    expect(feedBill([])).toEqual({ lines: [], total: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/zoo/rules.test.ts`
Expected: FAIL — cannot resolve `src/utils/zooRules`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/zooRules.ts`:

```ts
import {
  AnimalRarity,
  FED_WINDOW_MS,
  HUNGER_GRACE_MS,
  RARITY_FEED_COST,
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/zoo && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/zooRules.ts test/zoo/rules.test.ts
git commit -m "feat(zoo): add pure hunger, housing and feed-bill rules"
```

---

### Task 3: Hunt volume — one animal per roll

**Files:**
- Modify: `src/utils/animalCatalog.ts` (RIFLE_TIERS, delete RARITY_QUANTITIES)
- Modify: `src/services/huntService.ts:100-170`
- Modify: `src/services/huntCraftService.ts:101`, `:164`
- Modify: `src/utils/shopCatalog.ts` (Bait Box copy)
- Test: `test/zoo/hunt-weights.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RIFLE_TIERS[k].minRolls` / `.maxRolls` (replacing `minAnimals` / `maxAnimals`), `MAX_RARE_WEIGHT = 0.20`, `MAX_LEGENDARY_WEIGHT = 0.05`, `applyHuntBuffs(base, buffs)`.

- [ ] **Step 1: Write the failing test**

Create `test/zoo/hunt-weights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  RIFLE_TIERS,
  MAX_RARE_WEIGHT,
  MAX_LEGENDARY_WEIGHT,
  applyHuntBuffs,
  AnimalRarity,
} from "../../src/utils/animalCatalog";

const RARITIES: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

describe("rifle tiers", () => {
  it("every tier's weights sum to 1", () => {
    for (const [name, tier] of Object.entries(RIFLE_TIERS)) {
      const sum = RARITIES.reduce((s, r) => s + tier.weights[r], 0);
      expect(sum, `${name} weights`).toBeCloseTo(1, 10);
    }
  });

  it("only the legendary rifle can roll a Legendary", () => {
    expect(RIFLE_TIERS["wooden rifle"].weights.Legendary).toBe(0);
    expect(RIFLE_TIERS["iron rifle"].weights.Legendary).toBe(0);
    expect(RIFLE_TIERS["sniper rifle"].weights.Legendary).toBe(0);
    expect(RIFLE_TIERS["legendary rifle"].weights.Legendary).toBe(0.02);
  });

  it("iron stays at one roll so the sniper's second roll is the upgrade", () => {
    expect(RIFLE_TIERS["iron rifle"].maxRolls).toBe(1);
    expect(RIFLE_TIERS["sniper rifle"].maxRolls).toBe(2);
    expect(RIFLE_TIERS["legendary rifle"].maxRolls).toBe(2);
  });
});

describe("applyHuntBuffs", () => {
  const base = RIFLE_TIERS["legendary rifle"].weights;

  it("returns the base weights when nothing is active", () => {
    expect(applyHuntBuffs(base, {})).toEqual(base);
  });

  it("caps Legendary at 5% with every buff stacked", () => {
    const out = applyHuntBuffs(base, {
      camouflage: true,
      compass: "risky",
      rareBonus: 0.06,
      legendaryBonus: 0.02,
    });
    expect(out.Legendary).toBeLessThanOrEqual(MAX_LEGENDARY_WEIGHT);
    expect(out.Legendary).toBe(MAX_LEGENDARY_WEIGHT);
  });

  it("caps Rare at 20% with every buff stacked", () => {
    const out = applyHuntBuffs(base, {
      camouflage: true,
      compass: "risky",
      rareBonus: 0.06,
      legendaryBonus: 0.02,
    });
    expect(out.Rare).toBe(MAX_RARE_WEIGHT);
  });

  it("never produces a negative Common weight", () => {
    const out = applyHuntBuffs(base, { camouflage: true, compass: "risky", rareBonus: 0.5, legendaryBonus: 0.5 });
    expect(out.Common).toBeGreaterThanOrEqual(0);
  });

  it("safe compass shifts Common into Uncommon only", () => {
    const out = applyHuntBuffs(base, { compass: "safe" });
    expect(out.Uncommon).toBeCloseTo(base.Uncommon + 0.15, 10);
    expect(out.Legendary).toBe(base.Legendary);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/zoo/hunt-weights.test.ts`
Expected: FAIL — `minRolls` and `applyHuntBuffs` do not exist.

- [ ] **Step 3: Rewrite the rifle tiers and add the buff function**

In `src/utils/animalCatalog.ts`, **replace** the `RIFLE_TIERS` block with:

```ts
export const RIFLE_TIERS: Record<string, {
  cooldownSeconds: number;
  /** Rarity rolls per hunt. Each roll yields exactly one animal. */
  minRolls: number;
  maxRolls: number;
  weights: Record<AnimalRarity, number>;
}> = {
  "wooden rifle":    { cooldownSeconds: 8 * 3600, minRolls: 1, maxRolls: 1, weights: { Common: 1.00, Uncommon: 0,    Rare: 0,    Legendary: 0    } },
  "iron rifle":      { cooldownSeconds: 6 * 3600, minRolls: 1, maxRolls: 1, weights: { Common: 0.70, Uncommon: 0.30, Rare: 0,    Legendary: 0    } },
  "sniper rifle":    { cooldownSeconds: 4 * 3600, minRolls: 1, maxRolls: 2, weights: { Common: 0.55, Uncommon: 0.32, Rare: 0.13, Legendary: 0    } },
  "legendary rifle": { cooldownSeconds: 2 * 3600, minRolls: 1, maxRolls: 2, weights: { Common: 0.55, Uncommon: 0.32, Rare: 0.11, Legendary: 0.02 } },
};

/** Ceilings applied after every buff. A hunt can never beat these. */
export const MAX_RARE_WEIGHT = 0.20;
export const MAX_LEGENDARY_WEIGHT = 0.05;

export interface HuntBuffs {
  camouflage?: boolean;
  compass?: "safe" | "risky";
  rareBonus?: number;
  legendaryBonus?: number;
}

/**
 * Pure weight math so the ceilings are testable without a hunt. Every bonus is
 * taken out of Common, and Common floors at 0.
 */
export function applyHuntBuffs(
  base: Record<AnimalRarity, number>,
  buffs: HuntBuffs,
): Record<AnimalRarity, number> {
  const w = { ...base };

  let rareAdd = 0;
  let legendaryAdd = 0;
  let uncommonAdd = 0;

  if (buffs.camouflage) { rareAdd += 0.08; legendaryAdd += 0.02; }
  if (buffs.compass === "risky") { rareAdd += 0.06; legendaryAdd += 0.01; }
  if (buffs.compass === "safe") { uncommonAdd += 0.15; }
  if (buffs.rareBonus) rareAdd += buffs.rareBonus;
  if (buffs.legendaryBonus) legendaryAdd += buffs.legendaryBonus;

  w.Rare = Math.min(MAX_RARE_WEIGHT, w.Rare + rareAdd);
  w.Legendary = Math.min(MAX_LEGENDARY_WEIGHT, w.Legendary + legendaryAdd);
  w.Uncommon = w.Uncommon + uncommonAdd;

  const spent = (w.Rare - base.Rare) + (w.Legendary - base.Legendary) + uncommonAdd;
  w.Common = Math.max(0, base.Common - spent);

  return w;
}
```

Then **delete** the whole `RARITY_QUANTITIES` block, including its two comment lines.

- [ ] **Step 4: Rewrite the hunt roll loop**

In `src/services/huntService.ts`, remove `RARITY_QUANTITIES` from the import list at line 10 and add `applyHuntBuffs`. **Replace** the buff block and roll loop (from `if (rareBoostRow?.rareBonus) {` through the end of the Echo Whistle block) with:

```ts
  const camouflageActive = await redisService.get<{ active: boolean }>(`hunt_camouflage:${discordId}`);
  const compassActive = await redisService.get<{ mode: "safe" | "risky" }>(`hunt_compass:${discordId}`);

  weights = applyHuntBuffs(weights, {
    camouflage: camouflageActive?.active === true,
    compass: compassActive?.mode,
    rareBonus: rareBoostRow?.rareBonus,
    legendaryBonus: legendaryBoostRow?.legendaryBonus,
  });

  const baitActive = await redisService.get<{ active: boolean }>(`hunt_bait_box:${discordId}`);
  const echoActive = await redisService.get<{ active: boolean }>(`hunt_echo_whistle:${discordId}`);

  // One animal per rarity roll. The rifle decides how many rolls you get.
  let rollCount = randomInt(tier.minRolls, tier.maxRolls);
  if (baitActive?.active) {
    rollCount = Math.max(2, rollCount);
  }
  const grouped: Map<string, { def: AnimalDefinition; count: number; ids: string[] }> = new Map();

  let bestDef: AnimalDefinition | null = null;
  const rarityOrder: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

  for (let i = 0; i < rollCount; i++) {
    const rarity = rollRarity(weights);
    const pool = getAnimalsByRarity(rarity);
    const def = pool[Math.floor(Math.random() * pool.length)];

    if (!bestDef || rarityOrder.indexOf(def.rarity) > rarityOrder.indexOf(bestDef.rarity)) {
      bestDef = def;
    }

    const existing = grouped.get(def.key);
    if (existing) existing.count += 1;
    else grouped.set(def.key, { def, count: 1, ids: [] });
  }

  // Echo repeats your best catch's exact species — echoing a Legendary into a
  // *different* Legendary was a second legendary roll in disguise.
  if (echoActive?.active && bestDef && Math.random() < 0.35) {
    const existing = grouped.get(bestDef.key);
    if (existing) existing.count += 1;
    else grouped.set(bestDef.key, { def: bestDef, count: 1, ids: [] });
  }
```

The `weights` binding must be a `let`. If the existing declaration is `const weights = { ...tier.weights }`, change it to `let`.

- [ ] **Step 5: Retune the two craft buffs**

In `src/services/huntCraftService.ts`:
- line 101: `effect: { type: "hunt_rare_boost", rareBonus: 0.08 }` → `rareBonus: 0.06`
- line 164: `effect: { type: "hunt_legendary_boost", legendaryBonus: 0.07 }` → `legendaryBonus: 0.02`

Existing `ActiveEffect` rows keep their old magnitude for up to 3 days. That is fine — `applyHuntBuffs` clamps them.

- [ ] **Step 6: Fix the Bait Box copy**

In `src/utils/shopCatalog.ts`, in the `bait_box` entry:
- `description`: replace "Guarantees at least 2 animals on your next hunt." with "Guarantees at least 2 catch rolls on your next hunt."
- `shortDescription`: "Guarantees at least 2 animals." → "Guarantees at least 2 rolls."
- the `CUSTOM_MESSAGE` effect: "Your next hunt will attract at least 2 animals." → "Your next hunt will roll at least twice."

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run test/zoo && npm run typecheck`
Expected: PASS. Typecheck catches any leftover `minAnimals` / `maxAnimals` / `RARITY_QUANTITIES` reference — fix each by using `minRolls` / `maxRolls`.

- [ ] **Step 8: Commit**

```bash
git add src/utils/animalCatalog.ts src/services/huntService.ts src/services/huntCraftService.ts src/utils/shopCatalog.ts test/zoo/hunt-weights.test.ts
git commit -m "feat(hunt): one animal per roll, lower legendary odds, cap buffs"
```

---

### Task 4: `fedUntil` on caught animals

**Files:**
- Modify: `prisma/schema.prisma:660-670`
- Modify: `src/services/huntService.ts` (the `caughtAnimal.create` call)
- Test: manual verification (schema + one create path)

**Interfaces:**
- Consumes: `FED_WINDOW_MS` from Task 1.
- Produces: `CaughtAnimal.fedUntil: DateTime?` on every newly caught animal.

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, in `model CaughtAnimal`, add after `inZoo`:

```prisma
  fedUntil       DateTime?
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npm run prisma:push && npm run prisma:generate`
Expected: MongoDB needs no migration for an added optional field; Prisma reports the client regenerated.

- [ ] **Step 3: Set it on every catch**

In `src/services/huntService.ts`, add `FED_WINDOW_MS` to the `animalCatalog` import list, and in the loop that creates caught animals change:

```ts
        prisma.caughtAnimal.create({
          data: {
            discordId,
            animalKey,
            partsAvailable: [...entry.def.parts],
            inZoo: false,
          },
        })
```

to:

```ts
        prisma.caughtAnimal.create({
          data: {
            discordId,
            animalKey,
            partsAvailable: [...entry.def.parts],
            inZoo: false,
            // One free fed day, so a fresh catch is never hungry on arrival.
            fedUntil: new Date(Date.now() + FED_WINDOW_MS),
          },
        })
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: clean. Confirm the field exists:

```bash
grep -n "fedUntil" prisma/schema.prisma src/services/huntService.ts
```
Expected: one hit in the schema, two in `huntService.ts` (the import and the create).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/services/huntService.ts
git commit -m "feat(zoo): track fedUntil on caught animals"
```

---

### Task 5: Zoo service — purge, enforce, status, house

**Files:**
- Create: `src/services/zooService.ts`
- Modify: `src/services/huntService.ts` (delete the zoo functions it replaces)
- Modify: `src/handlers/huntInteractionHandler.ts` (import from `zooService`)
- Modify: `src/commands/games/zoo.ts` (import from `zooService`)

**Interfaces:**
- Consumes: `resolveLegalHousing`, `animalState`, `msUntilDeath`, `RuleAnimal` (Task 2); `ZOO_TIERS`, `ZooTierKey`, `RARITY_INCOME_PER_DAY`, `RARITY_FEED_COST`, `RARITY_STACK_LIMIT` (Task 1); `fedUntil` (Task 4).
- Produces:
  - `getActiveZooKey(discordId: string): Promise<ZooTierKey | null>`
  - `purgeDead(discordId: string): Promise<{ animalKey: string; count: number }[]>`
  - `enforceHousing(discordId: string): Promise<number>` (returns evicted count)
  - `interface ZooSlot { animalKey: string; def: AnimalDefinition; count: number; fedCount: number; hungryCount: number; incomePerDay: number; feedCostPerDay: number; soonestDeathMs: number | null }`
  - `interface ZooStatus { slots: ZooSlot[]; tier: ZooTier | null; zooKey: ZooTierKey | null; zooName: string | null; incomePerDay: number; feedBillPerDay: number; lastClaim: Date | null; nextClaim: Date | null; claimable: boolean; died: { animalKey: string; count: number }[]; evicted: number }`
  - `getZooStatus(discordId: string): Promise<ZooStatus>`
  - `houseAnimals(discordId: string, animalKey: string): Promise<{ housed: number; reason: string | null }>`
  - `removeAnimalsByKey(discordId: string, animalKey: string): Promise<{ count: number }>` (moved verbatim from `huntService`)

- [ ] **Step 1: Write the service**

Create `src/services/zooService.ts`:

```ts
import prisma from "../utils/prisma";
import {
  AnimalDefinition,
  AnimalRarity,
  FED_WINDOW_MS,
  RARITY_FEED_COST,
  RARITY_INCOME_PER_DAY,
  RARITY_STACK_LIMIT,
  ZOO_TIERS,
  ZooTier,
  ZooTierKey,
  getAnimal,
} from "../utils/animalCatalog";
import { RuleAnimal, animalState, msUntilDeath, resolveLegalHousing } from "../utils/zooRules";

export const ZOO_CLAIM_WINDOW_MS = 24 * 3_600_000;

function isZooKey(key: string): key is ZooTierKey {
  return key in ZOO_TIERS;
}

/** Single-slot ladder: the active zoo is the biggest one owned. */
export async function getActiveZooKey(discordId: string): Promise<ZooTierKey | null> {
  const owned = await prisma.ownedProperty.findMany({
    where: { userId: discordId },
    include: { property: true },
  });
  let best: ZooTierKey | null = null;
  for (const op of owned) {
    const key = op.property.key;
    if (!isZooKey(key)) continue;
    if (!best || ZOO_TIERS[key].types > ZOO_TIERS[best].types) best = key;
  }
  return best;
}

function toRuleAnimal(row: { id: string; animalKey: string; caughtAt: Date }): RuleAnimal | null {
  const def = getAnimal(row.animalKey);
  if (!def) return null;
  return { id: row.id, animalKey: row.animalKey, rarity: def.rarity, caughtAt: row.caughtAt };
}

/**
 * Delete animals past the 72h starve grace, housed or not. No parts, no sell
 * value — death-as-loot would turn neglect into a parts printer.
 */
export async function purgeDead(discordId: string): Promise<{ animalKey: string; count: number }[]> {
  const now = new Date();
  const rows = await prisma.caughtAnimal.findMany({ where: { discordId } });
  const dead = rows.filter((r) => animalState(r, now) === "dead");
  if (dead.length === 0) return [];

  await prisma.caughtAnimal.deleteMany({ where: { id: { in: dead.map((d) => d.id) } } });

  const counts = new Map<string, number>();
  for (const d of dead) counts.set(d.animalKey, (counts.get(d.animalKey) ?? 0) + 1);
  return [...counts].map(([animalKey, count]) => ({ animalKey, count }));
}

/**
 * Push the zoo back inside its legal set. Over-cap animals go to inventory,
 * keeping their fedUntil — they cannot be fed there, so they die on the normal
 * clock unless the player sells or parts them. This is the whole migration.
 */
export async function enforceHousing(discordId: string): Promise<number> {
  const zooKey = await getActiveZooKey(discordId);
  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  const rules = housed.map(toRuleAnimal).filter((a): a is RuleAnimal => a !== null);

  const { evict } = resolveLegalHousing(rules, zooKey);
  // Rows with an unknown animalKey are not in `rules`; leave them alone.
  if (evict.length === 0) return 0;

  await prisma.caughtAnimal.updateMany({
    where: { id: { in: evict } },
    data: { inZoo: false },
  });
  return evict.length;
}

export interface ZooSlot {
  animalKey: string;
  def: AnimalDefinition;
  count: number;
  fedCount: number;
  hungryCount: number;
  incomePerDay: number;
  feedCostPerDay: number;
  /** Milliseconds until the first animal of this species dies, null if all fed. */
  soonestDeathMs: number | null;
}

export interface ZooStatus {
  slots: ZooSlot[];
  tier: ZooTier | null;
  zooKey: ZooTierKey | null;
  zooName: string | null;
  incomePerDay: number;
  feedBillPerDay: number;
  lastClaim: Date | null;
  nextClaim: Date | null;
  claimable: boolean;
  died: { animalKey: string; count: number }[];
  evicted: number;
}

const ZOO_NAMES: Record<ZooTierKey, string> = {
  mini_zoo: "Mini Zoo",
  city_zoo: "City Zoo",
  world_zoo: "World Zoo",
};

export async function getZooStatus(discordId: string): Promise<ZooStatus> {
  const died = await purgeDead(discordId);
  const evicted = await enforceHousing(discordId);

  const zooKey = await getActiveZooKey(discordId);
  const now = new Date();
  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });

  const bySpecies = new Map<string, typeof housed>();
  for (const a of housed) {
    const list = bySpecies.get(a.animalKey) ?? [];
    list.push(a);
    bySpecies.set(a.animalKey, list);
  }

  const slots: ZooSlot[] = [];
  for (const [animalKey, list] of bySpecies) {
    const def = getAnimal(animalKey);
    if (!def) continue;
    const fed = list.filter((a) => animalState(a, now) === "fed");
    const hungry = list.filter((a) => animalState(a, now) === "hungry");
    slots.push({
      animalKey,
      def,
      count: list.length,
      fedCount: fed.length,
      hungryCount: hungry.length,
      incomePerDay: fed.length * RARITY_INCOME_PER_DAY[def.rarity],
      feedCostPerDay: list.length * RARITY_FEED_COST[def.rarity],
      soonestDeathMs: hungry.length
        ? Math.min(...hungry.map((a) => msUntilDeath(a, now)))
        : null,
    });
  }

  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;
  const nextClaim = lastClaim ? new Date(lastClaim.getTime() + ZOO_CLAIM_WINDOW_MS) : null;

  return {
    slots,
    tier: zooKey ? ZOO_TIERS[zooKey] : null,
    zooKey,
    zooName: zooKey ? ZOO_NAMES[zooKey] : null,
    incomePerDay: slots.reduce((s, x) => s + x.incomePerDay, 0),
    feedBillPerDay: slots.reduce((s, x) => s + x.feedCostPerDay, 0),
    lastClaim,
    nextClaim,
    claimable: !nextClaim || nextClaim.getTime() <= now.getTime(),
    died,
    evicted,
  };
}

/**
 * Move as many units of a species from inventory into the zoo as the type cap,
 * rarity mix and stack allow. Partial success is normal and reported.
 */
export async function houseAnimals(
  discordId: string,
  animalKey: string,
): Promise<{ housed: number; reason: string | null }> {
  const def = getAnimal(animalKey);
  if (!def) return { housed: 0, reason: "That animal doesn't exist." };

  const zooKey = await getActiveZooKey(discordId);
  if (!zooKey) return { housed: 0, reason: "You need to own a zoo before you can house animals." };
  const tier = ZOO_TIERS[zooKey];

  await purgeDead(discordId);
  await enforceHousing(discordId);

  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  const sameSpecies = housed.filter((a) => a.animalKey === animalKey).length;
  const stackRoom = RARITY_STACK_LIMIT[def.rarity] - sameSpecies;
  if (stackRoom <= 0) {
    return {
      housed: 0,
      reason: `Your zoo already holds the maximum **${RARITY_STACK_LIMIT[def.rarity]}x ${def.name}** (${def.rarity} stack limit).`,
    };
  }

  if (sameSpecies === 0) {
    const speciesOfRarity = new Set(
      housed.filter((a) => getAnimal(a.animalKey)?.rarity === def.rarity).map((a) => a.animalKey),
    ).size;
    const allowed = tier.mix[def.rarity];
    if (allowed === 0) {
      return {
        housed: 0,
        reason: `A **${ZOO_NAMES[zooKey]}** cannot house ${def.rarity} animals. Upgrade your zoo first.`,
      };
    }
    if (speciesOfRarity >= allowed) {
      return {
        housed: 0,
        reason: `Your zoo already houses **${allowed}** ${def.rarity} species — the most a **${ZOO_NAMES[zooKey]}** allows. Remove one with \`!zoo remove <name>\`.`,
      };
    }
  }

  const available = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: false },
    orderBy: { caughtAt: "asc" },
    take: stackRoom,
  });
  if (available.length === 0) return { housed: 0, reason: `You have no ${def.name} in your inventory.` };

  await prisma.caughtAnimal.updateMany({
    where: { id: { in: available.map((a) => a.id) } },
    data: { inZoo: true },
  });
  return { housed: available.length, reason: null };
}

/** Remove every unit of a species from the zoo, freeing its slot. */
export async function removeAnimalsByKey(
  discordId: string,
  animalKey: string,
): Promise<{ count: number }> {
  const animals = await prisma.caughtAnimal.findMany({ where: { discordId, animalKey, inZoo: true } });
  if (animals.length === 0) throw new Error("That animal type is not in your zoo.");
  await prisma.caughtAnimal.updateMany({
    where: { discordId, animalKey, inZoo: true },
    data: { inZoo: false },
  });
  return { count: animals.length };
}
```

- [ ] **Step 2: Delete the replaced functions from huntService**

In `src/services/huntService.ts`, delete these exports outright — they are superseded:
`addAnimalsByKeyToZoo`, `addAnimalToZoo`, `removeAnimalsByKey`, `removeAnimalFromZoo`, `getZooSlots`, `getZooStatus`, `claimZooIncome`, and the `ZooSlot` interface.

Keep `getZooAnimals`, `getInventoryAnimals`, `CaughtAnimalWithDef`, `mergeWithDef`, and everything hunt- or parts-related.

- [ ] **Step 3: Repoint the callers**

In `src/handlers/huntInteractionHandler.ts`:
- remove `addAnimalsByKeyToZoo` and `removeAnimalsByKey` from the `huntService` import
- add `import { houseAnimals, removeAnimalsByKey } from "../services/zooService";`
- in the `hunt_zoo:` branch, replace the call with:

```ts
      const { housed, reason } = await houseAnimals(ownerId, animalKey);
      if (housed === 0) {
        await safeFollowUp(interaction, { content: reason ?? "Couldn't house that animal.", flags: MessageFlags.Ephemeral });
        return;
      }
      const { count } = { count: housed };
```

Leave the rest of that branch as it is.

In `src/commands/games/zoo.ts`, change the import line

```ts
import { getZooStatus, getZooSlots, removeAnimalsByKey, ZooSlot } from "../../services/huntService";
```

to

```ts
import { getZooStatus, removeAnimalsByKey, ZooSlot } from "../../services/zooService";
```

`zoo.ts` will not compile yet — Task 8 rewrites its rendering. That is expected; do not commit until Step 4 passes.

- [ ] **Step 4: Get the build green**

Run: `npm run typecheck`

`zoo.ts` will report errors on `slot.incomePerHour`, `status.ratePerHour`, `status.hoursPending`, `status.maxSlots` and `getZooSlots`. Fix them minimally now so the commit builds — full UI work is Task 8:
- `view.maxSlots` → `view.tier?.types ?? 0`
- `slot.incomePerHour` → `slot.incomePerDay`
- `ratePerHour`/`hoursPending` in the header and fallback → `incomePerDay`, with the label `/day`
- `getZooSlots(discordId)` in the `!zoo remove` branch → `(await getZooStatus(discordId)).slots`
- `getZooStatus(discordId, guildId)` → `getZooStatus(discordId)` (the guild argument is gone)

Repeat until typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/zooService.ts src/services/huntService.ts src/handlers/huntInteractionHandler.ts src/commands/games/zoo.ts
git commit -m "feat(zoo): add zooService with capped housing and lazy starve-out"
```

---

### Task 6: Feeding and the daily claim

**Files:**
- Modify: `src/services/zooService.ts`
- Test: `test/zoo/feeding.test.ts` (integration, needs `.env.test`)

**Interfaces:**
- Consumes: everything from Task 5; `feedBill` from Task 2; `RARITY_FEED_KEY` from Task 1.
- Produces:
  - `interface FeedResult { fed: number; spent: { rarity: AnimalRarity; units: number }[]; missing: { rarity: AnimalRarity; units: number }[] }`
  - `feedSpecies(discordId: string, animalKey: string): Promise<FeedResult>`
  - `feedAll(discordId: string): Promise<FeedResult>`
  - `claimZooIncome(discordId: string, username: string): Promise<{ claimed: number; fedAnimals: number; hungryAnimals: number }>`

- [ ] **Step 1: Write the failing test**

Create `test/zoo/feeding.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { feedSpecies, claimZooIncome } from "../../src/services/zooService";
import { FED_WINDOW_MS, RARITY_FEED_KEY } from "../../src/utils/animalCatalog";

const id = "zoo-feed-1";

async function giveFeed(catalogKey: string, amount: number) {
  const item = await testPrisma.shopItem.upsert({
    where: { catalogKey },
    create: {
      catalogKey, guildId: "global", name: catalogKey, price: 1, description: "test",
      stock: -1, consumable: true, usable: false, itemType: "CONSUMABLE", effects: [],
    } as any,
    update: {},
  });
  await testPrisma.inventory.upsert({
    where: { userId_shopItemId: { userId: id, shopItemId: item.id } },
    create: { userId: id, shopItemId: item.id, amount },
    update: { amount },
  });
  return item.id;
}

async function giveWorldZoo() {
  const property = await testPrisma.property.upsert({
    where: { key: "world_zoo" },
    create: {
      guildId: "global", key: "world_zoo", name: "World Zoo", description: "test",
      basePrice: 1, price: 1, incomePerCycle: 0, incomeCycleHours: 24, totalSold: 0,
    } as any,
    update: {},
  });
  await testPrisma.ownedProperty.create({
    data: { userId: id, propertyId: property.id, purchasedPrice: 1, lastCollected: new Date() },
  });
}

async function houseHungryRabbits(n: number) {
  const longAgo = new Date(Date.now() - 40 * 3_600_000);
  for (let i = 0; i < n; i++) {
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true, caughtAt: longAgo, fedUntil: longAgo },
    });
  }
}

describe("feedSpecies", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
  });
  afterAll(() => resetUser(id));

  it("spends one feed unit per hungry animal", async () => {
    await houseHungryRabbits(3);
    await giveFeed(RARITY_FEED_KEY.Common, 10);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(3);
    expect(result.missing).toEqual([]);

    const item = await testPrisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY.Common } });
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: id, shopItemId: item!.id } },
    });
    expect(inv!.amount).toBe(7);
  });

  it("costs nothing when the species is already fed", async () => {
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await giveFeed(RARITY_FEED_KEY.Common, 5);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(0);

    const item = await testPrisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY.Common } });
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: id, shopItemId: item!.id } },
    });
    expect(inv!.amount).toBe(5);
  });

  it("feeds what it can afford and reports the shortfall", async () => {
    await houseHungryRabbits(4);
    await giveFeed(RARITY_FEED_KEY.Common, 2);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(2);
    expect(result.missing).toEqual([{ rarity: "Common", units: 2 }]);
  });
});

describe("claimZooIncome", () => {
  beforeEach(async () => {
    await seedUser(id);
  });
  afterAll(() => resetUser(id));

  it("refuses to pay when the player owns no zoo", async () => {
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await expect(claimZooIncome(id, "TestUser")).rejects.toThrow(/own a zoo/i);
  });

  it("pays the daily rate for fed animals and skips hungry ones", async () => {
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    const longAgo = new Date(Date.now() - 40 * 3_600_000);
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "fox", partsAvailable: [], inZoo: true, caughtAt: longAgo, fedUntil: longAgo },
    });

    const result = await claimZooIncome(id, "TestUser");
    expect(result.claimed).toBe(4_000);
    expect(result.fedAnimals).toBe(1);
    expect(result.hungryAnimals).toBe(1);
  });

  it("cannot be claimed twice inside 24h", async () => {
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await claimZooIncome(id, "TestUser");
    await expect(claimZooIncome(id, "TestUser")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/zoo/feeding.test.ts`
Expected: FAIL — `feedSpecies` and `claimZooIncome` are not exported from `zooService`.

If the run instead errors with "Integration tests require TEST_REDIS_URL", `.env.test` is not set up. Say so explicitly and continue with the implementation; do not delete the test.

- [ ] **Step 3: Add feeding and claiming to zooService**

Append to `src/services/zooService.ts`:

```ts
import { addBalance } from "./walletService";
import { getCraftEffect } from "./huntCraftService";
import { conditionalClaim, userDateUnchanged } from "../anticheat/claim";
import { isTester } from "../utils/developerAccess";
import { RARITY_FEED_KEY } from "../utils/animalCatalog";
import { feedBill } from "../utils/zooRules";

export interface FeedResult {
  fed: number;
  spent: { rarity: AnimalRarity; units: number }[];
  missing: { rarity: AnimalRarity; units: number }[];
}

/**
 * Spend up to `units` of a rarity's feed. The `amount: { gte: units }` filter
 * makes this a compare-and-set: two concurrent feeds cannot both spend the
 * same last unit.
 */
async function spendFeed(discordId: string, rarity: AnimalRarity, units: number): Promise<number> {
  if (units <= 0) return 0;
  const item = await prisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY[rarity] } });
  if (!item) return 0;

  const row = await prisma.inventory.findUnique({
    where: { userId_shopItemId: { userId: discordId, shopItemId: item.id } },
  });
  const affordable = Math.min(units, row?.amount ?? 0);
  if (affordable <= 0) return 0;

  const taken = await prisma.inventory.updateMany({
    where: { userId: discordId, shopItemId: item.id, amount: { gte: affordable } },
    data: { amount: { decrement: affordable } },
  });
  if (taken.count === 0) return 0;

  await prisma.inventory.deleteMany({ where: { userId: discordId, shopItemId: item.id, amount: { lte: 0 } } });
  return affordable;
}

async function feedRows(
  discordId: string,
  rows: { id: string; animalKey: string; fedUntil: Date | null; caughtAt: Date }[],
): Promise<FeedResult> {
  const now = new Date();
  const hungry = rows
    .filter((r) => animalState(r, now) === "hungry")
    .map((r) => ({ row: r, def: getAnimal(r.animalKey) }))
    .filter((x): x is { row: typeof rows[number]; def: AnimalDefinition } => x.def !== undefined);

  if (hungry.length === 0) return { fed: 0, spent: [], missing: [] };

  const bill = feedBill(hungry.map((h) => ({ rarity: h.def.rarity })));
  const spent: FeedResult["spent"] = [];
  const missing: FeedResult["missing"] = [];
  const fedUntil = new Date(now.getTime() + FED_WINDOW_MS);
  let fed = 0;

  // bill.lines is cheapest-first, so a player who can't cover everything keeps
  // the most animals alive.
  for (const line of bill.lines) {
    const got = await spendFeed(discordId, line.rarity, line.units);
    if (got > 0) {
      const ids = hungry
        .filter((h) => h.def.rarity === line.rarity)
        .slice(0, got)
        .map((h) => h.row.id);
      await prisma.caughtAnimal.updateMany({ where: { id: { in: ids } }, data: { fedUntil } });
      spent.push({ rarity: line.rarity, units: got });
      fed += got;
    }
    if (got < line.units) missing.push({ rarity: line.rarity, units: line.units - got });
  }

  return { fed, spent, missing };
}

/** Feed every hungry animal of one species. Housed animals only. */
export async function feedSpecies(discordId: string, animalKey: string): Promise<FeedResult> {
  await purgeDead(discordId);
  const rows = await prisma.caughtAnimal.findMany({ where: { discordId, animalKey, inZoo: true } });
  return feedRows(discordId, rows);
}

/** Feed every hungry housed animal. Same per-animal cost as feeding one by one. */
export async function feedAll(discordId: string): Promise<FeedResult> {
  await purgeDead(discordId);
  const rows = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  return feedRows(discordId, rows);
}

export async function claimZooIncome(
  discordId: string,
  username: string,
): Promise<{ claimed: number; fedAnimals: number; hungryAnimals: number }> {
  const zooKey = await getActiveZooKey(discordId);
  if (!zooKey) {
    const err = new Error("You need to own a zoo to collect zoo income.");
    (err as any).code = "NO_ZOO";
    throw err;
  }

  await purgeDead(discordId);
  await enforceHousing(discordId);

  const now = new Date();
  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;

  if (lastClaim && now.getTime() - lastClaim.getTime() < ZOO_CLAIM_WINDOW_MS && !isTester(discordId)) {
    const hoursLeft = Math.ceil((lastClaim.getTime() + ZOO_CLAIM_WINDOW_MS - now.getTime()) / 3_600_000);
    const err = new Error(`Come back in **${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}** to collect zoo income.`);
    (err as any).code = "TOO_SOON";
    throw err;
  }

  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  let gross = 0;
  let fedAnimals = 0;
  for (const a of housed) {
    const def = getAnimal(a.animalKey);
    if (!def) continue;
    if (animalState(a, now) !== "fed") continue;
    gross += RARITY_INCOME_PER_DAY[def.rarity];
    fedAnimals++;
  }

  if (gross === 0) {
    const err = new Error(
      housed.length === 0
        ? "Your zoo is empty. Catch animals with `!hunt` and house them first."
        : "Every animal in your zoo is hungry — they earn nothing. Feed them with `!zoo feed <animal>`.",
    );
    (err as any).code = "NOTHING_TO_CLAIM";
    throw err;
  }

  const zooBoost = await getCraftEffect(
    discordId,
    `crafted_zoo_boost:${discordId}`,
    "zoo_boost",
    (v) => ({ multiplier: v }),
  );
  const total = Math.floor(gross * (zooBoost?.multiplier ?? 1));

  // Reserve the 24h window atomically BEFORE crediting. userDateUnchanged also
  // matches a never-written lastZooClaim; a plain `{ lastZooClaim: null }`
  // filter would not, permanently blocking first-ever claims.
  const claimed = await conditionalClaim(() =>
    prisma.user.updateMany({
      where: { discordId, ...userDateUnchanged("lastZooClaim", lastClaim) },
      data: { lastZooClaim: now },
    }),
  );
  if (!claimed) {
    const err = new Error("Already collecting — try again in a moment.");
    (err as any).code = "TOO_SOON";
    throw err;
  }

  await addBalance(discordId, username, total, "zoo_income", { fedAnimals });
  return { claimed: total, fedAnimals, hungryAnimals: housed.length - fedAnimals };
}
```

Merge the new `import` lines into the existing import block at the top of the file rather than leaving them mid-file.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/zoo && npm run typecheck`
Expected: PASS. If `.env.test` is missing, report that `feeding.test.ts` could not run and confirm the unit suites still pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/zooService.ts test/zoo/feeding.test.ts
git commit -m "feat(zoo): per-animal feeding and a fed-only daily claim"
```

---

### Task 7: Feed items in the Hunt Store

**Files:**
- Modify: `src/utils/shopCatalog.ts`

**Interfaces:**
- Consumes: `RARITY_FEED_KEY` values from Task 1 — the `key` fields must match exactly.
- Produces: four buyable `ShopCatalogItem`s.

- [ ] **Step 1: Add the four items**

At the top of `HUNT_SHOP_CATALOG` in `src/utils/shopCatalog.ts` (line 306), insert:

```ts
  // Zoo upkeep. One unit feeds one animal for one day; a fed animal earns its
  // daily income, a hungry one earns nothing and dies after 72h. Not `usable`
  // — `!zoo feed` spends these, which keeps them out of the buff cooldowns.
  {
    key: "common_feed",
    name: "Feed Sack",
    price: 1_500,
    description: "A coarse sack of grain and pellets. Feeds one Common animal in your zoo for a day. Spend it with `!zoo feed <animal>` — a hungry animal earns nothing and dies after three days.",
    shortDescription: "Feeds one Common animal for a day.",
    category: "HUNT",
    consumable: true,
    usable: false,
    itemType: "CONSUMABLE",
    effects: [],
  },
  {
    key: "uncommon_feed",
    name: "Game Feed",
    price: 6_000,
    description: "Enriched feed for animals with opinions about grain. Feeds one Uncommon animal in your zoo for a day. Spend it with `!zoo feed <animal>`.",
    shortDescription: "Feeds one Uncommon animal for a day.",
    category: "HUNT",
    consumable: true,
    usable: false,
    itemType: "CONSUMABLE",
    effects: [],
  },
  {
    key: "rare_feed",
    name: "Prime Cuts",
    price: 22_000,
    description: "Butcher-grade meat for predators that notice the difference. Feeds one Rare animal in your zoo for a day. Spend it with `!zoo feed <animal>`.",
    shortDescription: "Feeds one Rare animal for a day.",
    category: "HUNT",
    consumable: true,
    usable: false,
    itemType: "CONSUMABLE",
    effects: [],
  },
  {
    key: "legendary_feed",
    name: "Exotic Ration",
    price: 75_000,
    description: "A specialist ration flown in for animals that should not exist in a zoo. Feeds one Legendary animal for a day. Spend it with `!zoo feed <animal>`.",
    shortDescription: "Feeds one Legendary animal for a day.",
    category: "HUNT",
    consumable: true,
    usable: false,
    itemType: "CONSUMABLE",
    effects: [],
  },
```

No `asset` field — these have no artwork yet, and `resolveAsset` treats a missing asset as optional.

- [ ] **Step 2: Verify the keys line up with the rarity map**

Run:

```bash
node -e "const s=require('fs').readFileSync('src/utils/shopCatalog.ts','utf8');for(const k of ['common_feed','uncommon_feed','rare_feed','legendary_feed'])if(!s.includes('key: \"'+k+'\"'))throw new Error('missing '+k);console.log('all four feed keys present')"
```
Expected: `all four feed keys present`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/utils/shopCatalog.ts
git commit -m "feat(shop): add the four zoo feed items"
```

---

### Task 8: Zoo view, hunger markers, Feed All, `!zoo feed`

**Files:**
- Modify: `src/commands/games/zoo.ts`
- Modify: `src/handlers/huntInteractionHandler.ts`

**Interfaces:**
- Consumes: `getZooStatus`, `ZooStatus`, `ZooSlot`, `feedSpecies`, `feedAll`, `claimZooIncome`, `removeAnimalsByKey` from Tasks 5 and 6.
- Produces: `zoo_feed_all:<discordId>` button id; `!zoo feed <species>` subcommand.

- [ ] **Step 1: Rewrite the payload header and slot lines**

In `src/commands/games/zoo.ts`, change `ZooView` to:

```ts
export interface ZooView {
  slots: ZooSlot[];
  maxSlots: number;
  incomePerDay: number;
  feedBillPerDay: number;
  claimable: boolean;
  nextClaim: Date | null;
  hungryCount: number;
  zooName: string | null;
  zooKey: string | null;
  nextTier: { key: string; name: string; price: number } | null;
}
```

Replace the header block and Collect button in `buildZooPayload` with:

```ts
  const { slots, maxSlots, incomePerDay, feedBillPerDay, claimable, nextClaim, hungryCount, zooName, zooKey, nextTier } = view;

  const files: AttachmentBuilder[] = [];
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${Mascot.Emotes.Sparks} Your ${zooName ?? "Zoo"}\n` +
      `**${slots.length}/${maxSlots}** animal types | **+${fmtCurrency(incomePerDay)}/day** | feed **${fmtCurrency(feedBillPerDay)}/day**` +
      (hungryCount > 0 ? `\n${hungryCount} hungry animal${hungryCount !== 1 ? "s" : ""} earning nothing — \`!zoo feed <animal>\`` : "")
    )
  );

  const hoursLeft = nextClaim ? Math.ceil((nextClaim.getTime() - Date.now()) / 3_600_000) : 0;
  const collectLabel = claimable
    ? `Collect ${fmtAmount(incomePerDay)}`
    : `Next collect in ${hoursLeft}h`;

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`zoo_collect:${discordId}`)
      .setLabel(collectLabel)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!claimable || incomePerDay <= 0)
  );

  // One Feed All button, never one per species — ComponentsV2 caps at 40
  // components and a full zoo already spends most of them on slot sections.
  if (hungryCount > 0) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`zoo_feed_all:${discordId}`)
        .setLabel(`Feed All (${hungryCount})`)
        .setStyle(ButtonStyle.Primary)
    );
  }
```

Keep the existing `nextTier` upgrade button append and the separator that follows.

- [ ] **Step 2: Show hunger on each slot**

Replace the sort and the detailed section's text with:

```ts
  const sorted = [...slots].sort((a, b) => b.incomePerDay - a.incomePerDay);
```

and inside the detail loop:

```ts
    const hungerLine = slot.hungryCount > 0
      ? `\n⚠️ **${slot.hungryCount} hungry** — dies in ${Math.max(0, Math.floor((slot.soonestDeathMs ?? 0) / 3_600_000))}h`
      : "";

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${slot.count}x** ${emojiDisplay} **${slot.def.name}** — ${slot.def.rarity}\n` +
          `${Mascot.Emotes.Currency} +${fmtCurrency(slot.incomePerDay)}/day · feed ${fmtCurrency(slot.feedCostPerDay)}/day` +
          hungerLine
        ),
      )
```

and in the overflow lines:

```ts
      return `**${slot.count}x** ${emojiDisplay} **${slot.def.name}** — ${slot.def.rarity} · +${fmtCurrency(slot.incomePerDay)}/day${slot.hungryCount > 0 ? ` · ⚠️ ${slot.hungryCount} hungry` : ""}`;
```

- [ ] **Step 3: Rebuild the view assembler**

Replace the body of `buildZooContainer` with:

```ts
export async function buildZooContainer(
  discordId: string,
  username: string,
  guildId: string,
  guild: import("discord.js").Guild | null
): Promise<ContainerBuilder> {
  const status = await getZooStatus(discordId);

  let nextTier: ZooView["nextTier"] = null;
  if (status.zooKey) {
    const def = ZOO_PROPERTY_DEFS.find((d) => (ZOO_CAPACITY[d.key] ?? 0) > (ZOO_CAPACITY[status.zooKey!] ?? 0));
    if (def) {
      const nextProp = await prisma.property.findFirst({ where: { key: def.key } });
      nextTier = { key: def.key, name: def.name, price: nextProp?.price ?? def.price };
    }
  }

  const view: ZooView = {
    slots: status.slots,
    maxSlots: status.tier?.types ?? 0,
    incomePerDay: status.incomePerDay,
    feedBillPerDay: status.feedBillPerDay,
    claimable: status.claimable,
    nextClaim: status.nextClaim,
    hungryCount: status.slots.reduce((s, x) => s + x.hungryCount, 0),
    zooName: status.zooName,
    zooKey: status.zooKey,
    nextTier,
  };

  const { components } = buildZooPayload(discordId, view, guild);
  return components[0];
}
```

- [ ] **Step 4: Add the `!zoo feed` subcommand**

In `handleZoo`, immediately before the existing `!zoo remove` branch, add:

```ts
  // !zoo feed <name> — spend one feed of the right rarity per hungry animal.
  if ((args[0] ?? "").toLowerCase() === "feed") {
    const raw = args.slice(1).join(" ").trim();
    if (!raw) {
      return message.reply(v2Reply(errorContainer("Zoo Feed", "Usage: `!zoo feed <animal name>` — or use the **Feed All** button on `!zoo`.")));
    }
    const query = raw.toLowerCase();
    const status = await getZooStatus(discordId);
    const match =
      status.slots.find((s) => s.def.name.toLowerCase() === query || s.animalKey.toLowerCase() === query) ??
      status.slots.find((s) => s.def.name.toLowerCase().includes(query));
    if (!match) {
      return message.reply(v2Reply(errorContainer("Zoo Feed", `You have no **${raw}** in your zoo.`)));
    }
    const result = await feedSpecies(discordId, match.animalKey);
    if (result.fed === 0 && result.missing.length === 0) {
      return message.reply(v2Reply(successContainer("Zoo Feed", `Your **${match.def.name}** are already fed. Nothing spent.`)));
    }
    const shortfall = result.missing.length
      ? `\nStill hungry: **${result.missing.reduce((s, m) => s + m.units, 0)}** — buy more feed in the Hunt Store.`
      : "";
    return message.reply(v2Reply(successContainer(
      "Zoo Feed",
      `Fed **${result.fed}x ${match.def.name}**. They earn again on your next collect.${shortfall}`,
    )));
  }
```

Add `feedSpecies` to the `zooService` import at the top of the file.

- [ ] **Step 5: Wire the Feed All button**

In `src/handlers/huntInteractionHandler.ts`, add `feedAll` to the `zooService` import and insert a branch immediately before the `zoo_collect:` branch:

```ts
  if (customId.startsWith("zoo_feed_all:") && interaction.isButton()) {
    const ownerId = parts[1];
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your zoo.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      const result = await feedAll(ownerId);
      const shortfall = result.missing.length
        ? ` **${result.missing.reduce((s, m) => s + m.units, 0)}** still hungry — buy more feed in the Hunt Store.`
        : "";
      await safeFollowUp(interaction, {
        content: result.fed > 0
          ? `Fed **${result.fed}** animal${result.fed !== 1 ? "s" : ""}.${shortfall}`
          : `You have no feed for the hungry animals in your zoo.${shortfall}`,
        flags: MessageFlags.Ephemeral,
      });
      const container = await buildZooContainer(ownerId, interaction.user.username, interaction.guildId ?? "", interaction.guild);
      const files = (container as any).__files ?? [];
      await safeEditReply(interaction, { components: [container], files, flags: MessageFlags.IsComponentsV2 });
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }
```

Then update the `zoo_collect:` branch's success message, since `claimZooIncome` no longer returns `hoursSinceLastClaim`:

```ts
      const { claimed, fedAnimals, hungryAnimals } = await claimZooIncome(ownerId, interaction.user.username);
      await safeFollowUp(interaction, v2Reply(
        successContainer(
          "Zoo Income Collected",
          `Collected **${fmtCurrency(claimed)}** from **${fedAnimals}** fed animal${fedAnimals !== 1 ? "s" : ""}.` +
          (hungryAnimals > 0 ? `\n${hungryAnimals} hungry animal${hungryAnimals !== 1 ? "s" : ""} earned nothing.` : ""),
        ),
        undefined,
        MessageFlags.Ephemeral,
      ));
```

Change its `claimZooIncome` import to come from `../services/zooService`.

- [ ] **Step 6: Fix the plain-text fallback**

At the bottom of `handleZoo`, replace the fallback block's destructuring and body with:

```ts
    const status = await getZooStatus(discordId);
    const lines = status.slots
      .slice()
      .sort((a, b) => b.incomePerDay - a.incomePerDay)
      .map((s) => `${s.count}x ${s.def.name} (${s.def.rarity})${s.hungryCount > 0 ? ` — ${s.hungryCount} hungry` : ""}`)
      .join(", ");
    return message.reply(v2Reply(successContainer(
      `Your ${status.zooName ?? "Zoo"}`,
      `**${status.slots.length}/${status.tier?.types ?? 0}** animal types | **+${fmtCurrency(status.incomePerDay)}/day**\n` +
        (status.claimable ? "Ready to collect — use the button on `!zoo`.\n" : "") +
        (lines ? `\n${lines}` : "Your zoo is empty."),
    )));
```

- [ ] **Step 7: Update the no-zoo capacity copy**

In the no-zoo branch, `Capacity: **${capacity} animal types**` still reads correctly since `ZOO_CAPACITY` is derived. Add the mix underneath so the Legendary rule is discoverable:

```ts
            `Price: **${fmtCurrency(def.price)}**\nCapacity: **${capacity} animal types**${def.key === "world_zoo" ? " · the only zoo that can house a Legendary" : ""}\n-# ${def.description}`
```

- [ ] **Step 8: Verify component count and typecheck**

Run: `npm run typecheck`
Expected: clean.

Worst case component count: 1 header text + 1 action row (3 buttons) + 1 separator + 6 sections × 2 (section + its text) + 5 separators + 1 overflow separator + 1 overflow text = well under 40. Confirm by counting in `buildZooPayload` — if a future edit adds per-slot buttons, this budget breaks.

- [ ] **Step 9: Commit**

```bash
git add src/commands/games/zoo.ts src/handlers/huntInteractionHandler.ts
git commit -m "feat(zoo): daily view with hunger state, Feed All and !zoo feed"
```

---

### Task 9: Share the rule with `!collect-rent`, evict on sell

**Files:**
- Modify: `src/services/propertyService.ts:133-155` (sell), `:300-340` (collect)

**Interfaces:**
- Consumes: `getActiveZooKey`, `purgeDead`, `enforceHousing`, `ZOO_CLAIM_WINDOW_MS` from Task 5; `animalState` from Task 2; `RARITY_INCOME_PER_DAY` from Task 1.
- Produces: no new exports. `CollectIncomeResult` keeps its shape.

- [ ] **Step 1: Rewrite the zoo branch of `collectIncome`**

In `src/services/propertyService.ts`, replace the whole zoo block (from `const user = await prisma.user.findUnique` through the closing brace of the `else`) with:

```ts
  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;

  if (lastClaim && now.getTime() - lastClaim.getTime() < ZOO_CLAIM_WINDOW_MS && !isTester(discordId)) {
    result.nextZooCollect = new Date(lastClaim.getTime() + ZOO_CLAIM_WINDOW_MS);
  } else if (await getActiveZooKey(discordId)) {
    // Same rule as !zoo Collect: fed, housed animals only, at the daily rate.
    await purgeDead(discordId);
    await enforceHousing(discordId);

    const zooAnimals = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
    for (const animal of zooAnimals) {
      const def = getAnimal(animal.animalKey);
      if (!def) continue;
      if (animalState(animal, now) !== "fed") continue;
      const income = RARITY_INCOME_PER_DAY[def.rarity];
      result.zooBreakdown.push({ name: def.name, rarity: def.rarity, income });
      result.zooTotal += income;
    }

    if (result.zooTotal > 0) {
      // Reserve the zoo window (shared with claimZooIncome) atomically; if a
      // concurrent zoo/property collect already took it, drop the zoo income.
      const zooClaimed = await conditionalClaim(() =>
        prisma.user.updateMany({
          where: { discordId, ...userDateUnchanged("lastZooClaim", lastClaim) },
          data: { lastZooClaim: now },
        })
      );
      if (!zooClaimed) {
        result.zooTotal = 0;
        result.zooBreakdown = [];
      }
    }
  }
```

Delete the now-unused local `const ZOO_COOLDOWN_MS = 24 * 3_600_000;`. Update the imports at the top of the file: drop `RARITY_INCOME`, add `RARITY_INCOME_PER_DAY` from `../utils/animalCatalog`, add `animalState` from `../utils/zooRules`, and add `getActiveZooKey, purgeDead, enforceHousing, ZOO_CLAIM_WINDOW_MS` from `./zooService`.

If that import creates a cycle (`zooService` does not import `propertyService`, so it should not), typecheck will say so.

- [ ] **Step 2: Evict animals when a zoo is sold**

In `sellPropertySystem`, inside the transaction, immediately after `await tx.ownedProperty.delete({ where: { id: owned.id } });` add:

```ts
      // Selling your zoo turns every housed animal out. They keep their hunger
      // clock and cannot be fed in inventory, so they die within three days
      // unless sold or parted — you can no longer sell the zoo and keep the rent.
      if (Object.keys(ZOO_CAPACITY).includes(key)) {
        await tx.caughtAnimal.updateMany({ where: { discordId, inZoo: true }, data: { inZoo: false } });
      }
```

- [ ] **Step 3: Verify no double-pay path remains**

Run:

```bash
grep -n "RARITY_INCOME\b\|hoursSinceLastClaim\|incomePerHour" src/services/propertyService.ts src/services/huntService.ts src/commands/games/zoo.ts
```
Expected: no hits. Any hit is a surviving hourly path — remove it.

- [ ] **Step 4: Write the cross-path test**

Create `test/zoo/claim-paths.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { claimZooIncome, purgeDead } from "../../src/services/zooService";
import { collectIncome } from "../../src/services/propertyService";
import { FED_WINDOW_MS, HUNGER_GRACE_MS } from "../../src/utils/animalCatalog";

const id = "zoo-claim-paths";

async function giveWorldZoo() {
  const property = await testPrisma.property.upsert({
    where: { key: "world_zoo" },
    create: {
      guildId: "global", key: "world_zoo", name: "World Zoo", description: "test",
      basePrice: 1, price: 1, incomePerCycle: 0, incomeCycleHours: 24, totalSold: 0,
    } as any,
    update: {},
  });
  await testPrisma.ownedProperty.create({
    data: { userId: id, propertyId: property.id, purchasedPrice: 1, lastCollected: new Date() },
  });
}

describe("zoo income is paid once per day across both paths", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
  });
  afterAll(() => resetUser(id));

  it("!collect-rent pays nothing after !zoo Collect took the window", async () => {
    const first = await claimZooIncome(id, "TestUser");
    expect(first.claimed).toBe(4_000);

    const second = await collectIncome(id, "guild");
    expect(second.zooTotal).toBe(0);
    expect(second.zooBreakdown).toEqual([]);
  });

  it("concurrent claims across both paths pay exactly once", async () => {
    const results = await Promise.allSettled([
      claimZooIncome(id, "TestUser"),
      collectIncome(id, "guild"),
    ]);

    let paid = 0;
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const value = r.value as any;
      paid += value.claimed ?? value.zooTotal ?? 0;
    }
    expect(paid).toBe(4_000);
  });
});

describe("dead animals", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
  });
  afterAll(() => resetUser(id));

  it("are purged and never pay", async () => {
    const longDead = new Date(Date.now() - FED_WINDOW_MS - HUNGER_GRACE_MS - 3_600_000);
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "white_tiger", partsAvailable: [], inZoo: true, caughtAt: longDead, fedUntil: longDead },
    });

    const died = await purgeDead(id);
    expect(died).toEqual([{ animalKey: "white_tiger", count: 1 }]);
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: id } })).toBe(0);

    await expect(claimZooIncome(id, "TestUser")).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npx vitest run test/zoo test/anticheat/zoo.race.test.ts`
Expected: PASS. `zoo.race.test.ts` exercises the CAS primitive directly, not the window, so it should be unaffected — if it fails, the CAS itself regressed.

- [ ] **Step 6: Commit**

```bash
git add src/services/propertyService.ts test/zoo/claim-paths.test.ts
git commit -m "fix(zoo): one daily fed-only claim across zoo and rent, evict on sell"
```

---

### Task 10: Repricing and the deploy migration

**Files:**
- Modify: `src/utils/animalCatalog.ts` (`ZOO_PROPERTY_DEFS`)
- Create: `src/scripts/zooCareMigration.ts`
- Modify: `package.json` (script entry)

**Interfaces:**
- Consumes: `ZOO_CAPACITY`, `ZOO_TIERS`, `FED_WINDOW_MS` from Task 1.
- Produces: `npm run migrate:zoo-care`.

- [ ] **Step 1: Reprice and redescribe the zoos**

In `src/utils/animalCatalog.ts`, replace `ZOO_PROPERTY_DEFS` with:

```ts
export const ZOO_PROPERTY_DEFS: { key: string; name: string; description: string; price: number }[] = [
  { key: "mini_zoo",  name: "Mini Zoo",  description: "A small zoo: 3 common and 2 uncommon species, up to 18 animals.",                     price: 800_000    },
  { key: "city_zoo",  name: "City Zoo",  description: "A city zoo: 4 common, 4 uncommon and 2 rare species, up to 34 animals.",              price: 5_000_000  },
  { key: "world_zoo", name: "World Zoo", description: "A world-class zoo: 4 common, 4 uncommon, 3 rare and 1 legendary species, up to 38 animals. The only zoo that can house a Legendary.", price: 18_000_000 },
];
```

- [ ] **Step 2: Write the migration script**

Create `src/scripts/zooCareMigration.ts`:

```ts
/**
 * One-time migration for the zoo care economy.
 *
 * 1. Backfill CaughtAnimal.fedUntil so every existing animal starts with one
 *    fed day. Without this they would all read as fed-since-caughtAt and a
 *    long-held collection would die on first read.
 * 2. Recompute Property.price for the three zoos. seedGlobalProperties only
 *    writes basePrice in its update branch, and buyProperty charges the stored
 *    price, so a catalog price change never reaches existing rows on its own.
 *
 * Over-cap animals are NOT culled here — enforceHousing evicts them lazily on
 * the owner's next `!zoo`, and they starve out from inventory over three days.
 *
 * Idempotent: safe to run more than once.
 *
 * Usage: npx ts-node src/scripts/zooCareMigration.ts
 */
import { PrismaClient } from "@prisma/client";
import { FED_WINDOW_MS, ZOO_CAPACITY, ZOO_PROPERTY_DEFS } from "../utils/animalCatalog";
import { PropertyService } from "../services/propertyService";

const prisma = new PrismaClient();

async function main() {
  const fedUntil = new Date(Date.now() + FED_WINDOW_MS);
  const backfilled = await prisma.caughtAnimal.updateMany({
    where: { fedUntil: null },
    data: { fedUntil },
  });
  console.log(`Backfilled fedUntil on ${backfilled.count} animal(s); everyone has one fed day.`);

  for (const def of ZOO_PROPERTY_DEFS) {
    if (!(def.key in ZOO_CAPACITY)) continue;
    const property = await prisma.property.findUnique({ where: { key: def.key } });
    if (!property) {
      console.log(`${def.key}: no Property row yet, seeding will create it at the new price.`);
      continue;
    }
    const price = PropertyService.calculateDynamicPrice(def.price, property.totalSold);
    await prisma.property.update({
      where: { id: property.id },
      data: { basePrice: def.price, price },
    });
    console.log(`${def.key}: basePrice ${property.basePrice} -> ${def.price}, price ${property.price} -> ${price}`);
  }

  console.log("\nDone. No animals culled — over-cap zoos are trimmed lazily on the owner's next !zoo.");
}

main()
  .catch((err) => {
    console.error("zooCareMigration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

The pricing curve is imported from `PropertyService`, not copied, so it cannot drift between the service and the migration. If that import pulls in something that fails to initialise outside the bot process (Redis, the Discord client), the script will fail loudly at startup — fix the import chain rather than reintroducing a copy of the formula.

- [ ] **Step 3: Add the npm script**

In `package.json`, next to the other `ts-node` entries, add:

```json
    "migrate:zoo-care": "ts-node src/scripts/zooCareMigration.ts",
```

- [ ] **Step 4: Run it against the dev database and typecheck**

Run: `npm run typecheck && npm run migrate:zoo-care`
Expected: typecheck clean; the script prints a backfill count and three price lines. Run it a second time — the backfill count must be 0 and the price lines must be unchanged, proving idempotence.

- [ ] **Step 5: Commit**

```bash
git add src/utils/animalCatalog.ts src/scripts/zooCareMigration.ts package.json
git commit -m "feat(zoo): reprice the zoo ladder and add the care-economy migration"
```

---

## Deploy checklist

Run in this order on release:

1. `npm run prisma:push` — adds `fedUntil`
2. `npm run migrate:zoo-care` — backfill + reprice
3. Restart the worker

Announce before deploying. Existing over-cap zoos are not wiped, but their overflow starts a three-day death clock from first `!zoo` after the release, and players should know to sell or part it out.
