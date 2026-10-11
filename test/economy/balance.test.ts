import { describe, it, expect, vi, afterEach } from "vitest";

// The modules under test open Redis/Mongo connections on load; the pure
// helpers checked here need neither.
vi.mock("../../src/utils/prisma", () => ({ default: {} }));
vi.mock("../../src/services/redisService", () => ({ redisService: {} }));

import { PropertyService, rentCyclesDue, MAX_BANKED_RENT_CYCLES } from "../../src/services/propertyService";
import { scholarshipAmount } from "../../src/services/educationService";
import { getSpinResultWithLuck } from "../../src/commands/games/slots";

const HOUR = 3_600_000;

describe("rentCyclesDue", () => {
  const last = new Date("2026-10-01T00:00:00Z");
  const at = (hours: number) => new Date(last.getTime() + hours * HOUR);

  it("pays nothing before a full cycle", () => {
    expect(rentCyclesDue(last, at(23), 24).cycles).toBe(0);
  });

  it("keeps the partial cycle when paying whole ones", () => {
    const due = rentCyclesDue(last, at(50), 24);
    expect(due.cycles).toBe(2);
    expect(due.nextCollected).toEqual(at(48));
  });

  it("banks at most the cap and restarts the clock", () => {
    const due = rentCyclesDue(last, at(24 * 10), 24);
    expect(due.cycles).toBe(MAX_BANKED_RENT_CYCLES);
    expect(due.nextCollected).toEqual(at(24 * 10));
  });
});

describe("property price", () => {
  it("rises 5% per sale but never past 1.5x base", () => {
    expect(PropertyService.calculateDynamicPrice(1_000_000, 4)).toBe(1_200_000);
    expect(PropertyService.calculateDynamicPrice(1_000_000, 50)).toBe(1_500_000);
  });
});

describe("scholarships", () => {
  it("return 1.5x tuition in total across both milestones", () => {
    expect(scholarshipAmount(1_000_000, 1, 75) + scholarshipAmount(1_000_000, 1, 100)).toBe(1_500_000);
  });

  it("pay nothing for an unknown milestone", () => {
    expect(scholarshipAmount(1_000_000, 1, 50)).toBe(0);
  });
});

describe("slots return", () => {
  afterEach(() => vi.restoreAllMocks());

  // Exact expected return: sweep the outcome roll across [0, 1) and feed fixed,
  // distinct values to the reel picks that follow it.
  function expectedReturn(luck: number): number {
    const steps = 20_000;
    let queue: number[] = [];
    vi.spyOn(Math, "random").mockImplementation(() => queue.shift() ?? 0.3);
    let total = 0;
    for (let i = 0; i < steps; i++) {
      queue = [(i + 0.5) / steps, 0.1, 0.5, 0.9];
      const spin = getSpinResultWithLuck(luck);
      total += spin.win ? spin.multiplier : 0;
    }
    return total / steps;
  }

  it("never beats the house, even at max luck", () => {
    expect(expectedReturn(50)).toBeCloseTo(0.96, 2);
    expect(expectedReturn(100)).toBeLessThan(1);
    expect(expectedReturn(0)).toBeGreaterThan(0.9);
  });
});
