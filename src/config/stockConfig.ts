// src/config/stockConfig.ts

export const TICK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Baseline per-tick noise (mean negative = house edge for doing nothing)
export const BASELINE_MIN_PCT = -3.0;
export const BASELINE_MAX_PCT = 0.5;

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
  { type: "MINOR_DIP",  direction: "DOWN", telegraphed: false, weight: 38, minPct: 3,  maxPct: 8,  minTicks: 1, maxTicks: 1 },
  { type: "MINOR_GAIN", direction: "UP",   telegraphed: false, weight: 25, minPct: 2,  maxPct: 6,  minTicks: 1, maxTicks: 1 },
  { type: "SLUMP",      direction: "DOWN", telegraphed: true,  weight: 16, minPct: 2,  maxPct: 4,  minTicks: 3, maxTicks: 6 },
  { type: "RALLY",      direction: "UP",   telegraphed: true,  weight: 10, minPct: 8,  maxPct: 20, minTicks: 1, maxTicks: 1 },
  { type: "CRASH",      direction: "DOWN", telegraphed: true,  weight: 9,  minPct: 15, maxPct: 35, minTicks: 1, maxTicks: 1 },
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
