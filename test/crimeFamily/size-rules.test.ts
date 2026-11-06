import { describe, it, expect } from "vitest";
import { heistCapFor, capoCapFor, investigationThresholdFor, joinsPerFamilyFor } from "../../src/services/crimeFamily/sizeRules";

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("size rules (amendment 2.2, 3.2)", () => {
  it("heist cap: 4 up to 12 members, then ceil(n / 3)", () => {
    expect(range(1, 30).map(heistCapFor)).toEqual(range(1, 30).map((n) => Math.max(4, Math.ceil(n / 3))));
    expect([12, 13, 15, 16, 25, 30].map(heistCapFor)).toEqual([4, 5, 5, 6, 9, 10]);
  });
  it("capo cap: max(1, floor(n / 5))", () => {
    expect([1, 9, 10, 14, 15, 19, 20, 24, 25, 29, 30].map(capoCapFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  });
  it("investigation threshold: max(3, ceil(n / 4)); 8 at 30", () => {
    expect([1, 12, 13, 16, 17, 29, 30].map(investigationThresholdFor)).toEqual([3, 3, 4, 4, 5, 8, 8]);
  });
  it("joins per 7 days by level: 5 5 5 6 6 7 8 9 10 10", () => {
    expect(range(1, 10).map(joinsPerFamilyFor)).toEqual([5, 5, 5, 6, 6, 7, 8, 9, 10, 10]);
  });
});
