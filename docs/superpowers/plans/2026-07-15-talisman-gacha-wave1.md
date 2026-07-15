# Talisman Gacha System — Wave 1 (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working per-instance talisman gacha: craft a tier talisman → roll a random buff → equip up to 3 for a permanent gameplay effect, with the buff pool limited to luck / income_mult / loss_reduce (the effects that route through `shopBuffs.ts`).

**Architecture:** Talismans are a self-contained per-instance model (`Talisman`), following the hunt-parts parallel-track precedent — NOT generic `ShopItem`s. A buff catalog + weighted roll live in `src/data/talismanBuffCatalog.ts`. Craft integrates into the existing `craftHuntRecipe` transaction. Equipping recomputes an aggregate of equipped-talisman buffs and writes them as permanent records (`luck_modifier` `ActiveEffect` for luck; `talisman_income_mult` / `talisman_loss_reduce` `ActiveEffect`s for the rest), which existing modifier hooks read.

**Tech Stack:** TypeScript, discord.js v14 (ComponentsV2), Prisma 5 + MongoDB, Redis (ioredis), Vitest (Mongo memory-server, serial).

## Global Constraints

- **Identity:** all user lookups use `discordId` (never `discordId_guildId`) — V2 global economy.
- **Luck cap:** total luck is `min(100, 50 + Σ modifiers)` — `getCurrentLuck` in `src/services/shopBuffs.ts` already enforces this; permanent talisman luck rides the same path.
- **Permanent effects:** expressed as `ActiveEffect` rows with `expiresAt: null`; the `luck_modifier` query and this plan's readers all treat `null` as "never expires".
- **ComponentsV2 cap:** Discord rejects payloads with >40 components; keep the talisman dashboard paged (max 4 talismans/page like the craft menu).
- **Wave-1 roll pool:** only buffs whose effect is wired in this plan (luck, income_mult, loss_reduce) are present in the catalog, so a roll never yields a dead buff. Later waves add more.
- **Test framework:** `npm test` runs `vitest run`. Tests live under `test/`. Requires `.env.test` + Mongo memory-server per `test/setupEnv.ts`.
- **Roll determinism:** `rollTalismanBuff` accepts an injectable `rng: () => number = Math.random` so tests are deterministic.

---

## File Structure

- **Create** `src/data/talismanBuffCatalog.ts` — buff catalog, per-tier rarity weights, `rollTalismanBuff`.
- **Create** `src/services/talismanService.ts` — craft-to-instance, equip/unequip, aggregation, payload builder.
- **Create** `src/commands/economy/talisman.ts` — `!talisman` command entry.
- **Create** `test/talisman/roll.test.ts`, `test/talisman/craft.test.ts`, `test/talisman/equip.test.ts`, `test/talisman/effects.test.ts`.
- **Modify** `prisma/schema.prisma` — add `Talisman` model.
- **Modify** `src/services/huntCraftService.ts` — add `talisman_roll` effect type + 4 recipes + craft branch.
- **Modify** `src/services/shopBuffs.ts` — `applyIncomeModifiers` / `applyLossModifiers` read talisman aggregates.
- **Modify** `src/handlers/huntInteractionHandler.ts` — talisman equip/unequip/page interactions.
- **Modify** `src/commandRouter.ts` — route `!talisman`.

---

## Task 1: Add the `Talisman` Prisma model

**Files:**
- Modify: `prisma/schema.prisma` (after the `UserCraftUnlock` model, ~line 706)
- Test: `test/talisman/model.test.ts`

**Interfaces:**
- Produces: Prisma `Talisman` model with fields `{ id, ownerId, tier, buffKey, buffRarity, magnitude, equipped, createdAt }`; delegate `prisma.talisman`.

- [ ] **Step 1: Add the model to the schema**

In `prisma/schema.prisma`, after the `UserCraftUnlock` model, add:

```prisma
model Talisman {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  ownerId    String
  tier       String   // Common | Uncommon | Rare | Legendary
  buffKey    String
  buffRarity String   // Common | Uncommon | Rare | Epic | Legendary | Mythic
  magnitude  Float
  equipped   Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([ownerId])
  @@index([ownerId, equipped])
}
```

- [ ] **Step 2: Push schema and regenerate client**

Run: `npm run prisma:push && npm run prisma:generate`
Expected: "Your database is now in sync with your Prisma schema." and client generated with no errors.

- [ ] **Step 3: Write the failing test**

Create `test/talisman/model.test.ts`:

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { testPrisma } from "../helpers";

describe("Talisman model", () => {
  afterAll(async () => {
    await testPrisma.talisman.deleteMany({ where: { ownerId: "tal-model-1" } });
  });

  it("creates and queries a talisman row", async () => {
    const created = await testPrisma.talisman.create({
      data: { ownerId: "tal-model-1", tier: "Common", buffKey: "lucky_trinket", buffRarity: "Common", magnitude: 3 },
    });
    expect(created.equipped).toBe(false);
    const found = await testPrisma.talisman.findMany({ where: { ownerId: "tal-model-1" } });
    expect(found).toHaveLength(1);
    expect(found[0].buffKey).toBe("lucky_trinket");
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/talisman/model.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma test/talisman/model.test.ts
git commit -m "feat(talisman): add Talisman prisma model"
```

---

## Task 2: Buff catalog + weighted roll

**Files:**
- Create: `src/data/talismanBuffCatalog.ts`
- Test: `test/talisman/roll.test.ts`

**Interfaces:**
- Produces:
  - `type TalismanEffectType = "luck" | "income_mult" | "loss_reduce"` (Wave 1 subset).
  - `type TalismanTier = "Common" | "Uncommon" | "Rare" | "Legendary"`.
  - `type BuffRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic"`.
  - `interface TalismanBuff { key; name; rarity: BuffRarity; effectType: TalismanEffectType; range: [number, number]; module: string }`.
  - `const TALISMAN_BUFFS: TalismanBuff[]`.
  - `const TIER_RARITY_WEIGHTS: Record<TalismanTier, Record<BuffRarity, number>>`.
  - `function rollTalismanBuff(tier: TalismanTier, rng?: () => number): { buffKey: string; buffRarity: BuffRarity; magnitude: number }`.
  - `function getBuff(key: string): TalismanBuff | undefined`.

- [ ] **Step 1: Write the catalog + roll module**

Create `src/data/talismanBuffCatalog.ts`:

```typescript
export type TalismanEffectType = "luck" | "income_mult" | "loss_reduce";
export type TalismanTier = "Common" | "Uncommon" | "Rare" | "Legendary";
export type BuffRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface TalismanBuff {
  key: string;
  name: string;
  rarity: BuffRarity;
  effectType: TalismanEffectType;
  range: [number, number]; // inclusive integer range; loss_reduce Mythic uses [100,100]
  module: string;
}

// Wave 1 pool: only luck / income_mult / loss_reduce (routed through shopBuffs.ts).
export const TALISMAN_BUFFS: TalismanBuff[] = [
  { key: "lucky_trinket",   name: "Lucky Trinket",   rarity: "Common",    effectType: "luck",        range: [2, 4],    module: "Luck" },
  { key: "padded_ledger",   name: "Padded Ledger",   rarity: "Common",    effectType: "loss_reduce", range: [4, 8],    module: "Economy" },
  { key: "fortunes_nudge",  name: "Fortune's Nudge", rarity: "Uncommon",  effectType: "luck",        range: [5, 8],    module: "Luck" },
  { key: "golden_horseshoe",name: "Golden Horseshoe",rarity: "Rare",      effectType: "luck",        range: [10, 14],  module: "Luck" },
  { key: "profiteer",       name: "Profiteer",       rarity: "Rare",      effectType: "income_mult", range: [8, 12],   module: "Economy" },
  { key: "tax_evader",      name: "Tax Evader",      rarity: "Rare",      effectType: "loss_reduce", range: [15, 25],  module: "Economy" },
  { key: "high_roller",     name: "High Roller",     rarity: "Epic",      effectType: "luck",        range: [14, 18],  module: "Luck" },
  { key: "midas_touch",     name: "Midas Touch",     rarity: "Epic",      effectType: "income_mult", range: [16, 24],  module: "Economy" },
  { key: "untouchable",     name: "Untouchable",     rarity: "Epic",      effectType: "loss_reduce", range: [30, 40],  module: "Economy" },
  { key: "fortunes_favor",  name: "Fortune's Favor", rarity: "Legendary", effectType: "luck",        range: [22, 28],  module: "Luck" },
  { key: "golden_goose",    name: "Golden Goose",    rarity: "Legendary", effectType: "income_mult", range: [30, 40],  module: "Economy" },
  { key: "golden_idol",     name: "Golden Idol",     rarity: "Mythic",    effectType: "income_mult", range: [45, 55],  module: "Economy" },
  { key: "untaxable",       name: "Untaxable",       rarity: "Mythic",    effectType: "loss_reduce", range: [100, 100],module: "Economy" },
  { key: "god_of_fortune",  name: "God of Fortune",  rarity: "Mythic",    effectType: "luck",        range: [30, 40],  module: "Luck" },
];

export const TIER_RARITY_WEIGHTS: Record<TalismanTier, Record<BuffRarity, number>> = {
  Common:    { Common: 85, Uncommon: 15, Rare: 0,  Epic: 0,  Legendary: 0,  Mythic: 0 },
  Uncommon:  { Common: 55, Uncommon: 35, Rare: 10, Epic: 0,  Legendary: 0,  Mythic: 0 },
  Rare:      { Common: 25, Uncommon: 40, Rare: 28, Epic: 7,  Legendary: 0,  Mythic: 0 },
  Legendary: { Common: 8,  Uncommon: 22, Rare: 34, Epic: 25, Legendary: 10, Mythic: 1 },
};

const RARITIES: BuffRarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];

export function getBuff(key: string): TalismanBuff | undefined {
  return TALISMAN_BUFFS.find((b) => b.key === key);
}

function pickRarity(tier: TalismanTier, rng: () => number): BuffRarity {
  const weights = TIER_RARITY_WEIGHTS[tier];
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return "Common";
}

export function rollTalismanBuff(
  tier: TalismanTier,
  rng: () => number = Math.random,
): { buffKey: string; buffRarity: BuffRarity; magnitude: number } {
  let rarity = pickRarity(tier, rng);
  let pool = TALISMAN_BUFFS.filter((b) => b.rarity === rarity);
  // Safety: if a rarity has no wired buffs yet, fall back to the nearest lower rarity.
  while (pool.length === 0 && rarity !== "Common") {
    rarity = RARITIES[RARITIES.indexOf(rarity) - 1];
    pool = TALISMAN_BUFFS.filter((b) => b.rarity === rarity);
  }
  const buff = pool[Math.floor(rng() * pool.length)];
  const [min, max] = buff.range;
  const magnitude = min + Math.floor(rng() * (max - min + 1));
  return { buffKey: buff.key, buffRarity: buff.rarity, magnitude };
}
```

- [ ] **Step 2: Write the failing test**

Create `test/talisman/roll.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rollTalismanBuff, getBuff, TALISMAN_BUFFS } from "../../src/data/talismanBuffCatalog";

// Deterministic rng: replays a fixed sequence of values in [0,1).
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rollTalismanBuff", () => {
  it("magnitude always lands inside the buff's range", () => {
    for (let i = 0; i < 200; i++) {
      const r = rollTalismanBuff("Legendary");
      const buff = getBuff(r.buffKey)!;
      expect(r.magnitude).toBeGreaterThanOrEqual(buff.range[0]);
      expect(r.magnitude).toBeLessThanOrEqual(buff.range[1]);
    }
  });

  it("Common talismans never roll above Uncommon", () => {
    for (let i = 0; i < 300; i++) {
      const r = rollTalismanBuff("Common");
      expect(["Common", "Uncommon"]).toContain(r.buffRarity);
    }
  });

  it("Mythic buffs only appear from Legendary talismans", () => {
    for (const tier of ["Common", "Uncommon", "Rare"] as const) {
      for (let i = 0; i < 300; i++) {
        expect(rollTalismanBuff(tier).buffRarity).not.toBe("Mythic");
      }
    }
  });

  it("respects the weighted rarity pick (rng just below the Common cutoff picks Common)", () => {
    // Common tier weights: Common 85, Uncommon 15 (total 100). rng=0.10 -> Common.
    const r = rollTalismanBuff("Common", seq([0.10, 0.0, 0.0]));
    expect(r.buffRarity).toBe("Common");
  });

  it("every buff rarity present in a tier column has at least one catalog buff", () => {
    // Guards the Wave-1 constraint: no roll can hit an empty pool.
    const rarities = new Set(TALISMAN_BUFFS.map((b) => b.rarity));
    expect(rarities.has("Common")).toBe(true);
    expect(rarities.has("Mythic")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/talisman/roll.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 4: Commit**

```bash
git add src/data/talismanBuffCatalog.ts test/talisman/roll.test.ts
git commit -m "feat(talisman): add buff catalog and weighted roll"
```

---

## Task 3: Talisman recipes + craft-to-instance

**Files:**
- Modify: `src/services/huntCraftService.ts` (effect union ~line 24-36; recipes array ~line 48-198; `craftHuntRecipe` ~line 425-486)
- Create: `src/services/talismanService.ts`
- Test: `test/talisman/craft.test.ts`

**Interfaces:**
- Consumes: `rollTalismanBuff`, `getBuff` from Task 2; `HUNT_CRAFT_RECIPES`, `craftHuntRecipe` from `huntCraftService`.
- Produces:
  - `HuntCraftEffect` gains `| { type: "talisman_roll"; tier: TalismanTier }`.
  - `talismanService.createTalismanForRecipe(userId, tier, client, rng?)` → `Promise<{ buffKey; buffRarity; magnitude }>` (uses the passed Prisma tx client).
  - `talismanService.describeRoll(roll)` → human string for the reveal message.

- [ ] **Step 1: Write the talisman creation helper**

Create `src/services/talismanService.ts`:

```typescript
import prisma from "../utils/prisma";
import {
  rollTalismanBuff,
  getBuff,
  TalismanTier,
  BuffRarity,
} from "../data/talismanBuffCatalog";

export interface TalismanRoll {
  buffKey: string;
  buffRarity: BuffRarity;
  magnitude: number;
}

/** Rolls a buff for `tier` and inserts a Talisman owned by `userId`, using the
 *  given Prisma client (pass a tx client to stay inside the craft transaction). */
export async function createTalismanForRecipe(
  userId: string,
  tier: TalismanTier,
  client: typeof prisma | any = prisma,
  rng: () => number = Math.random,
): Promise<TalismanRoll> {
  const roll = rollTalismanBuff(tier, rng);
  await client.talisman.create({
    data: {
      ownerId: userId,
      tier,
      buffKey: roll.buffKey,
      buffRarity: roll.buffRarity,
      magnitude: roll.magnitude,
      equipped: false,
    },
  });
  return roll;
}

export function describeRoll(roll: TalismanRoll): string {
  const buff = getBuff(roll.buffKey);
  const name = buff?.name ?? roll.buffKey;
  const unit = buff?.effectType === "luck" ? `+${roll.magnitude} Luck` :
    buff?.effectType === "income_mult" ? `+${roll.magnitude}% income` :
    buff?.effectType === "loss_reduce" ? `−${roll.magnitude}% losses` :
    `${roll.magnitude}`;
  return `🎲 You rolled **${name}** (${roll.buffRarity}) — ${unit}!`;
}
```

- [ ] **Step 2: Extend the effect union and add recipes**

In `src/services/huntCraftService.ts`:

1. Add the import near the top (after existing imports):

```typescript
import { TalismanTier } from "../data/talismanBuffCatalog";
import { createTalismanForRecipe, describeRoll } from "./talismanService";
```

2. Add to the `HuntCraftEffect` union (after the `zoo_boost` line, ~line 36):

```typescript
  | { type: "talisman_roll"; tier: TalismanTier };
```

3. **Rework** the `rabbit_foot_charm` entry (~line 49-57) to:

```typescript
  {
    key: "rabbit_foot_charm",
    name: "Rabbit Foot Talisman",
    tier: "Common",
    description: "Craft a Common talisman — rolls a random buff you can equip.",
    coinCost: 75_000,
    parts: { rabbit_fur: 3, rabbit_meat: 2 },
    effect: { type: "talisman_roll", tier: "Common" },
  },
```

4. **Rework** the `arctic_wolf_spirit_charm` entry (~line 167-174) to:

```typescript
  {
    key: "arctic_wolf_spirit_charm",
    name: "Arctic Wolf Talisman",
    tier: "Legendary",
    description: "Craft a Legendary talisman — rolls a powerful random buff, up to Mythic.",
    coinCost: 6_000_000,
    parts: { arctic_wolf_fur: 2, arctic_wolf_fangs: 2 },
    effect: { type: "talisman_roll", tier: "Legendary" },
  },
```

5. **Add** two new recipes to the `HUNT_CRAFT_RECIPES` array (insert after the Uncommon block, before the Rare block):

```typescript
  {
    key: "fox_spirit_talisman",
    name: "Fox Spirit Talisman",
    tier: "Uncommon",
    description: "Craft an Uncommon talisman — rolls a random buff you can equip.",
    coinCost: 500_000,
    parts: { fox_tail: 3, fox_fur: 3 },
    effect: { type: "talisman_roll", tier: "Uncommon" },
  },
  {
    key: "bear_heart_talisman",
    name: "Bear Heart Talisman",
    tier: "Rare",
    description: "Craft a Rare talisman — rolls a random buff you can equip.",
    coinCost: 1_500_000,
    parts: { black_bear_pelt: 3, black_bear_claws: 2 },
    effect: { type: "talisman_roll", tier: "Rare" },
  },
```

- [ ] **Step 3: Branch the craft transaction for `talisman_roll`**

In `craftHuntRecipe` (`huntCraftService.ts` ~line 425-486), declare a local at the top of the function body (right after `if (!recipe) throw new Error("Unknown recipe.");`, ~line 427) so the roll survives the transaction scope without mutating the shared recipe object:

```typescript
  let talismanRoll: Awaited<ReturnType<typeof createTalismanForRecipe>> | null = null;
```

Inside the `prisma.$transaction(async (tx) => { ... })`, after the existing cosmetic/venom grant blocks (~line 463-468), add:

```typescript
    if (recipe.effect.type === "talisman_roll") {
      talismanRoll = await createTalismanForRecipe(userId, recipe.effect.tier, tx);
    }
```

Then after the transaction (near the cosmetic/venom early-returns ~line 471-482), add:

```typescript
  if (recipe.effect.type === "talisman_roll" && talismanRoll) {
    return {
      recipe,
      effectMessage: `${describeRoll(talismanRoll)}\nEquip it with \`!talisman\`.`,
    };
  }
```

- [ ] **Step 4: Write the failing test**

Create `test/talisman/craft.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { craftHuntRecipe } from "../../src/services/huntCraftService";

const USER = "tal-craft-1";

async function giveParts(userId: string, parts: Record<string, number>) {
  for (const [partKey, amount] of Object.entries(parts)) {
    await testPrisma.huntPartInventory.upsert({
      where: { userId_partKey: { userId, partKey } },
      create: { userId, partKey, amount },
      update: { amount },
    });
  }
}

describe("craftHuntRecipe talisman_roll", () => {
  beforeEach(async () => {
    await resetUser(USER);
    await testPrisma.talisman.deleteMany({ where: { ownerId: USER } });
    await testPrisma.huntPartInventory.deleteMany({ where: { userId: USER } });
    await seedUser(USER, { wallet: { create: { balance: 10_000_000 } } });
    await giveParts(USER, { rabbit_fur: 3, rabbit_meat: 2 });
  });
  afterAll(async () => {
    await testPrisma.talisman.deleteMany({ where: { ownerId: USER } });
    await testPrisma.huntPartInventory.deleteMany({ where: { userId: USER } });
    await resetUser(USER);
  });

  it("crafting a talisman recipe creates one Talisman and consumes parts + coins", async () => {
    const before = await testPrisma.wallet.findUnique({ where: { userId: USER } });
    const result = await craftHuntRecipe(USER, "guild", "rabbit_foot_charm");

    const talismans = await testPrisma.talisman.findMany({ where: { ownerId: USER } });
    expect(talismans).toHaveLength(1);
    expect(talismans[0].tier).toBe("Common");
    expect(result.effectMessage).toContain("You rolled");

    const after = await testPrisma.wallet.findUnique({ where: { userId: USER } });
    expect(after!.balance).toBe(before!.balance - 75_000);

    const parts = await testPrisma.huntPartInventory.findMany({ where: { userId: USER } });
    expect(parts).toHaveLength(0); // exact amounts consumed
  });

  it("rejects when parts are missing", async () => {
    await testPrisma.huntPartInventory.deleteMany({ where: { userId: USER } });
    await expect(craftHuntRecipe(USER, "guild", "rabbit_foot_charm")).rejects.toThrow();
    expect(await testPrisma.talisman.count({ where: { ownerId: USER } })).toBe(0);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/talisman/craft.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add src/services/talismanService.ts src/services/huntCraftService.ts test/talisman/craft.test.ts
git commit -m "feat(talisman): craft talisman recipes into rolled instances"
```

---

## Task 4: Equip / unequip + aggregation

**Files:**
- Modify: `src/services/talismanService.ts`
- Test: `test/talisman/equip.test.ts`

**Interfaces:**
- Consumes: `getBuff` (Task 2); `redisService` from `./redisService`; `prisma`.
- Produces:
  - `const MAX_EQUIPPED = 3`.
  - `equipTalisman(userId, talismanId)` → `Promise<void>` (throws on: not found/owned, already equipped, or slots full).
  - `unequipTalisman(userId, talismanId)` → `Promise<void>`.
  - `applyEquippedTalismanEffects(userId)` → `Promise<void>` (recomputes + writes aggregates).
  - `getEquippedTalismanTotals(userId)` → `Promise<{ luck: number; income_mult: number; loss_reduce: number }>` (reads live from equipped rows; used by tests + Task 5-7 hooks via cache).

- [ ] **Step 1: Write the failing test**

Create `test/talisman/equip.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma } from "../helpers";
import { equipTalisman, unequipTalisman, MAX_EQUIPPED, getEquippedTalismanTotals } from "../../src/services/talismanService";

const USER = "tal-equip-1";

async function makeTalisman(buffKey: string, effectMag: number, rarity = "Rare") {
  return testPrisma.talisman.create({
    data: { ownerId: USER, tier: "Rare", buffKey, buffRarity: rarity, magnitude: effectMag },
  });
}

describe("equip / unequip", () => {
  beforeEach(async () => {
    await testPrisma.talisman.deleteMany({ where: { ownerId: USER } });
    await testPrisma.activeEffect.deleteMany({ where: { userId: USER } });
  });
  afterAll(async () => {
    await testPrisma.talisman.deleteMany({ where: { ownerId: USER } });
    await testPrisma.activeEffect.deleteMany({ where: { userId: USER } });
  });

  it("equips a talisman and reflects it in totals", async () => {
    const t = await makeTalisman("golden_horseshoe", 12); // luck +12
    await equipTalisman(USER, t.id);
    const totals = await getEquippedTalismanTotals(USER);
    expect(totals.luck).toBe(12);
  });

  it("rejects equipping past MAX_EQUIPPED", async () => {
    const made = [];
    for (let i = 0; i < MAX_EQUIPPED + 1; i++) made.push(await makeTalisman("golden_horseshoe", 10));
    for (let i = 0; i < MAX_EQUIPPED; i++) await equipTalisman(USER, made[i].id);
    await expect(equipTalisman(USER, made[MAX_EQUIPPED].id)).rejects.toThrow(/3/);
  });

  it("unequip removes the contribution", async () => {
    const t = await makeTalisman("profiteer", 10); // income_mult +10
    await equipTalisman(USER, t.id);
    expect((await getEquippedTalismanTotals(USER)).income_mult).toBe(10);
    await unequipTalisman(USER, t.id);
    expect((await getEquippedTalismanTotals(USER)).income_mult).toBe(0);
  });

  it("writes a permanent luck_modifier ActiveEffect when a luck talisman is equipped", async () => {
    const t = await makeTalisman("golden_horseshoe", 14);
    await equipTalisman(USER, t.id);
    const rows = await testPrisma.activeEffect.findMany({ where: { userId: USER, effectType: "luck_modifier" } });
    const talismanRow = rows.find((r) => (r.meta as any)?.source === "talisman");
    expect(talismanRow).toBeTruthy();
    expect(talismanRow!.value).toBe(14);
    expect(talismanRow!.expiresAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/talisman/equip.test.ts`
Expected: FAIL ("equipTalisman is not a function" / import error).

- [ ] **Step 3: Implement equip/unequip/aggregation**

Append to `src/services/talismanService.ts`:

```typescript
import { redisService } from "./redisService";

export const MAX_EQUIPPED = 3;

export async function getEquippedTalismanTotals(
  userId: string,
): Promise<{ luck: number; income_mult: number; loss_reduce: number }> {
  const equipped = await prisma.talisman.findMany({ where: { ownerId: userId, equipped: true } });
  const totals = { luck: 0, income_mult: 0, loss_reduce: 0 };
  for (const t of equipped) {
    const buff = getBuff(t.buffKey);
    if (!buff) continue;
    if (buff.effectType === "luck") totals.luck += t.magnitude;
    else if (buff.effectType === "income_mult") totals.income_mult += t.magnitude;
    else if (buff.effectType === "loss_reduce") totals.loss_reduce += t.magnitude;
  }
  // loss_reduce can never remove more than 100% of a loss.
  totals.loss_reduce = Math.min(100, totals.loss_reduce);
  return totals;
}

/** Recompute the aggregate of equipped-talisman buffs and write them as permanent
 *  records the game's modifier hooks read. Delete-and-rewrite keeps it consistent. */
export async function applyEquippedTalismanEffects(userId: string): Promise<void> {
  const totals = await getEquippedTalismanTotals(userId);

  // 1) Luck -> permanent luck_modifier ActiveEffect (source "talisman"), summed by getCurrentLuck.
  const luckRows = await prisma.activeEffect.findMany({ where: { userId, effectType: "luck_modifier" } });
  const luckRow = luckRows.find((r) => (r.meta as any)?.source === "talisman");
  if (totals.luck > 0) {
    if (luckRow) await prisma.activeEffect.update({ where: { id: luckRow.id }, data: { value: totals.luck, expiresAt: null } });
    else await prisma.activeEffect.create({ data: { userId, effectType: "luck_modifier", value: totals.luck, meta: { source: "talisman" }, expiresAt: null } });
  } else if (luckRow) {
    await prisma.activeEffect.delete({ where: { id: luckRow.id } });
  }

  // 2) income_mult + loss_reduce -> dedicated permanent ActiveEffect rows + Redis cache.
  await writeAggregateEffect(userId, "talisman_income_mult", totals.income_mult);
  await writeAggregateEffect(userId, "talisman_loss_reduce", totals.loss_reduce);
}

async function writeAggregateEffect(userId: string, effectType: string, value: number): Promise<void> {
  const existing = await prisma.activeEffect.findFirst({ where: { userId, effectType } });
  if (value > 0) {
    if (existing) await prisma.activeEffect.update({ where: { id: existing.id }, data: { value, expiresAt: null } });
    else await prisma.activeEffect.create({ data: { userId, effectType, value, expiresAt: null } });
    await redisService.set(`${effectType}:${userId}`, { value }, 30 * 24 * 3600);
  } else {
    if (existing) await prisma.activeEffect.delete({ where: { id: existing.id } });
    await redisService.del(`${effectType}:${userId}`);
  }
}

export async function equipTalisman(userId: string, talismanId: string): Promise<void> {
  const t = await prisma.talisman.findFirst({ where: { id: talismanId, ownerId: userId } });
  if (!t) throw new Error("Talisman not found.");
  if (t.equipped) throw new Error("That talisman is already equipped.");
  const count = await prisma.talisman.count({ where: { ownerId: userId, equipped: true } });
  if (count >= MAX_EQUIPPED) throw new Error(`You can only equip ${MAX_EQUIPPED} talismans. Unequip one first.`);
  await prisma.talisman.update({ where: { id: t.id }, data: { equipped: true } });
  await applyEquippedTalismanEffects(userId);
}

export async function unequipTalisman(userId: string, talismanId: string): Promise<void> {
  const t = await prisma.talisman.findFirst({ where: { id: talismanId, ownerId: userId } });
  if (!t) throw new Error("Talisman not found.");
  if (!t.equipped) throw new Error("That talisman is not equipped.");
  await prisma.talisman.update({ where: { id: t.id }, data: { equipped: false } });
  await applyEquippedTalismanEffects(userId);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/talisman/equip.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/services/talismanService.ts test/talisman/equip.test.ts
git commit -m "feat(talisman): equip/unequip with permanent effect aggregation"
```

---

## Task 5: Wire income_mult and loss_reduce into the economy hooks

**Files:**
- Modify: `src/services/shopBuffs.ts` (`applyIncomeModifiers` ~line 244-249; `applyLossModifiers` ~line 251-254)
- Test: `test/talisman/effects.test.ts`

**Interfaces:**
- Consumes: `ActiveEffect` rows `talisman_income_mult` / `talisman_loss_reduce` written in Task 4; `redisService`.
- Produces: `applyIncomeModifiers` multiplies by `1 + income%/100`; `applyLossModifiers` multiplies by `max(0, 1 − reduce%/100)`. Luck already flows through `getCurrentLuck` (no change needed — asserted in the test).

- [ ] **Step 1: Write the failing test**

Create `test/talisman/effects.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, flushTestKeys } from "../helpers";
import { equipTalisman, unequipTalisman } from "../../src/services/talismanService";
import { applyIncomeModifiers, applyLossModifiers, getCurrentLuck } from "../../src/services/shopBuffs";

const USER = "tal-effects-1";

async function makeTalisman(buffKey: string, magnitude: number, rarity = "Rare") {
  return testPrisma.talisman.create({
    data: { ownerId: USER, tier: "Rare", buffKey, buffRarity: rarity, magnitude },
  });
}

describe("talisman gameplay effects", () => {
  beforeEach(async () => {
    await testPrisma.talisman.deleteMany({ where: { ownerId: USER } });
    await testPrisma.activeEffect.deleteMany({ where: { userId: USER } });
    await flushTestKeys(`talisman_*:${USER}`);
  });
  afterAll(async () => {
    await testPrisma.talisman.deleteMany({ where: { ownerId: USER } });
    await testPrisma.activeEffect.deleteMany({ where: { userId: USER } });
    await flushTestKeys(`talisman_*:${USER}`);
  });

  it("equipped income_mult raises applyIncomeModifiers output, unequip restores", async () => {
    const base = await applyIncomeModifiers(USER, 100_000, "work");
    const t = await makeTalisman("profiteer", 10); // +10%
    await equipTalisman(USER, t.id);
    const boosted = await applyIncomeModifiers(USER, 100_000, "work");
    expect(boosted).toBe(Math.floor(base * 1.10));
    await unequipTalisman(USER, t.id);
    expect(await applyIncomeModifiers(USER, 100_000, "work")).toBe(base);
  });

  it("equipped loss_reduce lowers applyLossModifiers output", async () => {
    const t = await makeTalisman("tax_evader", 25); // -25%
    await equipTalisman(USER, t.id);
    const reduced = await applyLossModifiers(USER, 100_000, "crime_fine");
    expect(reduced).toBe(Math.floor(100_000 * 0.75));
  });

  it("Untaxable (loss_reduce 100) makes losses zero", async () => {
    const t = await makeTalisman("untaxable", 100, "Mythic");
    await equipTalisman(USER, t.id);
    expect(await applyLossModifiers(USER, 100_000, "crime_fine")).toBe(0);
  });

  it("equipped luck flows through getCurrentLuck", async () => {
    const t = await makeTalisman("golden_horseshoe", 12);
    await equipTalisman(USER, t.id);
    expect(await getCurrentLuck(USER)).toBe(62); // 50 base + 12
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/talisman/effects.test.ts`
Expected: FAIL (income/loss tests fail — modifiers not yet applied).

- [ ] **Step 3: Add a talisman-aggregate reader and wire the two hooks**

In `src/services/shopBuffs.ts`, add a helper near the income/loss section (after `checkTaxShield`, ~line 55):

```typescript
async function readTalismanAggregate(discordId: string, effectType: string): Promise<number> {
  const cached = await redisService.get<{ value: number }>(`${effectType}:${discordId}`);
  if (cached) return cached.value;
  const row = await prisma.activeEffect.findFirst({
    where: { userId: discordId, effectType, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  return row?.value ?? 0;
}
```

Ensure `redisService` is imported at the top of `shopBuffs.ts` (it already imports `prisma`; add if missing):

```typescript
import { redisService } from "./redisService";
```

Modify `applyIncomeModifiers` (~line 244-249) to:

```typescript
export async function applyIncomeModifiers(discordId: string, baseAmount: number, source: IncomeSource): Promise<number> {
  const counterfeit = await checkCounterfeitKit(discordId);
  const crown = await checkCrownOfGreed(discordId);
  const devil = await checkDevilContract(discordId);
  const talismanPct = await readTalismanAggregate(discordId, "talisman_income_mult");
  const talisman = 1 + talismanPct / 100;
  return Math.floor(baseAmount * counterfeit * crown * devil * talisman);
}
```

Modify `applyLossModifiers` (~line 251-254) to:

```typescript
export async function applyLossModifiers(discordId: string, baseAmount: number, source: LossSource): Promise<number> {
  const crown = await checkCrownOfGreed(discordId);
  const reducePct = Math.min(100, await readTalismanAggregate(discordId, "talisman_loss_reduce"));
  const talisman = Math.max(0, 1 - reducePct / 100);
  return Math.floor(baseAmount * crown * talisman);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/talisman/effects.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Run the full talisman suite**

Run: `npx vitest run test/talisman`
Expected: PASS (all files green).

- [ ] **Step 6: Commit**

```bash
git add src/services/shopBuffs.ts test/talisman/effects.test.ts
git commit -m "feat(talisman): wire income and loss modifiers to equipped talismans"
```

---

## Task 6: Talisman dashboard UI + command + interactions

**Files:**
- Modify: `src/services/talismanService.ts` (add `buildTalismanPayload`)
- Create: `src/commands/economy/talisman.ts`
- Modify: `src/commandRouter.ts` (import + `case "talisman"`)
- Modify: `src/handlers/huntInteractionHandler.ts` (equip/unequip/page interactions)
- Test: `test/talisman/ui.test.ts`

**Interfaces:**
- Consumes: equip/unequip/totals from Task 4; `getBuff` (Task 2); discord.js ComponentsV2 builders (see `huntCraftService.buildHuntCraftPayload` for the exact pattern).
- Produces:
  - `buildTalismanPayload(userId, ownerId, page?)` → `Promise<{ components: any[]; flags: number }>`.
  - `handleTalisman(message, args)` in `talisman.ts`.
  - Interaction IDs `talisman_page:{page}:{ownerId}`, `talisman_equip:{talismanId}:{ownerId}`, `talisman_unequip:{talismanId}:{ownerId}`.

- [ ] **Step 1: Write the payload builder**

Append to `src/services/talismanService.ts` (mirror the ComponentsV2 pattern in `huntCraftService.buildHuntCraftPayload`):

```typescript
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder,
} from "discord.js";

const TALISMANS_PER_PAGE = 4;

function talSeparator(divider = false) {
  return new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Small);
}

function effectLine(buffKey: string, magnitude: number): string {
  const buff = getBuff(buffKey);
  if (!buff) return `Unknown buff (${buffKey})`;
  const val = buff.effectType === "luck" ? `+${magnitude} Luck`
    : buff.effectType === "income_mult" ? `+${magnitude}% income`
    : `−${magnitude}% losses`;
  return `${buff.name} · ${buff.rarity} · ${val}`;
}

export async function buildTalismanPayload(userId: string, ownerId: string, page = 1, disabled = false) {
  const all = await prisma.talisman.findMany({ where: { ownerId: userId }, orderBy: [{ equipped: "desc" }, { createdAt: "desc" }] });
  const equippedCount = all.filter((t) => t.equipped).length;
  const totalPages = Math.max(1, Math.ceil(all.length / TALISMANS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = all.slice((safePage - 1) * TALISMANS_PER_PAGE, safePage * TALISMANS_PER_PAGE);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Talismans\n-# Equipped ${equippedCount}/${MAX_EQUIPPED} · Page ${safePage}/${totalPages}`),
    )
    .addSeparatorComponents(talSeparator(true));

  if (all.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# You have no talismans yet. Craft one with `!hunt craft`."),
    );
  }

  for (const t of pageRows) {
    const label = t.equipped ? "Unequip" : "Equip";
    const style = t.equipped ? ButtonStyle.Secondary : ButtonStyle.Success;
    const action = t.equipped ? "talisman_unequip" : "talisman_equip";
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${t.tier} Talisman${t.equipped ? " · equipped" : ""}`),
          new TextDisplayBuilder().setContent(effectLine(t.buffKey, t.magnitude)),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`${action}:${t.id}:${ownerId}`)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(disabled),
        ),
    );
    container.addSeparatorComponents(talSeparator(false));
  }

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`talisman_page:${safePage - 1}:${ownerId}`).setLabel("Prev").setStyle(ButtonStyle.Secondary).setDisabled(disabled || safePage <= 1),
    new ButtonBuilder().setCustomId(`talisman_page:${safePage + 1}:${ownerId}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(disabled || safePage >= totalPages),
  );

  return { components: [container, nav], flags: MessageFlags.IsComponentsV2 } as any;
}
```

- [ ] **Step 2: Write the command entry**

Create `src/commands/economy/talisman.ts`:

```typescript
import { Message } from "discord.js";
import { buildTalismanPayload } from "../../services/talismanService";

export async function handleTalisman(message: Message, _args: string[]) {
  const ownerId = message.author.id;
  return message.reply(await buildTalismanPayload(ownerId, ownerId, 1));
}
```

- [ ] **Step 3: Route the command**

In `src/commandRouter.ts`, add the import near the other command imports (~line 50):

```typescript
import { handleTalisman } from "./commands/economy/talisman";
```

And add a case near `case "hunt"` (~line 412):

```typescript
    case "talisman":
    case "talismans":
      return handleTalisman(message, args);
```

- [ ] **Step 4: Add interaction handling**

In `src/handlers/huntInteractionHandler.ts`, add these blocks at the start of `handleHuntInteraction` (after `const parts = customId.split(":");`, ~line 64), following the existing `hunt_craft_page` / `hunt_craft_make` style. Add the import at the top:

```typescript
import { buildTalismanPayload, equipTalisman, unequipTalisman } from "../services/talismanService";
```

Then the handlers:

```typescript
  if (customId.startsWith("talisman_page:") && interaction.isButton()) {
    const [, pageRaw, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your talisman dashboard.");
    await refreshMessageComponent(interaction, () => buildTalismanPayload(ownerId, ownerId, parseInt(pageRaw, 10) || 1));
    return;
  }

  if ((customId.startsWith("talisman_equip:") || customId.startsWith("talisman_unequip:")) && interaction.isButton()) {
    const [action, talismanId, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your talisman dashboard.");
    try {
      if (action === "talisman_equip") await equipTalisman(ownerId, talismanId);
      else await unequipTalisman(ownerId, talismanId);
      await refreshMessageComponent(interaction, () => buildTalismanPayload(ownerId, ownerId, 1));
    } catch (err: any) {
      return replyEphemeral(interaction, err.message || "Could not update that talisman.");
    }
    return;
  }
```

(Confirm `refreshMessageComponent` and `replyEphemeral` are already imported/defined in this file — they are used by the existing `hunt_craft_page` handler. Reuse them.)

- [ ] **Step 5: Write the failing test**

Create `test/talisman/ui.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma } from "../helpers";
import { buildTalismanPayload } from "../../src/services/talismanService";

const USER = "tal-ui-1";

describe("buildTalismanPayload", () => {
  beforeEach(async () => { await testPrisma.talisman.deleteMany({ where: { ownerId: USER } }); });
  afterAll(async () => { await testPrisma.talisman.deleteMany({ where: { ownerId: USER } }); });

  it("builds a ComponentsV2 payload listing owned talismans", async () => {
    await testPrisma.talisman.create({ data: { ownerId: USER, tier: "Rare", buffKey: "golden_horseshoe", buffRarity: "Rare", magnitude: 12 } });
    const payload = await buildTalismanPayload(USER, USER, 1);
    expect(payload.flags).toBeDefined();
    expect(Array.isArray(payload.components)).toBe(true);
    expect(payload.components.length).toBeGreaterThan(0);
  });

  it("handles an empty inventory without throwing", async () => {
    const payload = await buildTalismanPayload(USER, USER, 1);
    expect(payload.components.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run test/talisman/ui.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 7: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/talismanService.ts src/commands/economy/talisman.ts src/commandRouter.ts src/handlers/huntInteractionHandler.ts test/talisman/ui.test.ts
git commit -m "feat(talisman): dashboard UI, !talisman command, equip interactions"
```

---

## Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all suites pass, including the new `test/talisman/*` files and the pre-existing anticheat suites (no regressions).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (optional, requires a running bot)**

`!hunt craft` → craft a Rabbit Foot Talisman → confirm the reveal message names a rolled buff → `!talisman` → Equip it → re-open `!talisman` and confirm it shows "equipped" and the `X/3` counter increments.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test(talisman): wave 1 full-suite verification"
```

---

## Self-Review Notes

- **Spec coverage (Wave 1 subset):** model ✓ (T1), catalog+roll+weights+magnitude ✓ (T2), 4 recipes + craft-to-instance ✓ (T3), 3-slot equip + aggregation + permanent effects ✓ (T4), luck/income/loss wiring ✓ (T4-T5), dashboard/command/interactions + craft reveal ✓ (T3 message, T6), tests ✓ (each task). Deferred to later waves (per spec build order): extended stats (sell_bonus, crime_payout, reward_mult, interest_mult, game_winchance, gamble_insurance, passive_income) and all new mechanics (double_catch, guaranteed_rare, fine_negate, no_heat, daily_crime_win, garnish_immune, rob_reversal, cooldown_reduce, jackpot, chaos_double). Black-market trading remains out of scope.
- **Type consistency:** `TalismanTier`/`BuffRarity`/`TalismanEffectType` defined in T2 and reused verbatim in T3-T6; `getEquippedTalismanTotals` returns `{ luck, income_mult, loss_reduce }` used identically in T4/T5; aggregate ActiveEffect types `talisman_income_mult` / `talisman_loss_reduce` written in T4 and read in T5 with matching strings.
- **No placeholders:** every step ships real code/commands.
```
