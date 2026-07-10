# Global Stock Market Overhaul — Design Spec

**Date:** 2026-06-28
**Status:** Approved for planning
**Command:** `!stock` (prefix-aware), `!my-stocks`

---

## 1. Summary

Migrate the stock market from a **per-guild** system to a **single global market** shared by every server, and replace the exploitable price engine with a **news/event-driven engine** that is net-negative for naive traders.

Today, the entire economy (`User`, `Wallet`, `Bank`, `Portfolio`, `StockHolding`) is already **global per user** — only `Stock` is scoped by `guildId`. This overhaul removes that last per-guild seam so stocks align with the rest of the economy, and rebuilds the price logic so that a **random buy-and-hold trader loses ~60% of the time** while a player who **reads forecasts and times trades** can flip the odds in their favor.

The current "buy huge, wait, sell only winners" loophole is closed by three mechanics: **no guaranteed price recovery + net-negative event EV**, **delisting/bankruptcy of cratered stocks** (forces loss realization), and **large-order slippage** (punishes whales).

---

## 2. Goals

| Goal | Detail |
|------|--------|
| Global market | One shared set of stocks; no `guildId` on `Stock` |
| Skill over luck | Forecasts/rumors let attentive players gain a real edge |
| ~40/60 outcomes | Naive random trading loses ~60% of the time (net-negative event EV) |
| No loopholes | Close the "wait for recovery, sell only winners, buy huge" exploit |
| Casino theme | ~7 Fortuna-flavored stocks across risk tiers |
| Minimal schema churn | Reuse the already-global `Portfolio`/`StockHolding`/`Wallet` |

## Non-goals (v1)

- Brokerage fee / bid-ask spread (deselected; slippage covers whale abuse)
- Capital-gains tax on sells (deselected)
- Sectors / correlation groups, dividends
- Per-guild markets or per-guild overrides
- Limit orders, short selling, options
- Dashboard UI for stocks (bot-only for v1)
- Persistent market impact (slippage is execution-time only — see §6)

---

## 3. Architecture Overview

```
Scheduler (every market tick, e.g. 30 min)
  → marketTick()
      • advance global tick counter
      • resolve due forecasts (≈65% hit, ≈35% fake-out)
      • roll new events / continue multi-tick events per stock
      • apply baseline noise (slightly negative mean)
      • update currentPrice / previousPrice
      • run delisting watch (crater → DELISTING → DELISTED → re-IPO)
      • post forecasts for next tick (telegraph)

Commands
  !stock                → global market view (price, Δ% since last tick, risk, status, active rumor)
  !stock buy/sell <sym> <qty> → slippage-aware execution
  !stock portfolio / !my-stocks → holdings + unrealized P/L
  !stock news           → recent + rumored events feed
```

All stock state lives in three models: `Stock` (one row per listing), `StockEvent` (forecasts + history for the news feed), and the existing `Portfolio`/`StockHolding`.

---

## 4. Data Model Changes

### 4.1 `Stock` (modified)

Remove per-guild scoping, add engine fields.

```prisma
model Stock {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  symbol        String   @unique          // was @@unique([guildId, symbol])
  name          String
  currentPrice  Float
  previousPrice Float    @default(0)       // for Δ since last tick
  basePrice     Float    @default(100)     // reference for delist threshold / re-IPO
  volatility    Int      @default(5)       // risk tier: drives event freq + magnitude
  liquidity     Float    @default(1000)    // higher = less slippage (blue-chip high, meme low)

  status        String   @default("ACTIVE") // ACTIVE | DELISTING | DELISTED
  delistWatch   Int      @default(0)        // consecutive ticks below delist threshold

  trendTicksLeft Int     @default(0)        // multi-tick event remaining ticks
  trendPerTick   Float   @default(0)        // % applied each remaining trend tick

  lastUpdate    DateTime @default(now())
  updatedAt     DateTime @updatedAt

  holdings      StockHolding[]
  events        StockEvent[]
}
```

`guildId` field and the `@@unique([guildId, symbol])` index are **removed**.

### 4.2 `StockEvent` (new)

Drives the forecast/telegraph layer and powers `!stock news`.

```prisma
model StockEvent {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  stock        Stock    @relation(fields: [stockId], references: [id], onDelete: Cascade)
  stockId      String   @db.ObjectId
  symbol       String

  type         String   // MINOR_DIP | CRASH | SLUMP | MINOR_GAIN | RALLY | BOOM
  direction    String   // UP | DOWN
  magnitudePct Float     // total % move (or per-tick for multi-tick)
  telegraphed  Boolean  @default(false)

  status       String   // FORECAST | RESOLVED | FAKEOUT
  forecastTick Int       // tick the rumor was posted
  resolveTick  Int       // tick it resolves/applies

  createdAt    DateTime @default(now())

  @@index([symbol, status])
  @@index([resolveTick])
}
```

### 4.3 Unchanged

`Portfolio` (`userId @unique`), `StockHolding`, `Wallet`, `User` — all already global, no changes.

### 4.4 Global tick counter

Ticks are derived from wall-clock time to survive restarts:
`currentTick = floor(Date.now() / TICK_INTERVAL_MS)`. No extra model needed.

---

## 5. Price Engine

### 5.1 Tick cadence

- `TICK_INTERVAL` = **30 min** (configurable constant). Forecasts are posted **one tick (30 min) before** they resolve.
- Scheduler currently fires `updateMarket()` every 60s; it will call `marketTick()` which **no-ops unless a new tick boundary has been crossed**, so we keep the cheap 60s loop but only do real work on tick rollover.

### 5.2 Per-tick price update (per stock)

```
newPrice = currentPrice
         × (1 + baselineNoise())        // mean slightly negative
         × (1 + activeEventEffect())     // event or continuing trend
clamp: newPrice = max(1, round(newPrice))
previousPrice = currentPrice (pre-update)
```

- **baselineNoise():** uniform in `[-1.5%, +1.2%]` → mean ≈ **-0.15%/tick** (mild bleed; the house edge for doing nothing). Wider band for higher-`volatility` tiers.
- **activeEventEffect():** if a multi-tick trend is running, apply `trendPerTick` and decrement `trendTicksLeft`; otherwise apply any event resolving this tick.
- **No auto-bounce:** the old `basePrice * 0.15` reflective floor and `* 5` spike cap are **removed**. Only a hard `max(1, …)` clamp remains. Recovery is never guaranteed.

### 5.3 Event pool (net-negative EV)

Per tick, each `ACTIVE` stock has a roll (≈35% for moderate tiers, higher for volatile) to start an event. Weighted so expected value is negative:

| Event | Dir | Magnitude | Telegraphed | Weight (relative) |
|-------|-----|-----------|-------------|-------------------|
| MINOR_DIP | DOWN | 3–8% | no | high |
| MINOR_GAIN | UP | 2–6% | no | high |
| SLUMP | DOWN | 2–4%/tick × 3–6 ticks | yes | medium |
| RALLY | UP | 8–20% | yes | medium-low |
| CRASH | DOWN | 15–35% | yes | low |
| BOOM | UP | 20–45% | yes | rare |

Weights and magnitudes scale with the stock's `volatility` tier (meme stocks: bigger, more frequent swings both ways but still net-negative). **Exact numbers are tuned by simulation (§9) to hit the ~40/60 target.**

### 5.4 Forecasts / rumors (the skill layer)

- Telegraphed events (SLUMP/RALLY/CRASH/BOOM) post a `StockEvent` with `status=FORECAST` **one tick before** they apply, surfaced in the market UI and `!stock news` (e.g. "⚠️ Crash rumored for CHIP", "📈 Analysts bullish on VEGA").
- On resolve, each forecast independently **hits ~65% of the time** and **fake-outs ~35%** (`status=FAKEOUT` → event does not apply, or applies a mild opposite nudge). This keeps prediction profitable but **never riskless** — no guaranteed loop.

---

## 6. Anti-Exploit Mechanics

### 6.1 No guaranteed recovery + negative EV (closes "wait until green")
Because event EV is net-negative and there is no auto-bounce, a crashed/underwater position may **never** return to the buy price. The "hold and wait" half of the old exploit is no longer a free win.

### 6.2 Delisting / bankruptcy (closes "only sell winners, hold losers forever")
Refusing to realize losers is defeated by forcing realization:

- **Watch:** if `currentPrice < basePrice × 0.03` (3%), increment `delistWatch`; otherwise reset to 0.
- **DELISTING:** at `delistWatch ≥ 4` ticks (≈2h), set `status=DELISTING` and surface a clear warning in the market UI + DM-free in-channel notice on the market view ("BUST is being delisted — liquidate now").
- **DELISTED:** at `delistWatch ≥ 8` ticks (≈4h), set `status=DELISTED`: all holdings are **liquidated at the final crashed price** (pennies) into holders' wallets, `StockHolding` rows removed, stock dropped from the active list.
- **Re-IPO:** to keep ~7 active listings, a delisted slot is replaced — the same company re-IPOs at a fresh `basePrice` after a cooldown (or a reserve-pool symbol is activated). Old holders are **not** made whole.

Net effect: the cash recovered from lucky winners is less than the cash destroyed in delisted losers (negative EV), so "only sell winners" still loses on the portfolio.

### 6.3 Large-order slippage (closes "buy enormous amount")
Execution price worsens with order size relative to the stock's `liquidity` (execution-time only; the stored `currentPrice` is **not** permanently moved, to avoid self-pump manipulation against other players):

```
impact = clamp( k × (qty / liquidity), 0, 0.40 )   // k ≈ 0.5, cap 40%
buy:  avgFillPrice  = currentPrice × (1 + impact)
sell: avgFillPrice  = currentPrice × (1 − impact)
```

- Blue-chips have high `liquidity` (low slippage); meme stocks low `liquidity` (savage slippage).
- Whales pay up to buy and receive less to dump; splitting orders across ticks is the skillful counter (and exposes them to events in between).
- Buy/sell confirmation UI shows the **effective average price and total slippage** before committing.

### 6.4 Misc hardening
- Reject `qty <= 0`, non-integer, or `NaN`.
- Block trading on `DELISTED` stocks; allow only **sells** on `DELISTING` stocks.
- Consistent rounding (`Math.round`) applied once at execution to avoid sub-unit rounding farms.
- All wallet/holding writes wrapped in `runWithRetry` for Mongo write-conflict safety.

---

## 7. Stock Lineup (global seed)

~7 Fortuna-themed listings across risk tiers (`volatility` = risk knob; `liquidity` = slippage knob):

| Symbol | Name | Tier | basePrice | volatility | liquidity | Vibe |
|--------|------|------|-----------|------------|-----------|------|
| FRTN | Fortuna Holdings | Blue-chip | 1500 | 3 | 5000 | "the house always wins" |
| VEGA | Vega Resorts Intl. | Stable-moderate | 600 | 5 | 3000 | resort operator |
| ACES | Aces High Gaming | Moderate | 250 | 8 | 1500 | game studio |
| LUCK | Lady Luck Lottery Co. | Swingy | 120 | 14 | 800 | feast-or-famine |
| CHIP | ChipCoin | High risk | 60 | 20 | 500 | crypto |
| JACK | Jackpot Labs | High risk | 40 | 24 | 400 | speculative |
| BUST | BustBet Inc. | Extreme | 15 | 30 | 200 | meme — the name warns you |

Reserve pool (for re-IPO after delisting): e.g. `ROLL` (RollDice Corp), `HOUS` (House Edge Capital), `WILD` (Wildcard Ventures). Numbers above are starting proposals; finalized during tuning.

---

## 8. Service & Command Changes

### 8.1 `stockService.ts`
- Remove `guildId` from `initStocks`, `getStock`, `getAllStocks`, `buyStock`, `sellStock`, admin helpers.
- `initGlobalMarket()` seeds the lineup once if empty.
- Replace `updateMarket()` (per-guild `groupBy` loop) with `marketTick()`: single global pass implementing §5–§6.
- New: `getActiveForecasts()`, `getRecentEvents(limit)`, `computeFill(stock, qty, side)` (slippage), `runDelistChecks()`.
- `buyStock`/`sellStock` use `computeFill` for effective price and return slippage detail for the UI.

### 8.2 Scheduler (`scheduler.ts`)
- Keep 60s interval but call `marketTick()`, which only does work on tick-boundary crossing. Single global call (no per-guild iteration).

### 8.3 Commands (`stock.ts`, `myStocks.ts`)
- Market view: per stock show price, **Δ% since last tick** (▲▼), risk label, **status badge** (Active/⚠️ Delisting), and **active rumor** line when a forecast exists.
- New `!stock news` subcommand: recent resolved events + current rumors.
- Buy/sell confirmation surfaces **effective avg price + slippage**.
- `DELISTING` stocks: sell-only, with prominent warning. `DELISTED`: hidden from buy list.
- Remove `guildId` arguments throughout; commands still gate on `message.guildId` only to ensure they run in a guild context.

---

## 9. Migration & Tuning

### 9.1 Data migration
Extend `resetStocks.ts` into a one-time migration: wipe all `StockHolding`, `StockEvent`, and `Stock` rows, then `initGlobalMarket()` seeds the global lineup on next boot. `Portfolio` rows are kept (they simply have no holdings). Run via `prisma db push` for schema, then the script.

### 9.2 Balance simulation (validates the 40/60 target)
A standalone sim script runs the engine over many simulated ticks/traders:
- **Naive strategy** (random buy, hold N ticks, sell): target **~60% of runs end in loss**.
- **Informed strategy** (acts on forecasts, avoids delisting, splits large orders): should be **net positive but not guaranteed** (fake-outs bite).
Event weights, baseline mean, and slippage `k` are tuned until both targets hold before shipping.

---

## 10. Anti-Loophole Checklist (summary)

| Old exploit | Defense |
|-------------|---------|
| Wait for guaranteed recovery, sell when green | No auto-bounce + net-negative event EV (§5, §6.1) |
| Only sell winners, hold losers as paper losses | Delisting forcibly realizes losses (§6.2) |
| Buy enormous size, dump at peak | Large-order slippage on both sides (§6.3) |
| Perfectly predict telegraphed events | Forecasts ~65% accurate + fake-outs (§5.4) |
| Sub-unit rounding / negative qty farms | Validation + single consistent rounding (§6.4) |
| Concurrency double-spend | `runWithRetry` on wallet/holding writes (§6.4) |

---

## 11. Open Parameters (finalized in tuning)

- Exact event weights & magnitude bands per tier
- Baseline noise mean/band
- Slippage `k` and per-stock `liquidity` values
- Delist threshold %, grace ticks, re-IPO cooldown
- Forecast hit rate (start 65%)
- `TICK_INTERVAL` (start 30 min)
