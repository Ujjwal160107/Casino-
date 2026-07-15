# Talisman Gacha System — Design

**Date:** 2026-07-15
**Status:** Approved (design), ready for implementation plan
**Supersedes:** the talisman portion of
`2026-07-15-hunt-blueprints-talisman-revamp-design.md` (blueprint interface and
black-market trading are deferred to future phases — see Out of Scope).

## Goal

Replace the fixed-effect luck charms with a **gacha talisman system**: crafting a
Tier-X talisman **rolls a random buff** (which buff *and* its magnitude) from that
tier's weighted pool. Higher tiers reach rarer, more powerful buffs; the rarest
(1%) appear **only** in Legendary talismans. Talismans are **per-instance** items
a player can hold and **equip** (up to 3 at once) for a **permanent** effect
while equipped. The rolled buff is **revealed on craft**.

## Confirmed Decisions

- **Activation:** equip slots — hold talismans, equip up to **3**; only equipped
  talismans are active. (Buff persists while equipped; no expiry.)
- **Magnitude:** each buff rolls a **random magnitude within a range** →
  per-instance data → talismans are their own instance model (not generic
  ShopItems).
- **Reveal:** buff + magnitude shown on craft and on the talisman item.
- **Buffs span modules** (luck, income, losses, crime, rob, hunt, zoo), with a
  rarity hierarchy where stronger = rarer.

## Out of Scope (deferred)

- **Black-market trading of talismans.** The current market (`marketService`)
  trades only `shopItemId + amount` and explicitly blocks per-instance/meta items
  (`marketService.ts` lines 45-48). Trading talismans requires a full BM rework —
  a separate future project. For now talismans are **not listable**.
- **Blueprint pick-to-unlock interface** (Part A of the prior spec). Rare and
  Legendary talisman *recipes* continue to unlock via the existing random
  blueprint-use path (`handleBlueprintUnlock`). Common/Uncommon unlock by hunting.

## Precedent

Model the talisman system after the **hunt-parts pattern**: a self-contained
parallel track (`HuntPartInventory` + service + own market UI section), NOT
shoehorned into the generic `Inventory`/`ShopItem`/`MarketListing` tables.

## Data Model (Prisma)

One new model. No changes to `Inventory`, `ShopItem`, or `MarketListing`.

```prisma
model Talisman {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  ownerId    String
  tier       String   // Common | Uncommon | Rare | Legendary
  buffKey    String   // catalog key of the rolled buff
  buffRarity String   // Common..Mythic (buff's own rarity, for display/sort)
  magnitude  Float    // rolled value within the buff's range
  equipped   Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([ownerId])
  @@index([ownerId, equipped])
}
```

(A `listed` flag and a `TalismanListing` model are intentionally omitted — they
belong to the deferred black-market phase.)

## Buff Catalog (`src/data/talismanBuffCatalog.ts`)

Each buff is a fixed catalog entry; only its magnitude rolls within a range.

```ts
type TalismanEffectType =
  | "luck"            // flat luck points -> luck_modifier
  | "income_mult"     // % -> applyIncomeModifiers
  | "loss_reduce"     // % reduction -> applyLossModifiers (100 = immune)
  | "crime_success"   // flat % added to crime success chance
  | "rob_loot"        // % -> rob payout multiplier
  | "hunt_rare"       // fraction added to Rare hunt weight
  | "hunt_legendary"  // fraction added to Legendary hunt weight
  | "zoo_income";     // % -> zoo income multiplier

interface TalismanBuff {
  key: string;
  name: string;
  rarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";
  effectType: TalismanEffectType;
  range: [number, number]; // inclusive; integers unless noted
  module: string;          // label for UI ("Crime", "Hunt", ...)
}
```

### Catalog contents (initial values — tunable)

| Buff | Rarity | Effect | Range |
|---|---|---|---|
| Lucky Trinket | Common | luck | +2 … +4 |
| Steady Aim | Common | hunt_rare | +3% … +6% |
| Light Fingers | Common | rob_loot | +5% … +10% |
| Padded Ledger | Common | loss_reduce | −4% … −8% |
| Fortune's Nudge | Uncommon | luck | +5 … +8 |
| Silver Tongue | Uncommon | crime_success | +4% … +7% |
| Zoo Whisperer | Uncommon | zoo_income | +6% … +10% |
| Cat Burglar | Uncommon | rob_loot | +12% … +18% |
| Golden Horseshoe | Rare | luck | +10 … +14 |
| Profiteer | Rare | income_mult | +8% … +12% |
| Tax Evader | Rare | loss_reduce | −15% … −25% |
| Kingpin | Rare | crime_success | +9% … +14% |
| High Roller | Epic | luck | +14 … +18 |
| Midas Touch | Epic | income_mult | +16% … +24% |
| Untouchable | Epic | loss_reduce | −30% … −40% |
| Apex Hunter | Epic | hunt_legendary | +4% … +7% |
| Fortune's Favor | Legendary | luck | +22 … +28 |
| Golden Goose | Legendary | income_mult | +30% … +40% |
| Crime Lord | Legendary | crime_success | +20% … +28% |
| Golden Idol | Mythic | income_mult | +45% … +55% |
| Untaxable | Mythic | loss_reduce | −100% (immune) |
| God of Fortune | Mythic | luck | +30 … +40 |

### Per-tier rarity weights (roll distribution)

The talisman **tier** selects a buff-rarity by these weights, then a buff is
picked uniformly within that rarity, then magnitude rolls uniformly in range.

| Buff rarity | Common tali | Uncommon tali | Rare tali | Legendary tali |
|---|---|---|---|---|
| Common | 85 | 55 | 25 | 8 |
| Uncommon | 15 | 35 | 40 | 22 |
| Rare | 0 | 10 | 28 | 34 |
| Epic | 0 | 0 | 7 | 25 |
| Legendary | 0 | 0 | 0 | 10 |
| Mythic | 0 | 0 | 0 | 1 |

(Each column sums to 100. Mythics are Legendary-tali-only at 1%.)

### Roll function

`rollTalismanBuff(tier)` → `{ buffKey, buffRarity, magnitude }`:
1. Weighted-pick a rarity from the tier's column.
2. Uniform-pick a buff of that rarity from the catalog.
3. Uniform-roll magnitude within the buff's `range` (integer, except the fixed
   −100% immune value).

## Talisman Recipes

Four recipes, one per tier, added to `HUNT_CRAFT_RECIPES` with a new effect type
`{ type: "talisman_roll"; tier }`. Existing luck-charm keys are reused so prior
unlocks are preserved; two new mid-tier recipes are added.

| Recipe | Key | Tier | Parts (example) | Coin cost |
|---|---|---|---|---|
| Rabbit Foot Talisman | `rabbit_foot_charm` (reworked) | Common | rabbit_fur ×3, rabbit_meat ×2 | 75,000 |
| Fox Spirit Talisman | `fox_spirit_talisman` (new) | Uncommon | fox_tail ×3, fox_fur ×3 | 500,000 |
| Bear Heart Talisman | `bear_heart_talisman` (new) | Rare | black_bear_pelt ×3, black_bear_claws ×2 | 1,500,000 |
| Arctic Wolf Talisman | `arctic_wolf_spirit_charm` (reworked) | Legendary | arctic_wolf_fur ×2, arctic_wolf_fangs ×2 | 6,000,000 |

Craft flow (`craftHuntRecipe`, `talisman_roll` branch): inside the existing
transaction, verify parts + coins, consume them, `rollTalismanBuff(tier)`, and
create a `Talisman` instance owned by the crafter. The result message reveals the
rolled buff, rarity, and magnitude. No ShopItem/Inventory row is created for
talismans.

## Equip System

- **Cap:** 3 equipped talismans per user. Equipping a 4th is rejected.
- **Equip:** set `equipped = true` (verify owner, currently-equipped < 3), then
  **recompute aggregate buffs** and write them through the effect hooks below.
- **Unequip:** set `equipped = false`, then recompute (removing that
  contribution).
- **Aggregation:** `applyEquippedTalismanEffects(userId)` reads all equipped
  talismans, sums magnitudes per `effectType`, and writes each as a **permanent**
  record keyed by source `talisman`:
  - `luck` → a `luck_modifier` `ActiveEffect` (`expiresAt: null`, source
    `talisman`) — already summed by `getCurrentLuck` and bounded by the 100 cap.
  - all other types → permanent `ActiveEffect` rows of type `talisman_<effect>`
    (`expiresAt: null`) + a write-through Redis key, following the existing
    `getCraftEffect` fallback pattern.
  Recompute **replaces** the prior aggregate each time (delete-and-rewrite the
  `talisman`-sourced records), so equip/unequip is always consistent.

### Effect hook wiring (cross-module)

Each module reads its permanent talisman aggregate (read-only, never consumed):

| Effect | Hook | Behaviour |
|---|---|---|
| luck | `getCurrentLuck` / `applyLuckToChance` (`shopBuffs.ts`) | already counts the permanent `luck_modifier` row |
| income_mult | `applyIncomeModifiers` (`shopBuffs.ts`) | multiply by `1 + total%/100` |
| loss_reduce | `applyLossModifiers` (`shopBuffs.ts`) | multiply by `max(0, 1 − total%/100)` (100 ⇒ ×0) |
| crime_success | crime resolution (`crimeService.ts`) | add total% to success chance (alongside existing `crime_boost`) |
| rob_loot | rob payout (`rob.ts`) | multiply payout by `1 + total%/100` |
| hunt_rare / hunt_legendary | hunt weights (`huntService.ts`) | add to Rare/Legendary weight, keeping the existing `min(0.40)`/`min(0.20)` clamps; NOT deleted after the hunt |
| zoo_income | zoo income claim (`huntService.ts`) | multiply by `1 + total%/100` (alongside existing `zoo_boost`) |

`loss_reduce` totals are **clamped to 100** so multiple reducers can't overshoot
into negative losses. Other totals inherit each module's existing safety clamp.

## UI

- **Command:** `!talisman` (alias surfaced from the hunt craft menu) opens the
  talisman dashboard — a paged list of owned talismans showing name, buff,
  magnitude, rarity, tier, and equipped state, plus an **Equip/Unequip** button
  per talisman and an `X/3 equipped` header.
- **Interaction IDs:** `talisman_page:{page}:{ownerId}`,
  `talisman_equip:{talismanId}:{ownerId}`,
  `talisman_unequip:{talismanId}:{ownerId}`. Owner-guarded like the existing
  hunt-craft handlers.
- **Craft reveal:** the craft result message names the rolled buff, its rarity,
  and magnitude (e.g. "🎲 You rolled **Crime Lord** (Legendary) — +24% crime
  success!").

## Testing

Unit tests (Mongo via in-memory server, matching existing setup):

- **Roll distribution:** over many rolls, magnitudes stay within each buff's
  range; Mythic buffs only appear from Legendary talismans; each tier only rolls
  rarities allowed by its weight column.
- **Craft:** consumes the correct parts + coins in one transaction; creates
  exactly one `Talisman` instance with the rolled fields; rejects when
  parts/coins are missing.
- **Equip cap:** equipping past 3 is rejected; equip/unequip toggles `equipped`.
- **Aggregation:** equipping writes the expected permanent effect records;
  unequipping removes that contribution; luck respects the 100 cap; `loss_reduce`
  clamps at 100.
- **Effect application:** an equipped `income_mult` talisman raises
  `applyIncomeModifiers` output; unequipping restores baseline. Same shape for
  `loss_reduce`.

## Migration / Compatibility

- `rabbit_foot_charm` and `arctic_wolf_spirit_charm` change from timed-luck
  charms to `talisman_roll` recipes. Players who already unlocked them keep the
  unlock; the recipe simply now rolls a talisman.
- No destructive migration: the new `Talisman` collection starts empty; old
  timed luck effects expire naturally.
