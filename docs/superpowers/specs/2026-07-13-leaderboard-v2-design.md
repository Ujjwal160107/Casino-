# Leaderboard V2 (True Net Worth + Dropdowns) — Design Spec

Date: 2026-07-13
Status: Approved by Ujjwal

## Goal

Rebuild `!leaderboard` as a Components V2 page with two dropdowns — board type (Net Worth · Cash · Bank · Shifts) and scope (Global · This Server) — where Net Worth is a player's TRUE net worth (wallet, bank, investments, stocks, properties, animals, items) plus their passive income per day.

## New service: `src/services/netWorthService.ts`

```ts
export interface NetWorthBreakdown {
  wallet: number;
  bank: number;
  investments: number;   // ACTIVE FD/RD principal (Investment.amount)
  stocks: number;        // Σ holding.quantity × current Stock price
  properties: number;    // Σ OwnedProperty → property.price
  animals: number;       // Σ per CaughtAnimal: animal def sellValue (animalCatalog; every def has one)
  items: number;         // Σ Inventory.amount × ShopItem.price
  passiveIncomePerDay: number; // Σ property incomePerCycle×(24/incomeCycleHours) + Σ animal def zooIncomePerHour×24 for animals with inZoo=true
  total: number;         // sum of the seven value fields (passive income is NOT part of total — it's a rate, not an asset)
}

export async function getNetWorth(discordId: string): Promise<NetWorthBreakdown>;      // Redis-cached
export async function getNetWorthMany(discordIds: string[]): Promise<Map<string, NetWorthBreakdown>>;
```

- Redis cache: key `networth:<discordId>`, TTL **600s** (aligns with the existing hot-path caching layer). `getNetWorthMany` fetches cached entries first, computes misses in chunks of 10 via `Promise.all`.
- Compute reads: Wallet, Bank, Investment(status ACTIVE), Portfolio→StockHolding→Stock.price, OwnedProperty→Property, CaughtAnimal, Inventory→ShopItem. All by `discordId`; every lookup already exists as a relation.
- Failure of any sub-lookup → that component counts 0 and is logged; never throws to the caller.

## Reworked `src/commands/economy/leaderboard.ts`

- **Types:** `net` (breakdown.total), `cash` (wallet), `bank` (bank + investments), `shifts` (lifetime `shiftsWorked`). The old `employees` naming/arg maps to `shifts`.
- **Scope:** `global` (all players, default) | `server` (players intersected with the current guild's member list via `message.guild.members.fetch()`; member IDs cached in-memory for the collector's lifetime).
- **UI (one container page):** header (title + emote thumbnail + subtitle naming the active scope) → separator → top-10 rows → separator → "-# your rank" footer → two `StringSelectMenu` rows: type select and scope select. Owner-locked, 120s collector, selects disabled on expiry (existing pattern).
  - Net rows: `{rank} **{name}** — {total} · ⚡{passive}/day`; other boards keep `— {value}` (`{n} shifts` for shifts).
  - Your-rank footer on Net additionally shows the viewer's breakdown one-liner: `wallet W · bank B · stocks S · property P · items I · animals A`.
- **Args preserved:** `!lb cash|bank|net|shifts|work` preselects a type (`work`/`employees` → shifts); `!lb-wallet` → cash. Aliases unchanged.
- **Interaction routing:** stays collector-based inside the command (as today) — no index.ts routing changes needed. The old button handler code is fully replaced by select handling.

## Performance

Leaderboards read `getNetWorthMany` only for the NET board's candidate set; cash/bank/shifts sort on directly-fetched scalar fields as today. With the 10-minute cache, a busy LB costs ~zero recomputes; a cold global NET board computes each player once. Current player counts make this trivial; the chunked compute keeps it safe as it grows.

## Docs

- Site `dashboard/src/content/commands.ts` leaderboard entry: new usage (`!leaderboard [net|cash|bank|shifts]`), dropdown/scopes described, keyNumbers for the four boards.
- `dashboard/src/content/modules/economy.ts` leaderboard mention updated: net worth counts everything you own (and shows passive income/day), plus bank/cash/shifts boards and global↔server scopes.

## Out of scope

Pagination beyond top 10; scheduled net-worth precompute (cache-on-read is enough); chicken/cosmetics valuation (not priced assets today); persisting LB snapshots.

## Verification

`npx tsc --noEmit` clean; site builds. Live smoke: `!lb` shows NET global; switch each type and scope via dropdowns; `!lb bank` preselects; your-rank breakdown line shows; second open within 10 min serves cached values (log line).
