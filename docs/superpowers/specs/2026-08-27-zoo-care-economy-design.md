# Zoo Care Economy — Design

Date: 2026-08-27
Status: Approved, ready for planning
Supersedes the income and capacity halves of `2026-07-13-zoo-upgrade-ladder-design.md` (the single-slot upgrade ladder itself stays).

## 1. The problem

Zoo capacity counts **species types**, not animals. `ZOO_CAPACITY` is `{ mini: 5, city: 10, world: 16 }` types, and `addAnimalsByKeyToZoo` moves *every* non-zoo unit of a species into the zoo in one call. Once a species holds a slot, every extra copy is free income.

Income is `RARITY_INCOME[rarity] × headcount × hours`, capped at 24h and claimable every hour. A Legendary pays 25,000/hr — **600,000/day per animal**. Ten copies of each Legendary species is 24M/day before buffs. Daily is 100k and a top job shift is ~450k, so the zoo is not a side activity, it is the printer.

Hunt feeds the printer: a Legendary Rifle rolls 2–4 rarities and `RARITY_QUANTITIES` grants 3–6 Commons *per roll*, so one hunt can produce ~20 animals.

### Other holes found in the current code

1. **Sell the zoo, keep the money.** Selling a zoo does not evict animals and `claimZooIncome` never checks that you own one.
2. **Two claim paths, two rules.** `!zoo` Collect uses hourly accrual; `propertyService.collectIncome` uses a 24h zoo cooldown. Both advance the same `lastZooClaim`, but players take whichever is juicier.
3. **Unhoused animals are uncapped.** Stockpile in inventory, then dump a whole species into the zoo in one click.
4. **Rifle upgrade clears the hunt cooldown** — a free extra hunt on every upgrade. Kept deliberately; it is one-time per tier.
5. **Golden Eagle Crown** (`zoo_boost`, +10% for 7 days) multiplies an unbounded base.
6. **Parts market as the next printer.** Legendary parts run 300k–380k. If zoo income drops and hunt volume stays, parts become the farm.
7. **Remove then re-add.** `!zoo remove` returns a whole species to inventory, which would let players dodge upkeep and re-house before claim.

## 2. Goals

- The zoo pays well but only if the player shows up daily.
- Hoarding animals is impossible, not merely expensive.
- One claim path, one window, one set of rules.
- Every zoo tier is worth buying.
- No midnight wipe of existing players' collections.

**Non-goals:** reworking the parts market or P2P listings, changing crafting, DM warnings before an animal dies.

## 3. Capacity

The zoo stays a single-slot upgrade ladder: Mini → City → World, biggest owned wins, no refund on upgrade.

Three limits apply together — **type cap**, **rarity mix**, **per-species stack**.

**Stack per species** (copies of the same animal): Common **4**, Uncommon **3**, Rare **3**, Legendary **1**.

**Types and mix:**

| Zoo | Type cap | Common | Uncommon | Rare | Legendary | Max headcount |
|---|---|---|---|---|---|---|
| Mini | 5 | 3 | 2 | 0 | 0 | 18 |
| City | 10 | 4 | 4 | 2 | 0 | 34 |
| World | 12 | 4 | 4 | 3 | 1 | 38 |

Only a **World Zoo can house a Legendary**. That rule is the main reason to make the last upgrade, and it holds regardless of how the arithmetic moves later.

There are exactly 4 species per rarity in `ANIMAL_CATALOG`, so a World Zoo covers every Common and Uncommon species, 3 of 4 Rares, and 1 of 4 Legendaries.

No separate flat headcount cap — mix × stack *is* the cap.

**Housing an animal fails** if it would break the type cap, the rarity mix, the stack for that species, or if the player owns no zoo. **Selling** a zoo evicts every housed animal to inventory (hunger state travels with them), where they die on the normal clock. **Upgrading** keeps them — capacity only ever grows, so nothing is evicted. Claiming requires owning a zoo.

**Inventory has no size cap.** It does not need one — unhoused animals cannot be fed and die in three days.

## 4. Income and the daily claim

Income becomes **per animal, per daily claim**. No hourly accrual, no "hours pending", no stacking two days of rent.

| Rarity | Old | New per animal per claim |
|---|---|---|
| Common | 500/hr → 12k/day | **4,000** |
| Uncommon | 2,000/hr → 48k/day | **16,000** |
| Rare | 8,000/hr → 192k/day | **60,000** |
| Legendary | 25,000/hr → 600k/day | **200,000** |

Only **fed** and **housed** animals pay. Hungry animals are skipped and earn 0.

`!zoo` Collect and `!collect-rent` share **one** 24h window on `User.lastZooClaim`, using the existing `conditionalClaim` + `userDateUnchanged` CAS in both paths. Golden Eagle Crown stays +10% for 7 days, applied to the daily total.

## 5. Feed, hunger, and death

### Feed items

Four Hunt Store items, one per rarity. Price of one unit = one animal-day.

| Item | Key | Price | Feeds |
|---|---|---|---|
| Feed Sack | `common_feed` | 1,500 | any Common |
| Game Feed | `uncommon_feed` | 6,000 | any Uncommon |
| Prime Cuts | `rare_feed` | 22,000 | any Rare |
| Exotic Ration | `legendary_feed` | 75,000 | any Legendary |

`consumable: true, usable: false` — they do nothing through `!use` and are spent only by `!zoo feed`, which keeps them out of the buff use-cooldown system.

**Shop-only. No crafting feed from meat** — letting hunts pay for the zoo would reopen the loop.

### State

One nullable field: `CaughtAnimal.fedUntil: DateTime?`.

- A catch is created with `fedUntil = now + 24h` — one free fed day.
- Feeding sets `fedUntil = now + 24h`.
- `fedUntil == null` (rows from any path that forgets to set it) is read as `caughtAt + 24h`, never as "starving since the epoch".

Everything else is derived on read:

| Condition | State | Behaviour |
|---|---|---|
| `now <= fedUntil` | fed | earns |
| `fedUntil < now <= fedUntil + 72h` | hungry | earns 0 |
| `now > fedUntil + 72h` | dead | row deleted, no parts, no sell value |

No cron and no scheduler. The clock is a timestamp, so bot downtime cannot skip a tick or double-count one. Dead rows are purged on the next zoo or inventory read and reported to the player.

Three missed days is the grace window: an animal fed on day 0 goes hungry on day 1 and dies on day 4.

### Feeding

`!zoo feed <species>` spends **1 feed of that rarity per hungry animal** of that species. Four hungry rabbits cost four Feed Sacks. Already-fed animals are skipped and cost nothing, so feeding twice in a day cannot waste food.

A **Feed All** button on `!zoo` does the same across every hungry housed animal for exactly the same total cost. If the player cannot cover the whole bill it feeds what it can, cheapest rarity first, and names what is still starving.

**Only housed animals can be fed.** Inventory animals carry a `fedUntil` and rot on the same clock — sell them, part them out, or house them within three days. This is what makes hoarding impossible rather than expensive, and it means hunt loot is perishable: a player with no zoo must convert catches to money or lose them.

The `!zoo` view gains a per-species state marker: fed, or hungry with `dies in 41h`.

## 6. Hunt volume

Every rarity roll grants **exactly one animal**. `RARITY_QUANTITIES` is deleted. `RIFLE_TIERS.minAnimals/maxAnimals` become `minRolls/maxRolls`.

| Rifle | Cooldown | Rolls | Common | Uncommon | Rare | Legendary |
|---|---|---|---|---|---|---|
| Wooden | 8h | 1 | 100% | — | — | — |
| Iron | 6h | 1 | 70% | 30% | — | — |
| Sniper | 4h | 1–2 | 55% | 32% | 13% | — |
| Legendary | 2h | 1–2 | 55% | 32% | 11% | 2% |

Iron stays at 1 roll so the Sniper's second roll is the upgrade. The Legendary Rifle is the only gun that can roll a Legendary.

### Buffs

Hard ceilings after all buffs: **Legendary ≤ 5%**, **Rare ≤ 20%** (currently 20% and 40%).

| Buff | Was | Now |
|---|---|---|
| Camouflage Kit | +10% Rare, +5% Legendary | +8% Rare, +2% Legendary |
| Hunter's Compass (risky) | +8% Rare, +4% Legendary | +6% Rare, +1% Legendary |
| Hunter's Compass (safe) | +15% Uncommon | unchanged |
| Komodo Scale Rifle Kit | +7% Legendary | +2% Legendary |
| Eagle Talon Gloves | +8% Rare | +6% Rare |
| Bait Box | at least 2 animals | at least 2 **rolls** |
| Echo Whistle | 35% chance of an extra animal of a random species of your best rarity | 35% chance of an extra animal of **the same species** as your best catch |

Echo Whistle's change closes "echo a Legendary into a different Legendary". Bait Box keeps its existing `max(2, rolls)` behaviour, which now means a second roll rather than a second crate; its shop description needs updating.

A top-rifle day is at most 12 hunts × 2 rolls = **24 catches**, not crates of livestock. Expected Legendaries per day, unbuffed: 12 × 1.5 × 2% ≈ **0.36**.

## 7. Repricing the ladder

At the new rates a full legal zoo earns:

| Zoo | Animals | Gross/day | Feed/day | Net/day |
|---|---|---|---|---|
| Mini | 18 | 144,000 | 54,000 | **90,000** |
| City | 34 | 616,000 | 228,000 | **388,000** |
| World | 38 | 996,000 | 369,000 | **627,000** |

At the current prices (1.8M / 15M / 75M) the World Zoo costs 60M more than the City and earns 239k/day more — a 251-day payback. Nobody would buy it. The old prices were set when copies were unlimited and any zoo printed unbounded money.

New prices, with payback measured against the net gain over the previous tier (zoos replace with no refund, so the full price is the cost):

| Zoo | Old price | New price | Net gain over previous tier | Payback |
|---|---|---|---|---|
| Mini | 1,800,000 | **800,000** | 90,000/day | ~9 days |
| City | 15,000,000 | **5,000,000** | 298,000/day | ~17 days |
| World | 75,000,000 | **18,000,000** | 239,000/day | ~75 days |

World stays a long-term prestige buy, which is right for the endgame tier, and it is the only place a Legendary earns anything at all. A housed Legendary nets 125,000/day after feed, so it repays its own ~900k sell value in about a week and keeps paying.

Existing owners are not charged the difference and not refunded it.

## 8. Migration — starve-out, enforced lazily

No deploy-time cull and no wipe.

**Backfill** (`src/scripts/zooCareMigration.ts`, run at release like `collapseMultiZoos.ts`) does two things:

1. Set `fedUntil = deployTime + 24h` on every `CaughtAnimal` where it is null. Everyone starts with one fed day.
2. Recompute the live zoo prices. `seedGlobalProperties` only writes `basePrice` in its `update` branch, and `buyProperty` charges the stored `Property.price`, so a catalog price change alone would never reach existing rows. The script sets `price = calculateDynamicPrice(basePrice, totalSold)` for the three zoo keys.

**Legal-set enforcement** runs on every zoo read and before every claim, as a pure function:

```
resolveLegalHousing(housedAnimals, zooKey) -> { keep: id[], evict: id[] }
```

1. Group housed animals by species. Sort each group by `caughtAt` ascending. Keep the first `stack[rarity]`, evict the rest.
2. Within each rarity, order the surviving species by their earliest `caughtAt`. Keep the first `mix[rarity]` species, evict every animal of the rest.

`caughtAt` is the tiebreaker because there is no `housedAt` column and adding one buys nothing — oldest-caught is deterministic, stable across reads, and reads as "your first animals keep their place".

Evicted animals get `inZoo: false` and keep their `fedUntil`. They cannot be fed, so they die within three days unless the player sells them or breaks them into parts. Same rules for everyone, no special case, and the player gets a real chance to cash the overflow out.

The same function is what makes the housing rules enforceable in one place instead of duplicated across add, claim, and render.

## 9. Code changes

### Module boundaries

`huntService.ts` is 600+ lines carrying hunt rolls, zoo housing, income claiming, and parts. The zoo half moves to a new **`src/services/zooService.ts`**: housing rules, hunger math, feeding, the daily claim. `huntService` keeps hunting and parts. Both are then one-sentence modules, and the zoo's own tests stop dragging the hunt surface in with them.

### Per file

| File | Change |
|---|---|
| `prisma/schema.prisma` | `CaughtAnimal.fedUntil DateTime?` |
| `src/utils/animalCatalog.ts` | delete `RARITY_QUANTITIES`; `RARITY_INCOME` becomes per-animal-per-day; `RIFLE_TIERS` rolls and weights; `ZOO_CAPACITY` becomes `{ types, mix, stack }`; new `FEED_DEFS` and `RARITY_FEED_COST`; zoo prices in `ZOO_PROPERTY_DEFS` |
| `src/services/zooService.ts` (new) | `resolveLegalHousing`, `getZooStatus`, `houseAnimals`, `feedSpecies`, `feedAll`, `claimZooIncome`, `purgeDead` |
| `src/services/huntService.ts` | one animal per roll; new buff caps; Echo Whistle same-species; zoo functions removed |
| `src/services/propertyService.ts` | zoo branch of `collectIncome` uses the shared fed-only daily rule; `sellPropertySystem` evicts housed animals (the upgrade path keeps them, as it does today) |
| `src/utils/shopCatalog.ts` | four feed items; Bait Box description |
| `src/commands/games/zoo.ts` | daily view instead of hourly; fed/hungry markers; Feed All button; `!zoo feed <species>` |
| `src/scripts/zooCareMigration.ts` (new) | one-time `fedUntil` backfill + zoo price recompute |

### Constraints to respect

- **ComponentsV2 caps at 40 components.** `zoo.ts` already limits detailed slots to `MAX_DETAILED_ZOO_SLOTS = 6` for this reason, and `index.ts` swallows 50035, so an oversized payload fails silently. Feed All is **one** button, not one per species; hunger markers go in existing text, not new components.
- **The claim CAS must keep matching an absent field.** `userDateUnchanged("lastZooClaim", …)` handles Prisma/Mongo's null-vs-missing gap; a plain `{ lastZooClaim: null }` filter permanently blocks first-ever claims.
- **Identity is `discordId`, never `discordId_guildId`.**

## 10. Testing

Unit (`vitest`, no DB):

- `resolveLegalHousing` — over-stack, over-mix, Legendary in a City Zoo, a legal zoo that must evict nothing, empty zoo.
- Hunger state at each boundary: exactly `fedUntil`, one second past, exactly `fedUntil + 72h`, one second past, `fedUntil == null`.
- Feed cost: only hungry animals billed; partial-affordability order is cheapest rarity first.
- Roll weights sum to 1 per rifle; buff stacking never exceeds 5% Legendary or 20% Rare.
- Daily income per tier matches the section 7 table.

Integration (`test/`, mongodb-memory-server):

- `test/anticheat/zoo.race.test.ts` already covers the claim CAS, including the absent-field regression. It exercises `conditionalClaim` directly rather than `claimZooIncome`, so widening the window to 24h does not touch it — keep it as is.
- Concurrent `!zoo` Collect and `!collect-rent` still pay exactly once.
- Claiming with no zoo owned fails.
- A dead animal is purged and never pays.

## 11. Risks

- **Perishable loot is a real difficulty spike.** A player with no zoo loses every catch after three days. That is the intent, but early-game hunting becomes "sell or part out promptly", and the tutorial and hunt copy need to say so.
- **Feed is a wallet drain before it is a wallet filler.** A player who buys a Mini Zoo at 800k and then cannot afford 54k/day of feed will lose animals. The `!zoo` view should show the daily feed bill next to the daily income.
- **Parts become the best passive income for hoarders** once zoo income is capped. Out of scope here; worth watching after deploy.
- **Existing whales lose most of a collection over three days.** Starve-out is deliberate and gives them a window to sell, but it will generate complaints. A pinned announcement before deploy is cheaper than the support load after it.
