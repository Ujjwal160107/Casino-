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
// qty=100, liquidity=1000 => 5% impact, large enough to survive rounding
const buy = computeFill(100, 100, 1000, "BUY");
const sell = computeFill(100, 100, 1000, "SELL");
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
