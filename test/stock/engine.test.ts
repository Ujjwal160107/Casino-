import { describe, it, expect } from "vitest";
import { computeFill, nextDelistWatch } from "../../src/services/stockEngine";
import { RESERVE_STOCKS, STARTING_STOCKS } from "../../src/config/stockConfig";

describe("delisting watch", () => {
  // BUST (15) and WILD (30) have a 3% line below the price floor of 1.
  it.each([...STARTING_STOCKS, ...RESERVE_STOCKS].map((s) => [s.symbol, s.basePrice]))(
    "%s counts a price sitting on the floor as distressed",
    (_symbol, basePrice) => {
      expect(nextDelistWatch(1, basePrice as number, 3)).toBe(4);
    },
  );

  it("still resets once the price recovers", () => {
    expect(nextDelistWatch(10, 15, 3)).toBe(0);
  });
});

describe("fill rounding", () => {
  it("charges slippage at a price of 1 instead of rounding it away", () => {
    // 100 shares of BUST-like liquidity (200): 25% impact.
    const buy = computeFill(1, 100, 200, "BUY");
    const sell = computeFill(1, 100, 200, "SELL");
    expect(buy.total).toBe(125);
    expect(sell.total).toBe(75);
  });

  it("rounds the total against the trader", () => {
    // 3 shares at 10 with tiny impact: raw buy ~30.0225, raw sell ~29.9775.
    expect(computeFill(10, 3, 10_000, "BUY").total).toBe(31);
    expect(computeFill(10, 3, 10_000, "SELL").total).toBe(29);
  });

  it("does not let float noise cost a coin on an exact total", () => {
    expect(computeFill(100, 100, 1000, "BUY").total).toBe(10500);
    expect(computeFill(100, 100, 1000, "SELL").total).toBe(9500);
  });
});
