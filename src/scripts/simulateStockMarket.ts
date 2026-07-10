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
