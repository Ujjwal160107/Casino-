# Hunt Crafting & Marketplace — Completion Design

**Date:** 2026-05-29  
**Branch:** fortuna-v2  
**Goal:** Bring the hunt system to 100% — wire all missing routes, persist craft effects to DB, add recipe unlock progression, and surface the craft tutorial.

---

## 1. Recipe Unlock System

### Data Model

New Prisma model `UserCraftUnlock`:

```prisma
model UserCraftUnlock {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String
  recipeKey   String
  unlockedAt  DateTime @default(now())

  @@unique([userId, recipeKey])
  @@index([userId])
}
```

### Unlock Rules

| Tier | Unlock Method |
|------|--------------|
| Common | Auto-unlock on first catch of any animal whose parts appear in the recipe |
| Uncommon | Auto-unlock on first catch (same as common) |
| Rare | Buy a `rare_blueprint` item from hunt shop (unlocks random unowned rare recipe) |
| Legendary | Buy a `legendary_blueprint` item from hunt shop (unlocks random unowned legendary recipe) |

### Common/Uncommon — First Catch Trigger

- `huntService.hunt()` calls `unlockCommonRecipesForAnimal(userId, animalKey)` after a successful catch.
- Function: find all COMMON/UNCOMMON recipes in `HUNT_CRAFT_RECIPES` where `ingredients` contains any part key belonging to `animalKey`. For each, upsert `UserCraftUnlock { userId, recipeKey }` (idempotent).
- Returns list of newly unlocked recipe names (empty array if none new).
- If non-empty, append discovery line to hunt result: `"New recipe discovered: [Name]!"` per recipe, inline in the result container.

### Rare/Legendary — Blueprint Items

Two new shop items added to `HUNT_SHOP_CATALOG`:

```ts
{
  key: 'rare_blueprint',
  name: 'Rare Blueprint',
  description: 'Unlocks a random Rare craft recipe you don\'t already know.',
  price: 500_000,
  category: 'HUNT',
  usable: true,
  stackable: true,
}
{
  key: 'legendary_blueprint',
  name: 'Legendary Blueprint',
  description: 'Unlocks a random Legendary craft recipe you don\'t already know.',
  price: 2_000_000,
  category: 'HUNT',
  usable: true,
  stackable: true,
}
```

**Effect handler** in `shopItemEffects.ts` for both keys:

1. Query `UserCraftUnlock` for userId — get set of already-unlocked recipeKeys.
2. Filter `HUNT_CRAFT_RECIPES` to the matching tier, exclude already-unlocked keys.
3. If none left: refund the item (upsert back to inventory), return message `"You've already unlocked all [tier] recipes!"`.
4. Pick a random recipe from the remaining list.
5. Insert `UserCraftUnlock { userId, recipeKey }`.
6. Return success message: `"Unlocked: [Recipe Name] — view it with /hunt craft"`.

---

## 2. Craft UI Update (`buildHuntCraftPayload`)

`buildHuntCraftPayload(userId, page)` receives the user's unlock set and renders each recipe according to its state:

| State | Display |
|-------|---------|
| Unlocked | Full recipe — name, required parts with amounts, effect description, Craft button (enabled) |
| Common/Uncommon locked | `???` as name, `"Catch a [Animal] to discover"` as hint, Craft button (disabled) |
| Rare locked | Recipe name shown, lock indicator, `"Buy a Rare Blueprint to unlock"`, Craft button (disabled) |
| Legendary locked | Recipe name shown, lock indicator, `"Buy a Legendary Blueprint to unlock"`, Craft button (disabled) |

Animal hint for common/uncommon: derive from first ingredient in the recipe — look up which animal drops that part from `ANIMAL_CATALOG`.

**No Unicode emoji** on buttons or labels. Use existing custom emoji constants from the codebase or plain text.

---

## 3. Effect Persistence Fix

### Problem

`applyCraftEffect()` writes most buff effects to Redis only. Redis restart silently wipes all active crafted buffs with no recovery path.

### Solution

DB is source of truth; Redis is a fast read-through cache.

**Write path** (in `applyCraftEffect`):
1. Upsert `ActiveEffect { userId, effectType, value, expiresAt }` — overwrite if same `[userId, effectType]` already exists (re-crafting refreshes duration).
2. Write same data to Redis key `craft_effect:{userId}:{effectType}` with matching TTL.

**Read path** (wherever effects are checked — `huntService`, `jobService`, etc.):
1. Try Redis first.
2. On miss: query `ActiveEffect` where `userId = x AND effectType = y AND expiresAt > now()`.
3. If found in DB, re-hydrate Redis and return value.
4. If not found anywhere, effect is inactive.

**Effect types that need DB persistence added** (currently Redis-only):
`luck`, `hunt_rare_boost`, `hunt_legendary_boost`, `zoo_boost`, `rob_boost`, `crime_boost`, `cock_defense`, `rob_defense`, `crime_fine_guard`, `study_xp`

**No schema change needed** — `ActiveEffect` model already has the right shape.

---

## 4. Missing Route Fixes

### 4a. Modal Submit — Part Price (from stored parts)

`index.ts` `modalSubmit` handler needs a case for:
```
hunt_part_price:{partKey}:{amount}:{ownerId}
```
Steps:
1. Parse `partKey`, `amount`, `ownerId` from customId.
2. Read submitted price from modal text input.
3. Validate: integer, between 1,000 and 50,000,000. Return validation error if invalid.
4. Call `listPartFromInventory(userId, partKey, parseInt(amount), price)`.
5. Return success container showing listing details.

### 4b. Modal Submit — Part Price (from caught animals)

`index.ts` `modalSubmit` handler needs a case for:
```
hunt_animal_part_price:{animalId}:{partKey}:{ownerId}
```
Steps same as 4a but calls `listSpeciesPartFromAnimals` or `listPartFromInventory` depending on which function the existing `hunt_part_modal:` button uses — match whatever service call is already wired in `huntInteractionHandler`.

### 4c. Craft Button on Hunt Result

The hunt result container (in `hunt.ts`) currently has: sell / market / store / zoo buttons.

Add a `Craft` button (plain text label, no Unicode emoji) that routes to `inv2_hunt_craft:{ownerId}` — the same target inventory already uses. Positioned last in the action row.

---

## 5. Craft Tutorial

**Trigger:** First time user opens `/hunt craft` (or clicks Craft from hunt result) and has zero unlocked recipes.

**Display:** Single informational container prepended to the craft payload:
- Line 1: Hunt animals to discover Common and Uncommon recipes automatically on first catch.
- Line 2: Buy Rare and Legendary Blueprints from the hunt shop to unlock higher-tier recipes.
- Line 3: Each recipe shows the parts and amounts needed — check your part inventory with `/hunt parts`.

**Seen tracking:** Redis key `craft_tutorial_seen:{userId}` — set on first display with no TTL. No DB write (cosmetic state). If Redis misses on restart, tutorial may show once more — acceptable.

---

## 6. Hunt Shop Additions

Add to `HUNT_SHOP_CATALOG` (in `shopCatalog.ts`):
- `rare_blueprint` — 500,000 coins, usable, stackable
- `legendary_blueprint` — 2,000,000 coins, usable, stackable

Both are visible in the hunt shop category and purchasable immediately. Blueprint prices are tunable — these are initial values.

---

## Implementation Order

1. Add `UserCraftUnlock` to `prisma/schema.prisma` → run `prisma generate`
2. Add `unlockCommonRecipesForAnimal()` to `huntCraftService.ts`
3. Call it inside `huntService.hunt()` after successful catch
4. Fix `applyCraftEffect()` to upsert `ActiveEffect` before Redis write
5. Add DB fallback to all effect-read sites
6. Update `buildHuntCraftPayload()` to read unlock set and render locked/unlocked states
7. Add `rare_blueprint` + `legendary_blueprint` to `HUNT_SHOP_CATALOG`
8. Add blueprint effect handlers to `shopItemEffects.ts`
9. Wire modal submit routes in `index.ts` (part price modals)
10. Add Craft button to hunt result in `hunt.ts`
11. Add craft tutorial display logic in `buildHuntCraftPayload()`
