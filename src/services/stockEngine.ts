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
