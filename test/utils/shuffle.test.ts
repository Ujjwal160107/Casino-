import { describe, it, expect } from "vitest";
import { shuffle } from "../../src/utils/shuffle";

describe("shuffle", () => {
  it("returns a permutation and leaves the input untouched", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });

  it("puts each element first about equally often", () => {
    // Six players, as in a full Russian Roulette lobby. Uniform: 1/6 each
    // (≈ 3333 of 20000, sd ≈ 53). A random-comparator sort skews this heavily.
    const runs = 20_000;
    const firsts = new Array(6).fill(0);
    for (let i = 0; i < runs; i++) firsts[shuffle([0, 1, 2, 3, 4, 5])[0]]++;
    for (const n of firsts) {
      expect(n).toBeGreaterThan(3_000);
      expect(n).toBeLessThan(3_700);
    }
  });
});
