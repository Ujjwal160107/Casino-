# Global Stock Market Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the per-guild stock market to a single global market with a news/event-driven price engine tuned so naive buy-and-hold loses ~60% of the time, while closing the recovery/whale loopholes.

**Architecture:** Extract all price math into a pure, RNG-injectable `stockEngine.ts` (unit-testable without a DB). Keep DB orchestration in `stockService.ts` (now global — no `guildId`). Add `stockConfig.ts` for all tunables (lineup, event pool, slippage, delisting). New `StockEvent` model powers forecasts + the news feed. The scheduler calls one global `marketTick()` instead of a per-guild loop.

**Tech Stack:** TypeScript (CommonJS, ES2020), Prisma v5 + MongoDB, discord.js v14 (Components V2), node-cron, `runWithRetry` for write-conflict safety. No test framework — verification is standalone `npx ts-node` assertion scripts + `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-28-global-stock-market-design.md`

## Global Constraints

- **Global only:** `Stock` has **no `guildId`**; `symbol` is globally unique. One shared market for all guilds.
- **Tick interval:** `TICK_INTERVAL_MS = 30 * 60 * 1000` (30 min). Scheduler runs every 60s but `marketTick()` only does work when a stock's `lastUpdate` is older than the interval.
- **Negative EV:** baseline noise mean is slightly negative; event pool is net-negative. Final numbers tuned by simulation to ~40% win / 60% loss for naive traders.
- **No auto-bounce:** only a hard `max(1, round(price))` clamp. No reflective floor, no spike cap, no guaranteed mean-reversion.
- **Forecast accuracy:** telegraphed events resolve true `FORECAST_HIT_RATE = 0.65`; otherwise FAKEOUT (no effect).
- **Delisting:** below `DELIST_PRICE_RATIO = 0.03` of base for `DELIST_WARN_TICKS = 4` → `DELISTING` (sell-only); for `DELIST_FINAL_TICKS = 8` → `DELISTED` (liquidate holdings at final price, re-IPO a reserve listing).
- **Slippage (execution-time only):** `impact = clamp(SLIPPAGE_K * qty/liquidity, 0, SLIPPAGE_MAX)` with `SLIPPAGE_K = 0.5`, `SLIPPAGE_MAX = 0.40`. Buy fills above price, sell fills below. Stored `currentPrice` is never moved by trades.
- **UI:** Components V2 (`ContainerBuilder`, `TextDisplayBuilder`, `SectionBuilder`, `ButtonBuilder`); Mascot custom emotes; never mix legacy embeds into CV2 messages.
- **Money safety:** validate `qty` (positive integer), block trades on `DELISTED`, sell-only on `DELISTING`, single `Math.round` at execution, all wallet/holding writes via `runWithRetry`.

---

## File Map

| Task | Create | Modify |
|------|--------|--------|
| 1 | — | `prisma/schema.prisma` |
| 2 | `src/config/stockConfig.ts`, `src/scripts/validateStockConfig.ts` | — |
| 3 | `src/services/stockEngine.ts`, `src/scripts/stockEngineTests.ts` | — |
| 4 | — | `src/services/stockService.ts` |
| 5 | — | `src/scheduler.ts` |
| 6 | — | `src/commands/economy/stock.ts` |
| 7 | — | `src/commands/economy/myStocks.ts` |
| 8 | `src/scripts/simulateStockMarket.ts` | `src/scripts/resetStocks.ts` |
| 9 | — | Final QA (typecheck + run all scripts + manual checklist) |

**Unchanged:** `src/commandRouter.ts` (already calls `handleStock(message, args)` / `handleMyStocks(message)` with no guildId), `prisma.ts`, `branding.ts`.

---

### Task 1: Schema migration — global `Stock` + new `StockEvent`

**Files:**
- Modify: `prisma/schema.prisma` (Stock model ~510-525, add StockEvent after it)

**Interfaces:**
- Produces: global `Stock` with fields `symbol @unique`, `previousPrice`, `liquidity`, `status`, `delistWatch`, `trendTicksLeft`, `trendPerTick`; new `StockEvent` model.

- [ ] **Step 1: Replace the `Stock` model**

Replace the existing `model Stock { ... }` block with:

```prisma
model Stock {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  symbol        String   @unique
  name          String
  currentPrice  Float
  previousPrice Float    @default(0)
  basePrice     Float    @default(100)
  volatility    Int      @default(5)
  liquidity     Float    @default(1000)

  status        String   @default("ACTIVE") // ACTIVE | DELISTING | DELISTED
  delistWatch   Int      @default(0)

  trendTicksLeft Int     @default(0)
  trendPerTick   Float   @default(0)

  lastUpdate    DateTime @default(now())
  updatedAt     DateTime @updatedAt

  holdings      StockHolding[]
  events        StockEvent[]
}
```

- [ ] **Step 2: Add the `StockEvent` model**

Add directly below the `Stock` model:

```prisma
model StockEvent {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  stock        Stock    @relation(fields: [stockId], references: [id], onDelete: Cascade)
  stockId      String   @db.ObjectId
  symbol       String

  type          String   // MINOR_DIP | MINOR_GAIN | SLUMP | RALLY | CRASH | BOOM
  direction     String   // UP | DOWN
  magnitudePct  Float    // total move; for SLUMP this is the per-tick move
  durationTicks Int      @default(1) // >1 only for multi-tick events (SLUMP)
  telegraphed   Boolean  @default(false)

  status        String   // FORECAST | RESOLVED | FAKEOUT
  forecastTick  Int
  resolveTick   Int

  createdAt    DateTime @default(now())

  @@index([symbol, status])
  @@index([resolveTick])
}
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: exit code **0**, `Generated Prisma Client` (two generators — bot + dashboard).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors **only** in files that still reference `Stock.guildId` (e.g. `stockService.ts`, `stock.ts`, `myStocks.ts`) — those are fixed in later tasks. No errors elsewhere.

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma
git commit -m "feat(stock): make Stock global and add StockEvent model"
```

---

### Task 2: `stockConfig.ts` — tunables, lineup, event pool

**Files:**
- Create: `src/config/stockConfig.ts`
- Create: `src/scripts/validateStockConfig.ts`

**Interfaces:**
- Produces: `TICK_INTERVAL_MS`, `BASELINE_MIN_PCT`, `BASELINE_MAX_PCT`, `EVENT_BASE_CHANCE`, `FORECAST_HIT_RATE`, `SLIPPAGE_K`, `SLIPPAGE_MAX`, `DELIST_PRICE_RATIO`, `DELIST_WARN_TICKS`, `DELIST_FINAL_TICKS`; types `StockEventType`, `EventDef`, `StockSeed`; data `EVENT_POOL: EventDef[]`, `STARTING_STOCKS: StockSeed[]`, `RESERVE_STOCKS: StockSeed[]`; `validateStockConfig(): string[]`.

- [ ] **Step 1: Create the config file**

```ts
// src/config/stockConfig.ts

export const TICK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Baseline per-tick noise (mean slightly negative = house edge for doing nothing)
export const BASELINE_MIN_PCT = -1.5;
export const BASELINE_MAX_PCT = 1.2;

// Chance per tick a stock starts a new event (scaled up by volatility)
export const EVENT_BASE_CHANCE = 0.3;

// Telegraphed events resolve true this often; otherwise FAKEOUT (no effect)
export const FORECAST_HIT_RATE = 0.65;

// Slippage (execution-time only)
export const SLIPPAGE_K = 0.5;
export const SLIPPAGE_MAX = 0.4;

// Delisting / bankruptcy
export const DELIST_PRICE_RATIO = 0.03;
export const DELIST_WARN_TICKS = 4;
export const DELIST_FINAL_TICKS = 8;

export type StockEventType =
  | "MINOR_DIP"
  | "MINOR_GAIN"
  | "SLUMP"
  | "RALLY"
  | "CRASH"
  | "BOOM";

export interface EventDef {
  type: StockEventType;
  direction: "UP" | "DOWN";
  telegraphed: boolean;
  weight: number;
  minPct: number; // per-tick for multi-tick (SLUMP), total otherwise
  maxPct: number;
  minTicks: number;
  maxTicks: number;
}

export const EVENT_POOL: EventDef[] = [
  { type: "MINOR_DIP",  direction: "DOWN", telegraphed: false, weight: 34, minPct: 3,  maxPct: 8,  minTicks: 1, maxTicks: 1 },
  { type: "MINOR_GAIN", direction: "UP",   telegraphed: false, weight: 30, minPct: 2,  maxPct: 6,  minTicks: 1, maxTicks: 1 },
  { type: "SLUMP",      direction: "DOWN", telegraphed: true,  weight: 14, minPct: 2,  maxPct: 4,  minTicks: 3, maxTicks: 6 },
  { type: "RALLY",      direction: "UP",   telegraphed: true,  weight: 12, minPct: 8,  maxPct: 20, minTicks: 1, maxTicks: 1 },
  { type: "CRASH",      direction: "DOWN", telegraphed: true,  weight: 8,  minPct: 15, maxPct: 35, minTicks: 1, maxTicks: 1 },
  { type: "BOOM",       direction: "UP",   telegraphed: true,  weight: 2,  minPct: 20, maxPct: 45, minTicks: 1, maxTicks: 1 },
];

export interface StockSeed {
  symbol: string;
  name: string;
  basePrice: number;
  volatility: number;
  liquidity: number;
}

export const STARTING_STOCKS: StockSeed[] = [
  { symbol: "FRTN", name: "Fortuna Holdings",     basePrice: 1500, volatility: 3,  liquidity: 5000 },
  { symbol: "VEGA", name: "Vega Resorts Intl.",   basePrice: 600,  volatility: 5,  liquidity: 3000 },
  { symbol: "ACES", name: "Aces High Gaming",     basePrice: 250,  volatility: 8,  liquidity: 1500 },
  { symbol: "LUCK", name: "Lady Luck Lottery Co.", basePrice: 120, volatility: 14, liquidity: 800 },
  { symbol: "CHIP", name: "ChipCoin",             basePrice: 60,   volatility: 20, liquidity: 500 },
  { symbol: "JACK", name: "Jackpot Labs",         basePrice: 40,   volatility: 24, liquidity: 400 },
  { symbol: "BUST", name: "BustBet Inc.",         basePrice: 15,   volatility: 30, liquidity: 200 },
];

export const RESERVE_STOCKS: StockSeed[] = [
  { symbol: "ROLL", name: "RollDice Corp",       basePrice: 80,  volatility: 16, liquidity: 700 },
  { symbol: "HOUS", name: "House Edge Capital",  basePrice: 900, volatility: 4,  liquidity: 4000 },
  { symbol: "WILD", name: "Wildcard Ventures",   basePrice: 30,  volatility: 26, liquidity: 350 },
];

export function validateStockConfig(): string[] {
  const errors: string[] = [];
  const all = [...STARTING_STOCKS, ...RESERVE_STOCKS];
  const seen = new Set<string>();
  for (const s of all) {
    if (seen.has(s.symbol)) errors.push(`Duplicate symbol: ${s.symbol}`);
    seen.add(s.symbol);
    if (s.basePrice < 1) errors.push(`${s.symbol}: basePrice must be >= 1`);
    if (s.volatility < 1) errors.push(`${s.symbol}: volatility must be >= 1`);
    if (s.liquidity < 1) errors.push(`${s.symbol}: liquidity must be >= 1`);
  }
  if (EVENT_POOL.reduce((sum, e) => sum + e.weight, 0) <= 0) {
    errors.push("EVENT_POOL total weight must be > 0");
  }
  for (const e of EVENT_POOL) {
    if (e.minPct > e.maxPct) errors.push(`${e.type}: minPct > maxPct`);
    if (e.minTicks > e.maxTicks) errors.push(`${e.type}: minTicks > maxTicks`);
  }
  if (BASELINE_MIN_PCT > BASELINE_MAX_PCT) errors.push("BASELINE_MIN_PCT > BASELINE_MAX_PCT");
  if (DELIST_WARN_TICKS >= DELIST_FINAL_TICKS) errors.push("DELIST_WARN_TICKS must be < DELIST_FINAL_TICKS");
  return errors;
}
```

- [ ] **Step 2: Create the validation script**

```ts
// src/scripts/validateStockConfig.ts
import { validateStockConfig } from "../config/stockConfig";

const errors = validateStockConfig();
if (errors.length > 0) {
  console.error("Stock config validation FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("Stock config validation passed.");
```

- [ ] **Step 3: Run validation — expect PASS**

Run: `npx ts-node src/scripts/validateStockConfig.ts`
Expected: exit code **0**, `Stock config validation passed.`

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: same residual `guildId` errors as Task 1, none new from these files.

- [ ] **Step 5: Commit**

```powershell
git add src/config/stockConfig.ts src/scripts/validateStockConfig.ts
git commit -m "feat(stock): add stock market config (lineup, event pool, tunables)"
```

---

### Task 3: `stockEngine.ts` — pure price math (TDD)

All functions are pure and take an injectable `Rng` so tests are deterministic. This is the heart of the 40/60 + anti-loophole logic.

**Files:**
- Create: `src/services/stockEngine.ts`
- Create: `src/scripts/stockEngineTests.ts`

**Interfaces:**
- Consumes: everything from `stockConfig.ts`.
- Produces:
  - `type Rng = () => number`
  - `pctInRange(min, max, rng): number`
  - `baselineNoisePct(volatility, rng): number`
  - `pickEvent(volatility, rng): EventDef | null`
  - `rollEventMagnitude(def, volatility, rng): { pct: number; ticks: number }`
  - `resolveForecast(rng): boolean`
  - `applyPct(price, pct): number`
  - `computeImpact(qty, liquidity): number`
  - `computeFill(currentPrice, qty, liquidity, side): { avgPrice: number; total: number; impactPct: number }`
  - `nextDelistWatch(currentPrice, basePrice, watch): number`
  - `delistStatus(watch): "ACTIVE" | "DELISTING" | "DELISTED"`

- [ ] **Step 1: Write the failing test script**

```ts
// src/scripts/stockEngineTests.ts
import {
  pctInRange, baselineNoisePct, pickEvent, rollEventMagnitude, resolveForecast,
  applyPct, computeImpact, computeFill, nextDelistWatch, delistStatus, Rng,
} from "../services/stockEngine";
import { SLIPPAGE_MAX } from "../config/stockConfig";

const errors: string[] = [];
function check(name: string, cond: boolean) {
  if (!cond) errors.push(name);
}
// Deterministic rng that cycles through fixed values
function seq(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

// pctInRange bounds
check("pctInRange low", pctInRange(2, 8, () => 0) === 2);
check("pctInRange high", pctInRange(2, 8, () => 0.999999) > 7.99);

// applyPct floors at 1 and rounds
check("applyPct floor", applyPct(2, -99) === 1);
check("applyPct up", applyPct(100, 10) === 110);

// baseline mean is negative over many samples
let sum = 0;
const rng = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
for (let i = 0; i < 20000; i++) sum += baselineNoisePct(5, rng);
check("baseline mean negative", sum / 20000 < 0);

// pickEvent returns null when roll is above chance
check("pickEvent null", pickEvent(5, () => 0.99) === null);
check("pickEvent picks", pickEvent(30, () => 0.0) !== null);

// rollEventMagnitude sign matches direction
const dip = rollEventMagnitude({ type: "MINOR_DIP", direction: "DOWN", telegraphed: false, weight: 1, minPct: 3, maxPct: 8, minTicks: 1, maxTicks: 1 }, 5, () => 0.5);
check("dip negative", dip.pct < 0 && dip.ticks === 1);
const slump = rollEventMagnitude({ type: "SLUMP", direction: "DOWN", telegraphed: true, weight: 1, minPct: 2, maxPct: 4, minTicks: 3, maxTicks: 6 }, 5, () => 0.5);
check("slump multitick", slump.ticks >= 3 && slump.ticks <= 6 && slump.pct < 0);

// resolveForecast respects hit rate
check("forecast hit", resolveForecast(() => 0.1) === true);
check("forecast miss", resolveForecast(() => 0.9) === false);

// slippage: buy fills above, sell below; cap respected
const buy = computeFill(100, 10, 1000, "BUY");
const sell = computeFill(100, 10, 1000, "SELL");
check("buy above", buy.avgPrice > 100);
check("sell below", sell.avgPrice < 100);
check("impact cap", computeImpact(1e9, 1) === SLIPPAGE_MAX);
check("impact zero small", computeImpact(0, 1000) === 0);

// delisting watch + status
check("watch increments", nextDelistWatch(2, 100, 3) === 4); // 2 < 3% of 100
check("watch resets", nextDelistWatch(50, 100, 3) === 0);
check("status active", delistStatus(0) === "ACTIVE");
check("status delisting", delistStatus(4) === "DELISTING");
check("status delisted", delistStatus(8) === "DELISTED");

if (errors.length > 0) {
  console.error("stockEngine tests FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("stockEngine tests passed.");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ts-node src/scripts/stockEngineTests.ts`
Expected: FAIL — `Cannot find module '../services/stockEngine'`.

- [ ] **Step 3: Implement the engine**

```ts
// src/services/stockEngine.ts
import {
  BASELINE_MIN_PCT, BASELINE_MAX_PCT, EVENT_BASE_CHANCE, EVENT_POOL,
  EventDef, FORECAST_HIT_RATE, SLIPPAGE_K, SLIPPAGE_MAX,
  DELIST_PRICE_RATIO, DELIST_WARN_TICKS, DELIST_FINAL_TICKS,
} from "../config/stockConfig";

export type Rng = () => number;

export function pctInRange(min: number, max: number, rng: Rng): number {
  return min + rng() * (max - min);
}

export function baselineNoisePct(volatility: number, rng: Rng): number {
  const scale = 1 + volatility / 20;
  return pctInRange(BASELINE_MIN_PCT, BASELINE_MAX_PCT, rng) * scale;
}

export function pickEvent(volatility: number, rng: Rng): EventDef | null {
  const chance = Math.min(0.85, EVENT_BASE_CHANCE * (1 + volatility / 25));
  if (rng() >= chance) return null;
  const total = EVENT_POOL.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of EVENT_POOL) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return EVENT_POOL[EVENT_POOL.length - 1];
}

export function rollEventMagnitude(def: EventDef, volatility: number, rng: Rng): { pct: number; ticks: number } {
  const mag = pctInRange(def.minPct, def.maxPct, rng) * (1 + volatility / 30);
  const ticks = def.minTicks === def.maxTicks
    ? def.minTicks
    : Math.floor(pctInRange(def.minTicks, def.maxTicks + 1, rng));
  const signed = def.direction === "DOWN" ? -mag : mag;
  return { pct: signed, ticks };
}

export function resolveForecast(rng: Rng): boolean {
  return rng() < FORECAST_HIT_RATE;
}

export function applyPct(price: number, pct: number): number {
  return Math.max(1, Math.round(price * (1 + pct / 100)));
}

export function computeImpact(qty: number, liquidity: number): number {
  return Math.min(SLIPPAGE_MAX, Math.max(0, SLIPPAGE_K * (qty / liquidity)));
}

export function computeFill(
  currentPrice: number,
  qty: number,
  liquidity: number,
  side: "BUY" | "SELL",
): { avgPrice: number; total: number; impactPct: number } {
  const impact = computeImpact(qty, liquidity);
  const raw = side === "BUY" ? currentPrice * (1 + impact) : currentPrice * (1 - impact);
  const avgPrice = Math.max(1, Math.round(raw));
  return { avgPrice, total: avgPrice * qty, impactPct: impact * 100 };
}

export function nextDelistWatch(currentPrice: number, basePrice: number, watch: number): number {
  return currentPrice < basePrice * DELIST_PRICE_RATIO ? watch + 1 : 0;
}

export function delistStatus(watch: number): "ACTIVE" | "DELISTING" | "DELISTED" {
  if (watch >= DELIST_FINAL_TICKS) return "DELISTED";
  if (watch >= DELIST_WARN_TICKS) return "DELISTING";
  return "ACTIVE";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ts-node src/scripts/stockEngineTests.ts`
Expected: exit code **0**, `stockEngine tests passed.`

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: only residual `guildId` errors from `stockService.ts` / commands (fixed next).

- [ ] **Step 6: Commit**

```powershell
git add src/services/stockEngine.ts src/scripts/stockEngineTests.ts
git commit -m "feat(stock): add pure price engine with unit tests"
```

---

### Task 4: `stockService.ts` — global DB orchestration

Full rewrite of the service: drop `guildId` everywhere, add slippage-aware trades, `marketTick()`, forecasts, delisting/re-IPO, and news queries. Math is delegated to `stockEngine.ts`.

**Files:**
- Modify (replace whole file): `src/services/stockService.ts`

**Interfaces:**
- Consumes: `stockEngine.ts` exports; `stockConfig.ts` (`STARTING_STOCKS`, `RESERVE_STOCKS`, `EVENT_POOL`, `TICK_INTERVAL_MS`); `prisma`, `runWithRetry`.
- Produces (used by Tasks 5-8):
  - `initGlobalMarket(): Promise<void>`
  - `getAllStocks(): Promise<Stock[]>` (excludes DELISTED)
  - `getStock(symbol: string): Promise<Stock | null>`
  - `getPortfolio(discordId: string)` (holdings + stock)
  - `getActiveForecasts(): Promise<StockEvent[]>`
  - `getRecentEvents(limit?: number): Promise<StockEvent[]>`
  - `buyStock(discordId, symbol, quantity): Promise<{ stock; avgPrice; cost; impactPct; newQty }>`
  - `sellStock(discordId, symbol, quantity): Promise<{ stock; avgPrice; value; impactPct; profit; remaining }>`
  - `marketTick(): Promise<void>`
  - `createStock`, `editStock`, `deleteStock`, `getStockById` (global admin helpers)

- [ ] **Step 1: Replace the entire file**

```ts
// src/services/stockService.ts
import prisma, { runWithRetry } from "../utils/prisma";
import {
  STARTING_STOCKS, RESERVE_STOCKS, TICK_INTERVAL_MS,
} from "../config/stockConfig";
import {
  baselineNoisePct, pickEvent, rollEventMagnitude, resolveForecast,
  applyPct, computeFill,
} from "./stockEngine";

type StockRow = Awaited<ReturnType<typeof prisma.stock.findFirst>>;

export function currentTick(): number {
  return Math.floor(Date.now() / TICK_INTERVAL_MS);
}

/** Seed the global market once if empty. */
export async function initGlobalMarket(): Promise<void> {
  const count = await prisma.stock.count();
  if (count > 0) return;
  console.log("Seeding global Stock Market...");
  for (const s of STARTING_STOCKS) {
    await prisma.stock.create({
      data: {
        symbol: s.symbol,
        name: s.name,
        currentPrice: s.basePrice,
        previousPrice: s.basePrice,
        basePrice: s.basePrice,
        volatility: s.volatility,
        liquidity: s.liquidity,
      },
    });
  }
}

export async function getAllStocks() {
  return prisma.stock.findMany({
    where: { status: { not: "DELISTED" } },
    orderBy: { currentPrice: "desc" },
  });
}

export async function getStock(symbol: string) {
  return prisma.stock.findUnique({ where: { symbol: symbol.toUpperCase() } });
}

export async function getStockById(stockId: string) {
  return prisma.stock.findUnique({ where: { id: stockId } });
}

export async function getActiveForecasts() {
  return prisma.stockEvent.findMany({
    where: { status: "FORECAST" },
    orderBy: { resolveTick: "asc" },
  });
}

export async function getRecentEvents(limit = 10) {
  return prisma.stockEvent.findMany({
    where: { status: { in: ["RESOLVED", "FORECAST"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getPortfolio(discordId: string) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return null;
  return prisma.portfolio.findUnique({
    where: { userId: user.discordId },
    include: { holdings: { include: { stock: true } } },
  });
}

export async function buyStock(discordId: string, symbol: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number.");

  const stock = await getStock(symbol);
  if (!stock) throw new Error(`Stock **${symbol.toUpperCase()}** not found.`);
  if (stock.status !== "ACTIVE") throw new Error(`**${stock.symbol}** is being delisted — you can only sell.`);

  const fill = computeFill(stock.currentPrice, quantity, stock.liquidity, "BUY");

  const user = await prisma.user.findUnique({ where: { discordId }, include: { wallet: true } });
  if (!user) throw new Error("User not found. Try chatting first to register.");
  if (!user.wallet || user.wallet.balance < fill.total) throw new Error(`Insufficient funds. Cost (incl. slippage): ${fill.total}`);

  return runWithRetry(async () => {
    let portfolio = await prisma.portfolio.findUnique({ where: { userId: user.discordId } });
    if (!portfolio) portfolio = await prisma.portfolio.create({ data: { userId: user.discordId } });

    await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { decrement: fill.total } } });

    const holding = await prisma.stockHolding.findUnique({
      where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } },
    });

    let newQty: number;
    if (holding) {
      const totalCost = holding.avgBuyPrice * holding.quantity + fill.total;
      newQty = holding.quantity + quantity;
      const newAvg = Math.round(totalCost / newQty);
      await prisma.stockHolding.update({ where: { id: holding.id }, data: { quantity: newQty, avgBuyPrice: newAvg } });
    } else {
      newQty = quantity;
      await prisma.stockHolding.create({
        data: { portfolioId: portfolio.id, stockId: stock.id, quantity, avgBuyPrice: fill.avgPrice },
      });
    }

    return { stock, avgPrice: fill.avgPrice, cost: fill.total, impactPct: fill.impactPct, newQty };
  });
}

export async function sellStock(discordId: string, symbol: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number.");

  const stock = await getStock(symbol);
  if (!stock) throw new Error(`Stock **${symbol.toUpperCase()}** not found.`);

  const user = await prisma.user.findUnique({ where: { discordId }, include: { wallet: true } });
  if (!user || !user.wallet) throw new Error("User not found.");

  const portfolio = await prisma.portfolio.findUnique({ where: { userId: user.discordId } });
  if (!portfolio) throw new Error("You don't own any stocks.");

  const holding = await prisma.stockHolding.findUnique({
    where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } },
  });
  if (!holding || holding.quantity < quantity) throw new Error(`You don't have enough shares (${holding?.quantity || 0}).`);

  const fill = computeFill(stock.currentPrice, quantity, stock.liquidity, "SELL");

  return runWithRetry(async () => {
    await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { increment: fill.total } } });

    if (holding.quantity === quantity) {
      await prisma.stockHolding.delete({ where: { id: holding.id } });
    } else {
      await prisma.stockHolding.update({ where: { id: holding.id }, data: { quantity: { decrement: quantity } } });
    }

    const profit = fill.total - holding.avgBuyPrice * quantity;
    return { stock, avgPrice: fill.avgPrice, value: fill.total, impactPct: fill.impactPct, profit, remaining: holding.quantity - quantity };
  });
}

// --- MARKET TICK ENGINE ---

export async function marketTick(): Promise<void> {
  const cutoff = new Date(Date.now() - TICK_INTERVAL_MS);
  const stocks = await prisma.stock.findMany({
    where: { status: { not: "DELISTED" }, lastUpdate: { lt: cutoff } },
  });
  if (stocks.length === 0) return;

  const tick = currentTick();
  for (const stock of stocks) {
    try {
      await processStockTick(stock as NonNullable<StockRow>, tick);
    } catch (err) {
      console.error(`Stock tick failed for ${stock.symbol}:`, err);
    }
  }
}

async function processStockTick(stock: NonNullable<StockRow>, tick: number): Promise<void> {
  let pendingPct = 0;
  let trendTicksLeft = stock.trendTicksLeft;
  let trendPerTick = stock.trendPerTick;
  let busy = false; // a trend or resolved event already moved the price this tick

  // 1. Continue a running multi-tick trend
  if (trendTicksLeft > 0) {
    pendingPct += trendPerTick;
    trendTicksLeft -= 1;
    if (trendTicksLeft === 0) trendPerTick = 0;
    busy = true;
  }

  // 2. Resolve any forecasts due this tick
  const due = await prisma.stockEvent.findMany({
    where: { stockId: stock.id, status: "FORECAST", resolveTick: { lte: tick } },
  });
  for (const ev of due) {
    const hit = resolveForecast(Math.random);
    await prisma.stockEvent.update({ where: { id: ev.id }, data: { status: hit ? "RESOLVED" : "FAKEOUT" } });
    if (!hit) continue;
    busy = true;
    if (ev.durationTicks > 1) {
      // Multi-tick trend (SLUMP): magnitudePct is per-tick. Apply first tick now.
      trendPerTick = ev.magnitudePct;
      trendTicksLeft = ev.durationTicks - 1;
      pendingPct += ev.magnitudePct;
    } else {
      pendingPct += ev.magnitudePct;
    }
  }

  // 3. If nothing is happening, maybe start a new event
  if (!busy && trendTicksLeft === 0) {
    const def = pickEvent(stock.volatility, Math.random);
    if (def) {
      const mag = rollEventMagnitude(def, stock.volatility, Math.random);
      if (def.telegraphed) {
        // Post a forecast for next tick — do NOT move price now
        await prisma.stockEvent.create({
          data: {
            stockId: stock.id, symbol: stock.symbol, type: def.type, direction: def.direction,
            magnitudePct: mag.pct, durationTicks: mag.ticks, telegraphed: true,
            status: "FORECAST", forecastTick: tick, resolveTick: tick + 1,
          },
        });
      } else {
        // Instant event (MINOR_DIP / MINOR_GAIN): apply now and log as resolved
        pendingPct += mag.pct;
        await prisma.stockEvent.create({
          data: {
            stockId: stock.id, symbol: stock.symbol, type: def.type, direction: def.direction,
            magnitudePct: mag.pct, durationTicks: 1, telegraphed: false,
            status: "RESOLVED", forecastTick: tick, resolveTick: tick,
          },
        });
      }
    }
  }

  // 4. Baseline noise always applies
  pendingPct += baselineNoisePct(stock.volatility, Math.random);

  // 5. Compute new price (hard floor at 1, no auto-bounce)
  const newPrice = applyPct(stock.currentPrice, pendingPct);

  // 6. Delisting watch
  const watch = newPrice < stock.basePrice * 0.03 ? stock.delistWatch + 1 : 0;
  let status: string = "ACTIVE";
  if (watch >= 8) status = "DELISTED";
  else if (watch >= 4) status = "DELISTING";

  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      previousPrice: stock.currentPrice,
      currentPrice: newPrice,
      trendTicksLeft, trendPerTick,
      delistWatch: watch, status,
      lastUpdate: new Date(),
    },
  });

  if (status === "DELISTED") {
    await liquidateAndRelist({ ...stock, currentPrice: newPrice });
  }
}

/** Pay out remaining holders at the crashed price, remove the stock, IPO a replacement. */
async function liquidateAndRelist(stock: NonNullable<StockRow>): Promise<void> {
  const holdings = await prisma.stockHolding.findMany({ where: { stockId: stock.id } });
  for (const h of holdings) {
    const pf = await prisma.portfolio.findUnique({ where: { id: h.portfolioId } });
    if (pf) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: pf.userId } });
      if (wallet) {
        const payout = Math.max(1, Math.round(stock.currentPrice)) * h.quantity;
        await runWithRetry(() => prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: payout } } }));
      }
    }
    await prisma.stockHolding.delete({ where: { id: h.id } });
  }
  await prisma.stockEvent.deleteMany({ where: { stockId: stock.id } });
  await prisma.stock.delete({ where: { id: stock.id } });
  await ipoReplacement();
  console.log(`📉 ${stock.symbol} delisted; replacement IPO'd.`);
}

async function ipoReplacement(): Promise<void> {
  const active = await prisma.stock.findMany({ select: { symbol: true } });
  const activeSymbols = new Set(active.map((s) => s.symbol));
  const seed = RESERVE_STOCKS.find((s) => !activeSymbols.has(s.symbol)) ?? STARTING_STOCKS.find((s) => !activeSymbols.has(s.symbol));
  if (!seed) return; // market already full
  await prisma.stock.create({
    data: {
      symbol: seed.symbol, name: seed.name, currentPrice: seed.basePrice, previousPrice: seed.basePrice,
      basePrice: seed.basePrice, volatility: seed.volatility, liquidity: seed.liquidity,
    },
  });
}

// --- ADMIN MANAGEMENT (global) ---

export async function createStock(symbol: string, name: string, price: number, volatility: number, liquidity = 1000) {
  const exists = await getStock(symbol);
  if (exists) throw new Error(`Stock with symbol ${symbol} already exists.`);
  return prisma.stock.create({
    data: {
      symbol: symbol.toUpperCase(), name, currentPrice: price, previousPrice: price,
      basePrice: price, volatility, liquidity, lastUpdate: new Date(),
    },
  });
}

export async function editStock(stockId: string, data: { currentPrice?: number; volatility?: number; liquidity?: number }) {
  return prisma.stock.update({ where: { id: stockId }, data });
}

export async function deleteStock(stockId: string) {
  await prisma.stockHolding.deleteMany({ where: { stockId } });
  await prisma.stockEvent.deleteMany({ where: { stockId } });
  return prisma.stock.delete({ where: { id: stockId } });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: residual errors now only in `src/commands/economy/stock.ts`, `myStocks.ts` (still pass `guildId`) and `src/scheduler.ts` (imports `updateMarket`). Fixed in Tasks 5-7.

- [ ] **Step 3: Verify exports resolve (smoke import)**

Create no new file; run a one-liner to confirm the module loads without runtime import errors:

Run: `npx ts-node -e "import('./src/services/stockService').then(m => { console.log(Object.keys(m).sort().join(',')); })"`
Expected: prints a list including `buyStock,createStock,currentTick,deleteStock,editStock,getActiveForecasts,getAllStocks,getPortfolio,getRecentEvents,getStock,getStockById,initGlobalMarket,marketTick,sellStock`.

- [ ] **Step 4: Commit**

```powershell
git add src/services/stockService.ts
git commit -m "feat(stock): rewrite service as global market with events, slippage, delisting"
```

---

### Task 5: Scheduler — call global `marketTick` + seed on boot

**Files:**
- Modify: `src/scheduler.ts:6`, `:13`, `:19`

**Interfaces:**
- Consumes: `marketTick`, `initGlobalMarket` from `stockService.ts`.

- [ ] **Step 1: Swap the import**

Replace line 6:

```ts
import { updateMarket } from "./services/stockService";
```

with:

```ts
import { marketTick, initGlobalMarket } from "./services/stockService";
```

- [ ] **Step 2: Update the interval body**

Replace the `setInterval` body (lines 11-17) so it calls `marketTick()`:

```ts
  setInterval(async () => {
    try {
      await marketTick();
    } catch (err) {
      console.error("Failed to update stock market:", err);
    }
  }, 60 * 1000);
```

- [ ] **Step 3: Seed the market once on boot, then run an initial tick**

Replace line 19:

```ts
  updateMarket().catch((err) => console.error("Initial market update failed:", err));
```

with:

```ts
  initGlobalMarket()
    .then(() => marketTick())
    .catch((err) => console.error("Initial market seed/tick failed:", err));
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: residual errors only in `stock.ts` / `myStocks.ts`.

- [ ] **Step 5: Commit**

```powershell
git add src/scheduler.ts
git commit -m "feat(stock): wire scheduler to global marketTick and seed on boot"
```

---

### Task 6: `stock.ts` command — global UI, forecasts, slippage preview, news

Rewrite `handleStock` and its builders to drop `guildId`, surface the **Δ since last tick**, **status badge**, and **active rumor** per stock, show **slippage** on buy/sell, add a `news` subcommand, and block/limit trades by status.

**Files:**
- Modify (replace whole file): `src/commands/economy/stock.ts`

**Interfaces:**
- Consumes: `getAllStocks`, `getPortfolio`, `buyStock`, `sellStock`, `initGlobalMarket`, `getActiveForecasts`, `getRecentEvents` from `stockService.ts`; `fmtCurrency`, `Mascot`, `getGuildPrefix`.

- [ ] **Step 1: Replace the entire file**

```ts
import {
  AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, Message, MessageFlags,
  SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder,
} from "discord.js";
import {
  getAllStocks, getPortfolio, buyStock, sellStock,
  initGlobalMarket, getActiveForecasts, getRecentEvents,
} from "../../services/stockService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";

const STOCK_ACCENT_COLOR = 0x9b59b6;
const STOCK_BANNER_NAME = "stock_market.jpg";
const STOCK_BANNER_URL = `attachment://${STOCK_BANNER_NAME}`;

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function textContainer(title: string, body: string, color = STOCK_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function riskLabel(volatility: number) {
  if (volatility > 24) return `${Mascot.Emotes.Alert} Extreme Risk`;
  if (volatility > 12) return `${Mascot.Emotes.Alert} High Risk`;
  if (volatility > 6) return `${Mascot.Emotes.Graph} Moderate`;
  return `${Mascot.Emotes.Accept} Stable`;
}

function changePct(current: number, previous: number) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function rumorLine(type: string, direction: string) {
  const up = direction === "UP";
  switch (type) {
    case "CRASH": return `${Mascot.Emotes.Alert} Crash rumored`;
    case "SLUMP": return `${Mascot.Emotes.GraphDown} Bearish slump rumored`;
    case "RALLY": return `${Mascot.Emotes.GraphUp} Rally rumored`;
    case "BOOM": return `${Mascot.Emotes.GraphUp} Big breakout rumored`;
    default: return up ? `${Mascot.Emotes.GraphUp} Bullish chatter` : `${Mascot.Emotes.GraphDown} Bearish chatter`;
  }
}

function statusBadge(status: string) {
  if (status === "DELISTING") return `${Mascot.Emotes.Alert} DELISTING — sell only`;
  return "";
}

async function buildMarketContainer(prefix: string) {
  const stocks = await getAllStocks();
  const forecasts = await getActiveForecasts();
  const forecastBySymbol = new Map(forecasts.map((f) => [f.symbol, f]));

  const container = new ContainerBuilder()
    .setAccentColor(STOCK_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.GraphUp} Global Stock Market\n` +
        `> One market, all servers. Prices move on a 30-minute tick.\n` +
        `> Read the rumors, mind the risk — most blind trades lose.`,
      ),
    )
    .addSeparatorComponents(separator());

  stocks.forEach((stock, index) => {
    const pct = changePct(stock.currentPrice, stock.previousPrice);
    const trend = pct >= 0 ? Mascot.Emotes.GraphUp : Mascot.Emotes.GraphDown;
    const pctText = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% this tick`;
    const forecast = forecastBySymbol.get(stock.symbol);
    const badge = statusBadge(stock.status);

    const lines = [
      `**Price:** ${fmtCurrency(stock.currentPrice)} (${pctText})`,
      `**Risk:** ${riskLabel(stock.volatility)}`,
    ];
    if (forecast) lines.push(`**News:** ${rumorLine(forecast.type, forecast.direction)}`);
    if (badge) lines.push(badge);

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${trend} ${stock.symbol} - ${stock.name}`),
          new TextDisplayBuilder().setContent(lines.join("\n")),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`stock_info_${stock.symbol}`)
            .setLabel(stock.symbol)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(trend)
            .setDisabled(true),
        ),
    );
    if (index < stocks.length - 1) container.addSeparatorComponents(separator());
  });

  return container
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(STOCK_BANNER_URL).setDescription("Stock market banner"),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Use \`${prefix}stock buy <symbol> <qty>\`, \`${prefix}stock sell <symbol> <qty>\`, ` +
        `\`${prefix}stock portfolio\`, or \`${prefix}stock news\`.`,
      ),
    );
}

async function buildPortfolioContainer(discordId: string, username: string) {
  const pf = await getPortfolio(discordId);
  if (!pf || pf.holdings.length === 0) {
    return textContainer("Portfolio Empty", "You don't own any stocks.", 0xe74c3c);
  }

  let totalValue = 0;
  let totalCost = 0;

  const container = new ContainerBuilder()
    .setAccentColor(STOCK_ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Graph} Stock Portfolio: ${username}`))
    .addSeparatorComponents(separator());

  pf.holdings.forEach((holding, index) => {
    const value = holding.stock.currentPrice * holding.quantity;
    const cost = holding.avgBuyPrice * holding.quantity;
    totalValue += value;
    totalCost += cost;
    const pnl = value - cost;
    const pnlIcon = pnl >= 0 ? Mascot.Emotes.GraphUp : Mascot.Emotes.GraphDown;
    const pnlText = pnl >= 0 ? `+${fmtCurrency(pnl)}` : `-${fmtCurrency(Math.abs(pnl))}`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${pnlIcon} ${holding.stock.symbol} - ${holding.stock.name}`),
          new TextDisplayBuilder().setContent(
            `**Shares:** ${holding.quantity}\n` +
            `**Current:** ${fmtCurrency(holding.stock.currentPrice)} | **Avg:** ${fmtCurrency(holding.avgBuyPrice)}\n` +
            `**Value:** ${fmtCurrency(value)} (${pnlText})`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`stock_holding_${holding.stock.symbol}`)
            .setLabel(holding.stock.symbol)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(pnlIcon)
            .setDisabled(true),
        ),
    );
    if (index < pf.holdings.length - 1) container.addSeparatorComponents(separator());
  });

  const totalPnl = totalValue - totalCost;
  const totalPnlText = totalPnl >= 0 ? `+${fmtCurrency(totalPnl)}` : `-${fmtCurrency(Math.abs(totalPnl))}`;

  return container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Total Value:** ${fmtCurrency(totalValue)}\n**Total Profit/Loss:** ${totalPnlText}`,
      ),
    );
}

async function buildNewsContainer() {
  const events = await getRecentEvents(12);
  if (events.length === 0) return textContainer("Market News", "No market activity yet. Check back after the next tick.");

  const lines = events.map((e) => {
    const tag = e.status === "FORECAST" ? "🔮 RUMOR" : "📰";
    return `${tag} **${e.symbol}** — ${rumorLine(e.type, e.direction)} (${e.magnitudePct >= 0 ? "+" : ""}${e.magnitudePct.toFixed(1)}%)`;
  });
  return textContainer("Market News & Rumors", lines.join("\n"));
}

export async function handleStock(message: Message, args: string[]) {
  if (!message.guildId) return;
  await initGlobalMarket();

  const sub = args[0]?.toLowerCase();
  const prefix = await getGuildPrefix(message.guildId);

  if (sub === "buy") {
    const symbol = args[1];
    const qty = parseInt(args[2], 10);
    if (!symbol || isNaN(qty)) {
      return message.reply({ components: [textContainer("Stock Purchase", `Usage: \`${prefix}stock buy <symbol> <quantity>\``)], flags: MessageFlags.IsComponentsV2 });
    }
    try {
      const res = await buyStock(message.author.id, symbol, qty);
      return message.reply({
        components: [textContainer("Stock Purchased",
          `Bought **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
          `(slippage ${res.impactPct.toFixed(1)}%).\nTotal **${fmtCurrency(res.cost)}**. You now own **${res.newQty}** shares.`,
          0x2ecc71)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e: any) {
      return message.reply({ components: [textContainer("Purchase Failed", e.message, 0xe74c3c)], flags: MessageFlags.IsComponentsV2 });
    }
  }

  if (sub === "sell") {
    const symbol = args[1];
    const qty = parseInt(args[2], 10);
    if (!symbol || isNaN(qty)) {
      return message.reply({ components: [textContainer("Stock Sale", `Usage: \`${prefix}stock sell <symbol> <quantity>\``)], flags: MessageFlags.IsComponentsV2 });
    }
    try {
      const res = await sellStock(message.author.id, symbol, qty);
      const profitText = res.profit >= 0 ? `+${fmtCurrency(res.profit)}` : `-${fmtCurrency(Math.abs(res.profit))}`;
      return message.reply({
        components: [textContainer("Stock Sold",
          `Sold **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
          `(slippage ${res.impactPct.toFixed(1)}%).\nReceived **${fmtCurrency(res.value)}**. Profit/Loss: **${profitText}**.`,
          0x2ecc71)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e: any) {
      return message.reply({ components: [textContainer("Sale Failed", e.message, 0xe74c3c)], flags: MessageFlags.IsComponentsV2 });
    }
  }

  if (sub === "portfolio" || sub === "port") {
    return message.reply({ components: [await buildPortfolioContainer(message.author.id, message.author.username)], flags: MessageFlags.IsComponentsV2 });
  }

  if (sub === "news") {
    return message.reply({ components: [await buildNewsContainer()], flags: MessageFlags.IsComponentsV2 });
  }

  const file = new AttachmentBuilder("./src/assets/stock_market.jpg", { name: STOCK_BANNER_NAME });
  return message.reply({ components: [await buildMarketContainer(prefix)], files: [file], flags: MessageFlags.IsComponentsV2 });
}
```

- [ ] **Step 2: Verify the emote names exist**

Run: `npx ts-node -e "const {Mascot}=require('./src/config/branding'); console.log(['GraphUp','GraphDown','Graph','Alert','Accept'].map(k=>k+':' + (k in Mascot.Emotes)).join(' '))"`
Expected: every key prints `true`. If any is `false`, substitute the closest existing emote from `branding.ts` (do not invent emote names).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: residual error only in `myStocks.ts`.

- [ ] **Step 4: Commit**

```powershell
git add src/commands/economy/stock.ts
git commit -m "feat(stock): global market UI with forecasts, slippage, news, status badges"
```

---

### Task 7: `myStocks.ts` — drop `guildId`

**Files:**
- Modify: `src/commands/economy/myStocks.ts:10`

**Interfaces:**
- Consumes: `getPortfolio(discordId)` (now single-arg).

- [ ] **Step 1: Update the `getPortfolio` call**

Replace line 10:

```ts
    const pf = await getPortfolio(message.guildId, message.author.id);
```

with:

```ts
    const pf = await getPortfolio(message.author.id);
```

(Keep the `if (!message.guildId) return;` guard above it — it ensures the command runs in a guild.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code **0** — no errors anywhere.

- [ ] **Step 3: Commit**

```powershell
git add src/commands/economy/myStocks.ts
git commit -m "fix(stock): make my-stocks use global portfolio lookup"
```

---

### Task 8: Migration script + balance simulation

Two deliverables: a one-time wipe/reseed migration (extends the existing reset script), and a no-DB simulation that validates the ~40/60 target and serves as the tuning harness.

**Files:**
- Modify (replace whole file): `src/scripts/resetStocks.ts`
- Create: `src/scripts/simulateStockMarket.ts`

**Interfaces:**
- Consumes: `stockEngine.ts` pure functions; `STARTING_STOCKS` from `stockConfig.ts`; `initGlobalMarket` from `stockService.ts`.

- [ ] **Step 1: Replace the migration script**

```ts
// src/scripts/resetStocks.ts
import { PrismaClient } from "@prisma/client";
import { initGlobalMarket } from "../services/stockService";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Wiping stock data for global migration...");
  try {
    await prisma.stockHolding.deleteMany({});
    console.log("✅ Cleared StockHoldings");
    await prisma.stockEvent.deleteMany({});
    console.log("✅ Cleared StockEvents");
    await prisma.stock.deleteMany({});
    console.log("✅ Cleared Stocks");

    await initGlobalMarket();
    const count = await prisma.stock.count();
    console.log(`🚀 Seeded ${count} global stocks. Migration complete.`);
  } catch (e) {
    console.error("Error during stock migration:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
```

- [ ] **Step 2: Create the simulation / tuning script**

```ts
// src/scripts/simulateStockMarket.ts
// No-DB Monte Carlo of the price engine. Validates the ~40/60 target for a
// naive "sell at first profit, else forced exit" trader (the old exploit),
// and compares against an "informed" trader who bails on a forecasted drop.
// Slippage is ignored here (single-share trades); it only worsens naive returns.
import { STARTING_STOCKS, StockSeed } from "../config/stockConfig";
import { baselineNoisePct, pickEvent, rollEventMagnitude, resolveForecast, applyPct } from "../services/stockEngine";

const rng = Math.random;
const TRIALS = 20000;
const HORIZON = 24; // ticks (~12h at 30min)

interface PathPoint { price: number; downForecastNext: boolean; }

function simulatePath(seed: StockSeed, ticks: number): PathPoint[] {
  let price = seed.basePrice;
  let trendLeft = 0;
  let trendPer = 0;
  let forecast: { pct: number; ticks: number; down: boolean } | null = null;
  const path: PathPoint[] = [];

  for (let t = 0; t < ticks; t++) {
    let pending = 0;
    let busy = false;

    if (trendLeft > 0) { pending += trendPer; trendLeft -= 1; busy = true; }

    if (forecast) {
      if (resolveForecast(rng)) {
        if (forecast.ticks > 1) { trendPer = forecast.pct; trendLeft = forecast.ticks - 1; pending += forecast.pct; }
        else pending += forecast.pct;
        busy = true;
      }
      forecast = null;
    }

    if (!busy && trendLeft === 0) {
      const def = pickEvent(seed.volatility, rng);
      if (def) {
        const mag = rollEventMagnitude(def, seed.volatility, rng);
        if (def.telegraphed) forecast = { pct: mag.pct, ticks: mag.ticks, down: def.direction === "DOWN" };
        else pending += mag.pct;
      }
    }

    pending += baselineNoisePct(seed.volatility, rng);
    price = applyPct(price, pending);
    path.push({ price, downForecastNext: !!forecast && forecast.down });
  }
  return path;
}

function run() {
  let naiveLosses = 0;
  let informedLosses = 0;
  let naiveReturn = 0;
  let informedReturn = 0;

  for (let i = 0; i < TRIALS; i++) {
    const seed = STARTING_STOCKS[Math.floor(rng() * STARTING_STOCKS.length)];
    const path = simulatePath(seed, HORIZON);
    const entry = seed.basePrice;

    // Naive: sell at first tick in profit, else forced exit at end.
    let naiveExit = path[path.length - 1].price;
    for (const p of path) { if (p.price > entry) { naiveExit = p.price; break; } }
    if (naiveExit < entry) naiveLosses++;
    naiveReturn += (naiveExit - entry) / entry;

    // Informed: same, but bail immediately if a DOWN event is forecast for next tick.
    let informedExit = path[path.length - 1].price;
    for (const p of path) {
      if (p.price > entry) { informedExit = p.price; break; }
      if (p.downForecastNext) { informedExit = p.price; break; }
    }
    if (informedExit < entry) informedLosses++;
    informedReturn += (informedExit - entry) / entry;
  }

  const naiveLossPct = (naiveLosses / TRIALS) * 100;
  const informedLossPct = (informedLosses / TRIALS) * 100;
  console.log(`Trials: ${TRIALS}, horizon: ${HORIZON} ticks`);
  console.log(`Naive    loss rate: ${naiveLossPct.toFixed(1)}%  | avg return: ${((naiveReturn / TRIALS) * 100).toFixed(2)}%`);
  console.log(`Informed loss rate: ${informedLossPct.toFixed(1)}%  | avg return: ${((informedReturn / TRIALS) * 100).toFixed(2)}%`);

  if (naiveLossPct >= 55 && naiveLossPct <= 68 && informedLossPct < naiveLossPct) {
    console.log("✅ Target met: naive ~60% loss, informed strictly better.");
  } else {
    console.log("⚠️  Off target — tune EVENT_POOL weights / BASELINE mean / FORECAST_HIT_RATE in stockConfig.ts and re-run.");
  }
}

run();
```

- [ ] **Step 3: Run the simulation**

Run: `npx ts-node src/scripts/simulateStockMarket.ts`
Expected: prints naive loss rate in the **55–68%** band and informed loss rate **strictly lower**, ending with `✅ Target met`. If it prints `⚠️ Off target`, adjust `EVENT_POOL` weights / `BASELINE_MIN_PCT`/`MAX_PCT` / `FORECAST_HIT_RATE` in `stockConfig.ts` and re-run until met. (This step is the tuning loop — only commit once `✅ Target met`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit code **0**.

- [ ] **Step 5: Commit**

```powershell
git add src/scripts/resetStocks.ts src/scripts/simulateStockMarket.ts src/config/stockConfig.ts
git commit -m "feat(stock): add global migration script and 40/60 balance simulation"
```

- [ ] **Step 6: Run the live migration (deploy-time, separate from code commit)**

After schema is pushed to the DB, run the migration once to wipe legacy per-guild stocks and seed the global market:

Run: `npx prisma db push`
Then: `npx ts-node src/scripts/resetStocks.ts`
Expected: `🚀 Seeded 7 global stocks. Migration complete.`

---

### Task 9: Final QA — typecheck, scripts, manual checklist

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: exit code **0**, no errors.

- [ ] **Step 2: Run every verification script**

```powershell
npx ts-node src/scripts/validateStockConfig.ts
npx ts-node src/scripts/stockEngineTests.ts
npx ts-node src/scripts/simulateStockMarket.ts
```
Expected: all pass; sim shows `✅ Target met`.

- [ ] **Step 3: Manual smoke test (dev bot)**

With `npm run dev` against a test guild and a seeded DB:
- `!stock` → shows 7 global stocks with price, Δ% this tick, risk, and any active rumor.
- `!stock buy CHIP 5` → confirms avg price + slippage %, deducts wallet, adds holding.
- `!stock buy CHIP 100000` → slippage % visibly higher than the small order (whale penalty).
- `!stock sell CHIP 5` → confirms avg price below market + slippage, credits wallet, reports P/L.
- `!stock portfolio` and `!my-stocks` → both show the holding and P/L (global, same data).
- `!stock news` → lists recent rumors/resolved events (may be empty until a tick passes).
- Buying a `DELISTING` stock is rejected with the sell-only message; selling is allowed.

- [ ] **Step 4: Verify scheduler integration**

Confirm bot boot logs `Seeding global Stock Market...` on a fresh DB and no `updateMarket` reference remains:

Run: `npx ts-node -e "const s=require('./src/services/stockService'); console.log(typeof s.updateMarket==='undefined' ? 'updateMarket removed OK' : 'ERROR: updateMarket still exported')"`
Expected: `updateMarket removed OK`.

- [ ] **Step 5: Final commit (if any QA fixes were made)**

```powershell
git add -A
git commit -m "chore(stock): final QA fixes for global market overhaul"
```

---

## Self-Review

**Spec coverage:**
- §4.1 global `Stock` → Task 1 ✓ · §4.2 `StockEvent` → Task 1 ✓ · §4.4 tick counter → `currentTick()` Task 4 ✓
- §5 price engine (tick cadence, baseline, event pool, forecasts) → Tasks 2-4 ✓
- §6.1 no recovery + negative EV → engine + sim Tasks 3/8 ✓ · §6.2 delisting/re-IPO → Task 4 `liquidateAndRelist`/`ipoReplacement` ✓ · §6.3 slippage → engine `computeFill` Task 3 + applied Task 4 ✓ · §6.4 hardening (qty validation, status gates, rounding, runWithRetry) → Task 4 ✓
- §7 lineup + reserve → Task 2 ✓
- §8 service/scheduler/command changes → Tasks 4-7 ✓
- §9 migration + simulation → Task 8 ✓
- §10 anti-loophole checklist → covered by Tasks 3/4/8 ✓

**Placeholder scan:** No TBD/TODO; all code steps contain full implementations. ✓

**Type consistency:** `computeFill` returns `{ avgPrice, total, impactPct }` — consumed identically in Task 4 buy/sell and surfaced in Task 6 UI. `getPortfolio(discordId)` single-arg — consumed in Tasks 6 & 7. `marketTick`/`initGlobalMarket` exported in Task 4, imported in Task 5. `StockEvent.durationTicks` defined in Task 1, written/read in Task 4. ✓

