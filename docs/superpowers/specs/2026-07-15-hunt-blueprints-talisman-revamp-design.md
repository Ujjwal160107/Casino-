# Hunt Blueprint Interface + Talisman Revamp — Design

**Date:** 2026-07-15
**Status:** Approved (design), ready for implementation plan

## Goal

Two related improvements to the hunt crafting system:

1. **Blueprint interface** — a browsable UI listing every Rare/Legendary craft
   recipe, where using a blueprint lets the player **pick which recipe to
   unlock** instead of unlocking one at random.
2. **Talisman revamp** — replace the ad-hoc luck charms with a coherent 4-piece
   Talisman set (one per tier). Talismans grant **permanent** luck that stacks;
   the Legendary talisman additionally grants a strong permanent secondary
   passive.

## Current State (for reference)

- Recipes live in `HUNT_CRAFT_RECIPES` in `src/services/huntCraftService.ts`.
- Common/Uncommon unlock automatically on first catch of a contributing
  species. Rare/Legendary unlock only by **using** a `rare_blueprint` (500k) or
  `legendary_blueprint` (2M) item, which unlocks **one random** unowned recipe
  of that tier (`handleBlueprintUnlock` in `src/services/shopItemEffects.ts`).
- Luck-granting recipes today (`rabbit_foot_charm`, `arctic_wolf_spirit_charm`)
  give **timed** luck buffs via `upsertLuckModifier`.
- The gameplay luck system (`src/services/shopBuffs.ts`) stores luck as
  `ActiveEffect` rows of `effectType: "luck_modifier"`. `getCurrentLuck` sums
  `50 + Σ modifiers`, **capped at 100**, and the query already counts rows with
  `expiresAt: null` — so a *permanent* luck bonus is naturally expressible and
  feeds real odds via `applyLuckToChance`.
- The `COSMETIC_LUCK` map in `src/commands/economy/profile.ts` is a separate,
  profile-display-only value — it does NOT feed `getCurrentLuck`. Talisman luck
  will use the real `luck_modifier` path, not this map.
- Hunt-odds boosts (`hunt_rare_boost` / `hunt_legendary_boost`) are read at hunt
  time in `src/services/huntService.ts` and **deleted after the hunt**
  (one-shot). A permanent variant must be read but never consumed.

## Part A — Blueprint Interface

### Behaviour

A new paged interface, mirroring the existing craft menu
(`buildHuntCraftPayload`), listing **every Rare and Legendary recipe** with its
parts, effect description, and lock status.

- **Entry points:** `!hunt blueprints` subcommand + a **"Blueprints"** button on
  the craft menu; the blueprints view has a **"Craft"** link back. Both reuse
  the existing ownerId-guarded interaction pattern in
  `src/handlers/huntInteractionHandler.ts`.
- **Header:** shows how many Rare / Legendary blueprint items the player owns.
- **Per recipe:**
  - Unlocked → shows "✓ Unlocked" (disabled button).
  - Locked, player owns a matching-tier blueprint → **Unlock** button (enabled).
  - Locked, no matching blueprint → disabled button with hint to buy one.
- **Unlock action:** atomically, in a single transaction —
  1. Verify the player still owns ≥1 matching-tier blueprint item.
  2. Decrement one blueprint from inventory (delete row if it hits 0).
  3. Upsert the `UserCraftUnlock` for the chosen recipe key.
  This prevents double-spend and guarantees exactly one blueprint per unlock.
- **All-unlocked case:** when every recipe of a tier is already known, its Unlock
  buttons disappear and a note explains the blueprint isn't needed. (This
  replaces the old "refund on use" behaviour.)

### Retiring the random-use path

The current `handleBlueprintUnlock` random-unlock path in `shopItemEffects.ts`
is replaced. Using a blueprint item directly from the inventory now returns a
message pointing the player to `!hunt blueprints` to pick a recipe, and does
**not** consume the item (`shouldConsume: false`). Blueprints are still
purchased from the hunt shop exactly as today; only the redemption path changes.

### New/changed interaction IDs

- `hunt_blueprints_page:{page}:{ownerId}` — paging.
- `hunt_blueprint_unlock:{recipeKey}:{ownerId}` — unlock a specific recipe.
- `hunt_blueprints_open:{ownerId}` / `hunt_craft_open:{ownerId}` — switch views.

## Part B — Talisman Revamp

### The set

A 4-piece Talisman set, one per tier, using the new recipe effect type
`talisman`. Existing luck-charm recipe **keys are preserved** where possible so
already-unlocked players are not disrupted; two new mid-tier recipes are added.

| Talisman | Recipe key | Tier | Permanent luck | Legendary secondary |
|---|---|---|---|---|
| Rabbit Foot Talisman | `rabbit_foot_charm` (reworked) | Common | +2 | — |
| Fox Spirit Talisman | `fox_spirit_talisman` (new, fox parts) | Uncommon | +4 | — |
| Bear Heart Talisman | `bear_heart_talisman` (new, black bear parts) | Rare | +7 | — |
| Arctic Wolf Talisman | `arctic_wolf_spirit_charm` (reworked) | Legendary | +12 | +3% hunt Rare odds |

Numbers (luck +2/+4/+7/+12, secondary +3% step) are initial values and tunable.

### Effect type

```ts
| { type: "talisman"; permLuck: number; huntRareBoost?: number }
```

- `permLuck` — luck added per craft.
- `huntRareBoost` — optional permanent hunt Rare-odds increment (Legendary only).

### Mechanics

- **Permanent luck:** one `luck_modifier` `ActiveEffect` per user with
  `expiresAt: null` and `meta.source = "talisman"`. Each craft **increments**
  its `value` by `permLuck` (rather than upserting a fixed value), giving
  unlimited stacking. Globally bounded by the existing 100-luck cap in
  `getCurrentLuck`, so it can never exceed the game's luck ceiling.
- **Legendary secondary passive:** a permanent `perm_hunt_rare_boost`
  `ActiveEffect` (`expiresAt: null`). Read at hunt time in `huntService.ts`
  alongside the existing one-shot boost, added to the Rare weight, and **never
  deleted**. Increments per craft, **capped independently at +15%** so
  repeat-crafting cannot run away. (The existing per-hunt `weights.Rare`
  min(0.40) clamp still applies as a final safety bound.)
- **Collectible item:** crafting a talisman also grants a collectible inventory
  item (via `grantCraftedInventoryItem`, non-consumable) so the talisman shows
  as owned in inventory/profile. The functional effect lives in the ActiveEffect
  rows, not the item.

### Stacking summary

- Talismans are craftable repeatedly (unlimited stacking).
- Luck stacks additively, hard-bounded by the 100 total-luck cap.
- The Legendary secondary passive stacks additively, bounded by its own +15% cap
  AND the existing per-hunt Rare-weight clamp.

## Part C — Data / Schema

- **No Prisma schema changes.** All state uses existing tables:
  `UserCraftUnlock` (blueprint unlocks), `ActiveEffect` (permanent luck +
  permanent hunt boost), `Inventory`/`ShopItem` (blueprint items, talisman
  collectibles).
- Redis: permanent effects use `expiresAt: null`; the write-through Redis cache
  keys for talisman luck / perm hunt boost are set without a TTL (or with a long
  TTL and DB fallback), consistent with the existing `getCraftEffect` fallback
  pattern.

## Part D — Testing

Unit tests (Mongo via in-memory server, per existing test setup):

- **Blueprint unlock:** consumes exactly one blueprint, unlocks the chosen
  recipe, rejects when no matching blueprint owned, and does not double-spend
  under the transaction; all-unlocked tier hides Unlock buttons.
- **Talisman luck stacking:** each craft increments the permanent `luck_modifier`
  row; `getCurrentLuck` reflects the sum and respects the 100 cap; the row
  persists with `expiresAt: null`.
- **Legendary secondary:** `perm_hunt_rare_boost` increments per craft, respects
  the +15% cap, is read at hunt time, and is NOT deleted after a hunt.

## Out of Scope

- No changes to the `COSMETIC_LUCK` profile map or existing cosmetic recipes
  (crowns, mantles, trophy case stay as-is).
- No changes to non-luck one-shot craft effects (crime, rob, cock, zoo, venom).
- No rebalancing of blueprint shop prices.
