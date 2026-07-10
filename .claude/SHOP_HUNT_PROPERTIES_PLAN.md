# Fortuna V2 — Shop, Hunt & Properties Implementation Plan

Last saved: 2026-05-15
Status: **Pending implementation**

This document covers: unified shop (40 items, 5 sub-stores), hunt system, zoo properties, and the V2 build-fix work required before these features can be added. Read alongside `FORTUNA_V2_ARCHITECTURE.md` and `FORTUNA_V2_ECONOMY.md`.

---

## Overview

**What this plan implements:**
1. Fix the build (17+ files with V1 compound key leftovers)
2. Schema cleanup (remove guildId from global models, add CaughtAnimal)
3. Global seeding (shop, stocks, properties, degrees at startup)
4. Unified `!shop` — single command with dropdown for 5 sub-stores
5. Hunt system — `!hunt`, `!zoo`, animal catalog, rifle tiers, zoo income
6. V2 UI upgrades for market, stocks, marriage, properties
7. Polish & cleanup

**User decisions:**
- Stocks and properties: **global** (one shared market across all servers)
- Keep: marriage, black market, effects/item buffs, daily quests — all global
- Hunt: hunt → sell/zoo/list parts on black market
- Shop: 40 items across General, Job, Uni, Cock, Hunt sub-stores
- Admin commands: developer-only only

---

## Phase 1 — Fix the Build

**Goal:** `npx tsc --noEmit` → 0 errors. No new features.

### 1A — Core Services

**`src/services/effectService.ts`**
- `getUser(discordId, guildId)` private helper → `getUser(discordId)`, change `where: { discordId_guildId: {...} }` → `where: { discordId }`
- All ~14 internal call sites: drop guildId arg
- `getActiveEffects()`: drop guildId filter (ActiveEffect has no guildId in schema)
- All `prisma.activeEffect.create` data: remove guildId write
- `removeTemporaryRoles()`: store guildId in effect `meta` JSON (`{ roleId, guildId }`) — read via `(effect.meta as any)?.guildId`
- `logEffectAction`: make guildId optional, skip Discord-guild log if absent

**`src/services/shopService.ts`**
- `buyItem()`, `useItem()`: user lookup → `where: { discordId: userId }`
- `getUserInventory()`: lookup user by discordId, filter inventory without guildId
- `getShopItems()`, `getShopItemByName()`, `createShopItem()`, `resetShop()`: remove guildId param
- Remove guildId from all `inventory.create` / `inventory.upsert` data

**`src/services/marketService.ts`**
- Every `discordId_guildId` user lookup → `where: { discordId }`
- `getMarketListings()`: remove guildId filter (market is global)
- `getUserListings()`: remove guildId param and filter
- `buyItemFromMarket()`, `listItemOnMarket()`, `listPropertyOnMarket()`, `cancelListing()`: remove guildId from creates/lookups
- Tax logic: remove `getGuildConfig` call, hardcode 0% market tax

**`src/services/propertyService.ts`**
- `resolveUser()` helper: `discordId_guildId` → `where: { discordId }`
- `getAllProperties()`: remove guildId filter
- `getPropertyByKey()`, `deleteProperty()`, `editProperty()`: `guildId_key` → `where: { key }` (needs Phase 2 schema unique change)
- `createProperty()`: remove guildId from data
- `buyProperty(discordId, guildId, key)` → `buyProperty(discordId, key)`

**`src/services/stockService.ts`**
- `getUserObjectId()` helper: `discordId_guildId` → `where: { discordId }`
- `getStock()`: `guildId_symbol` → `where: { symbol }` (needs Phase 2 schema unique change)
- `getAllStocks()`: remove guildId filter
- `initStocks()`: remove guildId from count/creates
- `updateMarket()`: remove per-guild loop — single global update
- `createStock()`: remove guildId from data

**`src/services/tradeService.ts`**
- Both `tx.user.findUnique` calls: `discordId_guildId` → `where: { discordId: sellerDiscordId }` / `where: { discordId: buyerDiscordId }`
- Remove guildId from `tx.inventory.upsert` create data

**`src/services/life/marriageService.ts`**
- All `prisma.user.findUnique({ where: { discordId_guildId: {...} }})` → `where: { discordId }`
- Drop guildId from all function signatures used for user lookups
- `updateMany` OR filters: filter by discordId only

**`src/services/bankingService.ts`**
- `getFinancialSummary(discordId, guildId)`: mark guildId as `_guildId`, change internal user lookup → `where: { discordId }`

**`src/services/questService.ts`**
- `getDailyQuest(userId, guildId)` → `getDailyQuest(userId)`, same for `generateDailyQuests`
- Remove guildId write from `dailyQuest.create`
- `claimQuestReward()`: remove `getGuildConfig(quest.guildId)` call; use `QUEST_REWARD.money` (50,000) directly

### 1B — Command Files

| File | Fix |
|------|-----|
| `src/commands/economy/credit.ts` | `getFinancialSummary(user.id, guildId!)` → `getFinancialSummary(user.id)` |
| `src/commands/economy/depositBank.ts` | Verify compiles (walletService already ignores `_guildId`) |
| `src/commands/economy/equip.ts` | `discordId_guildId` → `where: { discordId: user.id }`; remove guildId from `shopItem.findFirst` |
| `src/commands/economy/inventory.ts` | `getUserInventory(id, guildId!)` → `getUserInventory(id)` |
| `src/commands/economy/rewards.ts` | Remove guildId from `ensureUserAndWallet` call |
| `src/commands/economy/shop.ts` | `getShopItems(guildId!)` → `getShopItems()`; `getUserInventory(id, guildId!)` → `getUserInventory(id)` |
| `src/commands/games/feed.ts` | `discordId_guildId` → `where: { discordId: user.id }`; remove guildId from `shopItem.findFirst` |
| `src/commands/life/dailyQuest.ts` | `getDailyQuest(userId, guild.id)` → `getDailyQuest(userId)` |
| `src/commands/life/marriage.ts` | All `marriageService.*(... guildId)` → drop guildId; `discordId_guildId` → `where: { discordId }` (10+ sites) |

### 1C — Handlers

**`src/handlers/inventoryInteractionHandler.ts`**
- 3× `discordId_guildId` → `where: { discordId: user.id }`
- Reformat file (currently minified)

**`src/handlers/marketInteractionHandler.ts`**
- Lines 143, 174: `discordId_guildId` → `where: { discordId: user.id }`
- `getUserListings(user.id, guildId)` → `getUserListings(user.id)`
- `getAllProperties(guildId)` → `getAllProperties()`
- `buyProperty(user.id, guildId, key)` → `buyProperty(user.id, key)`

### 1D — Misc

**`src/services/transferService.ts`**
- `upsert({ where: { discordId_guildId: {...} }})` → `where: { discordId: toDiscordId }`; remove guildId from create data

**`src/services/walletService.ts`**
- Remove `_guildId` param from `ensureUserAndWallet`; grep and update all callers

**Checkpoint:** `npx tsc --noEmit` → 0 errors.

---

## Phase 2 — Schema Migration

**Goal:** Remove guildId from all global models, add CaughtAnimal.

### Changes to `prisma/schema.prisma`

| Model | Change |
|-------|--------|
| `Job` | Remove `guildId String` |
| `ShopItem` | Remove `guildId String`; add `key String @unique` |
| `Degree` | Remove `guildId String` |
| `Property` | Remove `guildId String`; `@@unique([guildId, key])` → `@@unique([key])` |
| `Stock` | Remove `guildId String`; `@@unique([guildId, symbol])` → `@@unique([symbol])` |
| `Inventory` | Remove `guildId String?` |
| `User` | Add `caughtAnimals CaughtAnimal[]` relation |

### New Model — `CaughtAnimal`

```prisma
model CaughtAnimal {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  discordId      String
  animalKey      String
  partsAvailable Json
  inZoo          Boolean  @default(false)
  caughtAt       DateTime @default(now())
  user           User     @relation(fields: [discordId], references: [discordId])

  @@index([discordId])
}
```

After edits: `npx prisma generate` (MongoDB — no migration file needed).

**Checkpoint:** `npx prisma validate` + `npx prisma generate` pass. `npx tsc --noEmit` still 0 errors.

---

## Economy Pricing Reference

All prices derived from `FORTUNA_V2_ECONOMY.md` benchmarks.

**Active player baseline: ~350,000/day**
(100K daily + ~150K side income + ~80–150K from 1–2 job shifts)

**Difficulty tiers:**
- Trivial: < 175K (< 0.5 days)
- Low: 175K–700K (0.5–2 days)
- Medium: 1M–3.5M (3–10 days)
- Hard: 7M–21M (20–60 days)
- Endgame: 35M+ (100+ days)

### General Store (12 items) — price = 1.5–3× expected mechanic EV

| # | Item | Price | Tier | Math |
|---|------|-------|------|------|
| 1 | Lucky Coin | 75,000 | Trivial | ~30K game EV × 2.5 |
| 2 | Padlock | 175,000 | Low | Protects avg 125K rob loss × 1.5 |
| 3 | Thieves Gloves | 100,000 | Trivial | +8.4K/attempt × 6 uses × 2 |
| 4 | Mystery Box | 250,000 | Low | EV 172.5K (50%×100K + 20%×500K + 30%×75K) × 1.5 |
| 5 | Bandage | 25,000 | Trivial | 5min lockout saved, convenience floor |
| 6 | Energy Drink | 125,000 | Trivial | ~80K extra shift EV × 1.75 |
| 7 | Counterfeit Kit | 50,000 | Trivial | +18.75K for 1 use × 3 scarcity |
| 8 | Tax Shield | 10,000 | Trivial | ~5K tax save × 2 (floor price) |
| 9 | Loan Forgiveness Note | 200,000 | Low | +50 score unlocks higher card tier; ~100K utility × 2 |
| 10 | Treasure Map | 400,000 | Low | Avg payout 275K × 1.5 gambling premium |
| 11 | Vault Pass | 60,000 | Trivial | ~25–35K daily fee saving × 2 |
| 12 | Double XP Token | 125,000 | Trivial | ~75K opportunity value × 1.75 |

### Job Store (6 items) — equipables at 5% of 500-shift lifetime value

| # | Item | Price | Tier | Math |
|---|------|-------|------|------|
| 13 | Work Boots | 500,000 | Low | 500 shifts × 150K avg × 10% = 7.5M lifetime; 5% = 375K → 500K |
| 14 | Power Briefcase | 400,000 | Low | Delays ~50 Relax × 150K avg = 7.5M saved; 5% |
| 15 | Energy Bar | 500,000 | Low | 1.5× Weekend Getaway (350K) |
| 16 | Promotion Guide | 1,500,000 | Medium | Saves ~3 days grind = 1.05M × 1.5 |
| 17 | Work Gloves | 600,000 | Low | 500 shifts × 15% fail × 150K = 11.25M; 5% = 562K → 600K |
| 18 | Power Nap Pod | 750,000 | Low | Job relief (350K) + edu relief (150K) = 500K × 1.5 |

### Uni Store (5 items)

| # | Item | Price | Tier | Math |
|---|------|-------|------|------|
| 19 | Textbook | 250,000 | Low | Saves 2–3 weeks grind; 10% of ~2.45M opportunity value |
| 20 | Coffee | 100,000 | Trivial | Edu stress −10; ≈ 1 Gym save (75K) × 1.5 |
| 21 | Cheat Sheet | 1,250,000 | Medium | Prevents 650K EV loss (300K tuition + 350K time) × 2 |
| 22 | Scholarship Voucher | 900,000 | Low | Median tuition save ~600K × 1.5 |
| 23 | Focus Crystal | 200,000 | Low | 5 sessions × 5 stress saved ≈ 2.5× Coffee |

### Cock Store (10 items) — geometric 3.5× progression, base 150K

| # | Item | Price | Tier |
|---|------|-------|------|
| 24 | Iron Sword (ATK +5) | 150,000 | Trivial |
| 25 | Gold Sword (ATK +10) | 525,000 | Low |
| 26 | Diamond Sword (ATK +15) | 1,800,000 | Medium |
| 27 | Netherite Sword (ATK +20) | 6,500,000 | Hard |
| 28 | Iron Shield (DEF +5) | 150,000 | Trivial |
| 29 | Gold Shield (DEF +10) | 525,000 | Low |
| 30 | Diamond Shield (DEF +15) | 1,800,000 | Medium |
| 31 | Iron Boots (AGI +5) | 150,000 | Trivial |
| 32 | Gold Boots (AGI +10) | 525,000 | Low |
| 33 | Super Feed (Heal 80HP + ATK +2 next fight) | 200,000 | Low |

### Hunt Store (7 items)

**Rifle income math (sell-all scenario):**
- Wooden (Common only, 1 animal/hunt, 3 hunts/day): EV 206,250/day → price = 12 days = **2,500,000**
- Iron (Common 70%/Uncommon 30%, avg 1.3 animals, 4 hunts/day): EV 835,250/day → price = 12 days = **10,000,000**
- Sniper (Common/Uncommon/Rare 15%, avg 1.85, 6 hunts/day): EV 5.67M/day → design-anchor 3× PhD = **35,000,000**
- Legendary (all rarities, avg 2.35, 12 hunts/day): EV 59.87M/day → design-anchor ≈ World Zoo = **150,000,000**

| # | Item | Price | Tier | Notes |
|---|------|-------|------|-------|
| 34 | Wooden Rifle | 2,500,000 | Medium | 8hr cooldown |
| 35 | Iron Rifle | 10,000,000 | Hard | 6hr cooldown |
| 36 | Sniper Rifle | 35,000,000 | Endgame | 4hr cooldown |
| 37 | Legendary Rifle | 150,000,000 | Endgame | 2hr cooldown |
| 38 | Hunting Permit | 300,000 | Low | 1 extra hunt/day; 1.5× Iron hunt EV (208K) |
| 39 | Camouflage Kit | 1,500,000 | Medium | +25% Rare+ chance; ~980K EV gain on Sniper × 1.5 |
| 40 | Bait Box | 300,000 | Low | Guarantee min 2 animals; avg ~158K EV × 2 |

> **Balance note:** Sniper/Legendary rifles pay off in 6 and 2.5 days respectively if animals are sold immediately. This is intentional (endgame tools are powerful), but monitor. Balance levers: zoo-over-sell preference, daily sell limit for Rare+ if needed.

---

## Animal Catalog

| Rarity | Animal | Sell Value | Zoo/hr | Black Market Parts |
|--------|--------|------------|--------|--------------------|
| Common | Rabbit | 65,000 | 50 | meat, fur |
| Common | Squirrel | 50,000 | 50 | fur |
| Common | Fox | 90,000 | 50 | fur, tail |
| Common | Duck | 70,000 | 50 | feathers, meat |
| Uncommon | Deer | 300,000 | 200 | venison, antlers, hide |
| Uncommon | Boar | 350,000 | 200 | tusk, meat |
| Uncommon | Wolf | 400,000 | 200 | pelt, fang |
| Uncommon | Eagle | 450,000 | 200 | feathers, talons |
| Rare | Black Bear | 1,800,000 | 800 | pelt, claws |
| Rare | Snow Leopard | 3,000,000 | 800 | pelt |
| Rare | Crocodile | 2,400,000 | 800 | hide, teeth |
| Rare | Python | 2,000,000 | 800 | skin |
| Legendary | White Tiger | 12,000,000 | 3,000 | pelt, fangs |
| Legendary | Komodo Dragon | 16,000,000 | 3,000 | scales, venom |
| Legendary | Arctic Wolf | 13,000,000 | 3,000 | fur, fangs |
| Legendary | Golden Eagle | 11,000,000 | 3,000 | feathers, talons |

---

## Properties & Zoo Catalog

*Regular: 5-month break-even (150 days), ~3× income scale per tier*
*Zoo: 6-month full-Rare break-even (180 days); income = per animal rarity/hr*

| Key | Name | Price | Income/hr | Notes |
|-----|------|-------|-----------|-------|
| shack | Shack | 1,800,000 | 500/hr flat | Entry property |
| apartment | Apartment | 5,400,000 | 1,500/hr flat | |
| house | House | 16,000,000 | 4,500/hr flat | |
| mansion | Mansion | 47,000,000 | 13,000/hr flat | |
| island | Private Island | 126,000,000 | 35,000/hr flat | |
| mini_zoo | Mini Zoo | 14,000,000 | per animal | 5 slots; meta: { maxAnimals: 5 } |
| city_zoo | City Zoo | 43,000,000 | per animal | 15 slots |
| safari_park | Safari Park | 86,000,000 | per animal | 30 slots |
| world_zoo | World Zoo | 144,000,000 | per animal | 50 slots |

Zoo animal income rates: Common 50/hr · Uncommon 200/hr · Rare 800/hr · Legendary 3,000/hr

---

## Phase 3 — Global Seeding at Startup

**Goal:** All catalog data seeded once at startup, idempotent on restart.

### Seeding calls in `src/index.ts` `ready` handler:
1. `seedGlobalStocks()` — `src/services/stockService.ts`
2. `seedGlobalProperties()` — `src/services/propertyService.ts` (use property catalog above)
3. `checkAndSeedDegrees()` — `src/services/educationService.ts` (remove guildId param)
4. `seedGlobalShop()` — `src/services/shopService.ts` (upsert by `key` from `shopCatalog.ts`)

**New file:** `src/utils/shopCatalog.ts` — `SHOP_CATALOG: ShopCatalogItem[]` with all 40 items above

**Checkpoint:** Bot starts, all data in DB, no duplicates on restart.

---

## Phase 4 — Unified Shop UI (`!shop`)

**`src/commands/economy/shop.ts`** — full rewrite (Components V2):

- `buildShopContainer(category, items, userId)`: `ContainerBuilder` with:
  - Header `SectionBuilder`: "Fortuna Shop" + subtitle
  - `StringSelectMenuBuilder` (`shop_cat:${userId}`): General · Job Store · Uni Store · Cock Store · Hunt Store
  - `SeparatorBuilder`
  - Each item: `SectionBuilder` (name/price/description) + Buy button accessory (`shop_buy:${item.key}:${userId}`)
- `MessageFlags.IsComponentsV2` on reply
- `StringSelectMenu` collector (2min): rebuild for selected category
- Buy button: calls `buyItem(userId, key)`, replies ephemeral
- Ownership check: only invoker can switch/buy
- Keep backwards compat: `!shop buy <name>` still works

**Checkpoint:** `!shop` → dropdown → switch stores → buy works.

---

## Phase 5 — Hunt System

### New files to create:

**`src/utils/animalCatalog.ts`**
- `ANIMAL_CATALOG: AnimalDefinition[]` — 16 animals (see catalog above)
- `RIFLE_TIERS: Record<string, RifleTierConfig>` with rarity weights + cooldown per tier
- `RARITY_INCOME: Record<AnimalRarity, number>` — zoo income rates per rarity/hr

**`src/services/huntService.ts`**
```typescript
hunt(discordId): Promise<CaughtAnimalResult[]>
sellAnimal(discordId, animalId): Promise<number>         // returns Fortunes earned
sellAnimalPart(discordId, animalId, part): Promise<void> // lists on black market
addAnimalToZoo(discordId, animalId): Promise<void>
removeAnimalFromZoo(discordId, animalId): Promise<void>
getZooAnimals(discordId): Promise<CaughtAnimalWithDef[]>
getInventoryAnimals(discordId): Promise<CaughtAnimalWithDef[]>
```

`hunt()` logic:
1. `ensureUserAndWallet(discordId, ...)` — ensure user exists
2. Find highest-tier rifle in `Inventory` (join ShopItem where category=HUNT, itemType=EQUIPMENT)
3. Check Redis cooldown `hunt:${discordId}` per rifle tier (8/6/4/2hr)
4. Check for Camouflage Kit / Bait Box active effects
5. Roll animals with rifle rarity weights
6. `prisma.caughtAnimal.createMany(...)` for caught animals (partsAvailable = all parts)
7. Set Redis cooldown; return records with animal definitions merged

`addAnimalToZoo()` capacity check:
- Query OwnedProperty + Property where key starts with zoo
- Read `property.meta.maxAnimals`
- Count `CaughtAnimal where discordId AND inZoo: true`
- Reject if at capacity

**`src/commands/games/hunt.ts`**
- Components V2: each caught animal as `SectionBuilder` with rarity badge, sell value
- 3 buttons per animal: Sell (`hunt_sell:${id}:${ownerId}`), Zoo (`hunt_zoo:${id}:${ownerId}`), Parts (`hunt_parts:${id}:${ownerId}`)
- Collector 5min

**`src/commands/games/zoo.ts`**
- Components V2: zoo tier/capacity, animal list with rarity + hourly income, projected total/hr
- Remove button per animal (`zoo_remove:${id}:${ownerId}`)

**`src/handlers/huntInteractionHandler.ts`**
- `hunt_sell:*` → `sellAnimal()` → add to wallet → update message
- `hunt_zoo:*` → `addAnimalToZoo()` → update message
- `hunt_parts:*` → StringSelectMenu for part → modal for price → list on market
- `zoo_remove:*` → `removeAnimalFromZoo()` → update message

**Animal parts on black market:** Seed non-purchasable ShopItem entries per part type (stock=0). When listing a part, add temporary Inventory entry, then list. When sold via existing market flow, inventory entry is removed.

**`src/scheduler.ts`** — add to hourly cron:
```typescript
// Zoo income: group zoo animals by discordId, sum by rarity × RARITY_INCOME, addBalance per user
```

**Router wiring:**
- `src/commandRouter.ts`: add `case "hunt"` and `case "zoo"`
- `src/index.ts` interactionCreate: route `hunt_*` and `zoo_*` to huntInteractionHandler

**Checkpoint:** `!hunt` with rifle works end-to-end. Zoo income accrues on scheduler.

---

## Phase 6 — V2 UI Upgrades

Migrate remaining EmbedBuilder commands to Components V2 (same pattern as `bank.ts`):

| Command | Change |
|---------|--------|
| `src/commands/economy/market.ts` | ContainerBuilder + dropdown (Browse/Sell/My Listings/Trades) |
| `src/commands/economy/myStocks.ts` | ContainerBuilder with portfolio sections |
| `src/commands/economy/stock.ts` | Verify/complete V2 containers |
| `src/commands/economy/properties.ts` | Verify buy/sell flows work post-schema change |
| `src/commands/life/marriage.ts` | ContainerBuilder for proposal/family/joint bank views |

---

## Phase 7 — Polish & Cleanup

- `questService.ts`: `config.questPay ?? 2500` → `QUEST_REWARD.money` (50,000)
- `walletService.ts`: remove `_guildId` param from `ensureUserAndWallet`, update all callers
- `guildConfigService.ts`: keep as compatibility wrapper; remove after all callers use `economyConfig.ts` + `guildSettingsService.ts` directly
- `commandRouter.ts`: convert dynamic `require()` calls to static imports (performance cleanup)

---

## Player Progression Path

| Milestone | ~Days Active | Unlocks |
|-----------|-------------|---------|
| Week 1 (~2.5M) | 7 | Wooden Rifle (2.5M), all trivial/low consumables |
| Month 1 (~10.5M) | 30 | Iron Rifle (10M), BA/BS degrees, Netherite Sword (6.5M) |
| Month 3 (~31.5M) | 90 | Sniper Rifle (35M), first endgame property |
| Month 6 (~63M) | 180 | City Zoo (43M), Mansion (47M) |
| Month 12+ (~126M+) | 360+ | Legendary Rifle (150M), World Zoo (144M), Private Island (126M) |

---

## All Files Changed

### Modified
- `prisma/schema.prisma`
- `src/index.ts`
- `src/scheduler.ts`
- `src/commandRouter.ts`
- `src/services/effectService.ts`
- `src/services/shopService.ts`
- `src/services/marketService.ts`
- `src/services/propertyService.ts`
- `src/services/stockService.ts`
- `src/services/tradeService.ts`
- `src/services/transferService.ts`
- `src/services/walletService.ts`
- `src/services/bankingService.ts`
- `src/services/questService.ts`
- `src/services/educationService.ts`
- `src/services/life/marriageService.ts`
- `src/commands/economy/credit.ts`
- `src/commands/economy/depositBank.ts`
- `src/commands/economy/equip.ts`
- `src/commands/economy/inventory.ts`
- `src/commands/economy/rewards.ts`
- `src/commands/economy/shop.ts`
- `src/commands/economy/market.ts`
- `src/commands/economy/myStocks.ts`
- `src/commands/economy/stock.ts`
- `src/commands/economy/properties.ts`
- `src/commands/games/feed.ts`
- `src/commands/life/dailyQuest.ts`
- `src/commands/life/marriage.ts`
- `src/handlers/inventoryInteractionHandler.ts`
- `src/handlers/marketInteractionHandler.ts`

### Created
- `src/utils/shopCatalog.ts`
- `src/utils/animalCatalog.ts`
- `src/services/huntService.ts`
- `src/commands/games/hunt.ts`
- `src/commands/games/zoo.ts`
- `src/handlers/huntInteractionHandler.ts`

---

## Execution Order

```
Phase 1A (core services) → Phase 1B (commands) → Phase 1C (handlers) → Phase 1D (misc)
  ↓ [tsc --noEmit → 0 errors]
Phase 2 (schema cleanup + CaughtAnimal)
  ↓ [prisma generate]
Phase 3 (global seeding)
  ↓
Phase 4 (unified shop UI)     ← parallel
Phase 5 (hunt system)         ← parallel
Phase 6 (V2 UI upgrades)      ← parallel
  ↓
Phase 7 (polish & cleanup)
```

## Verification Checkpoints

| After Phase | Test |
|-------------|------|
| 1 | `npx tsc --noEmit` → 0 errors |
| 2 | `npx prisma validate` + `npx prisma generate` pass |
| 3 | Bot restarts without duplicate seeding |
| 4 | `!shop` → dropdown → buy works |
| 5 | `!hunt` → sell/zoo/parts all work; `!zoo` shows income; scheduler pays hourly |
| 6 | `!market`, `!stock`, `!my-stocks`, `!marriage`, `!properties` render V2 components |
| 7 | `!quest` rewards 50K; 0 tsc errors remain |
