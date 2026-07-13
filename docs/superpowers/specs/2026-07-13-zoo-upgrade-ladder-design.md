# Zoo Upgrade Ladder — Design

**Date:** 2026-07-13
**Problem:** Players can own multiple zoos at once (Mini + City + World). The
game has no concept of a zoo *upgrade*, so `!myzoo` shows one confusing combined
pool with summed capacity. Intended model: a zoo is a single upgradeable slot.

## Desired behavior

Zoos form a single-slot ladder by capacity: **Mini (5) → City (10) → World (16)**.
A player has at most one zoo. Buying a bigger tier replaces the current one; the
old zoo disappears and all animals carry over. There is **no refund** on upgrade.

Key insight: `CaughtAnimal` rows are scoped to the user (`discordId` +
`inZoo: true`), **not** to a zoo. There is no relation between `CaughtAnimal` and
`OwnedProperty`, so deleting the old zoo's `OwnedProperty` row cannot lose
animals — they simply remain `inZoo: true` and are now housed by the new zoo.
"Transfer" is automatic; the work is enforcing the ladder and fixing capacity.

## Changes

### 1. `PropertyService.buyProperty` — zoo upgrade path
When the purchased `key` is a zoo (`ZOO_KEYS`):
- Load the user's owned zoos. Let `newCap = ZOO_CAPACITY[key]`,
  `bestOwnedCap = max(capacity of owned zoos)`.
- No zoo owned → normal purchase.
- `newCap <= bestOwnedCap` → **block**: "You already own the **<best>**. Zoos
  upgrade — you can only buy a bigger one." (covers same-tier and downgrade.)
- `newCap > bestOwnedCap` → **upgrade**, in one transaction:
  `deleteMany` the user's existing zoo `OwnedProperty` rows, charge **full price**
  (no refund), create the new zoo row, bump `totalSold`/dynamic price. Animals
  untouched. Message: "Upgraded to **<name>**! Your **N** zoo animals came with
  you. Capacity is now **<cap> types**."
Non-zoo properties keep the existing "already own this property" behavior.
This is the single chokepoint for every buy button (`buy_property_*`).

### 2. Capacity: sum → single (`huntService.ts`)
Three sites compute `maxSlots` as the **sum** of owned zoo capacities:
`getZooStatus`, `addAnimalsByKeyToZoo`, `addAnimalToZoo`. Change each to the
**max** of owned zoo capacities (`reduce(Math.max, 0)`). Using `max` (not just
"the one zoo") keeps it correct for legacy multi-owners before the migration runs.

### 3. Active zoo name in `!myzoo`
`getZooStatus` also returns the active (highest-capacity) zoo's name. The header
in `buildZooContainer` reads e.g. "🦁 Your **City Zoo** — 7/10 types". No picker
— there is only one zoo.

### 4. Optional upgrade button (`buildZooContainer`)
If a higher tier than the owned zoo exists, add an "Upgrade to **<next>**
(<price>) →" button with customId `buy_property_<nextKey>`. It reuses the
existing global `buy_property_*` handler (now upgrade-aware), which replies with
an ephemeral confirmation. Consistent with the existing (immediate-charge) buy
buttons on the no-zoo screen.

### 5. One-time migration (`src/scripts/collapseMultiZoos.ts`)
For each user owning more than one zoo: keep the highest-capacity zoo, delete the
smaller zoo `OwnedProperty` rows. **No refund. `CaughtAnimal` rows untouched.**
Run once against prod. (Even unmigrated, capacity=`max` and the combined pool
already make `!myzoo` show the biggest zoo with all animals — the script just
removes the dead lower-tier rows the player no longer "has".)

## Edge cases
- **Over capacity after collapse:** a legacy owner with 20 types under the old
  summed cap of 31 collapses to World's 16. Nothing is deleted — `!myzoo` shows
  "20/16" and `addAnimalsByKeyToZoo` blocks *new* types until they drop under 16.
  Existing animals are grandfathered. (Already the behavior of the capacity gate.)
- **Selling a zoo** via the existing `sellPropertySystem` (75% refund) is
  unchanged and separate from upgrading.
- **Income** is already a single user-scoped stream (`lastZooClaim`); unchanged.

## Out of scope
Per-zoo animal assignment, per-zoo income, and a manage-which-zoo picker — the
upgrade ladder means there is only ever one zoo, so none are needed.
