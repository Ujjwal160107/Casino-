import { describe, it, expect } from "vitest";
import { resolveRacketKey } from "../../src/services/crimeFamily/racketService";

// The seed cases moved to turf-cities.test.ts (seedTurf, amendment 6.3).
describe("racket key resolution", () => {
  it.each([["casino_row", "casino_row"], ["CASINO_ROW", "casino_row"], [" 9 ", "casino_row"], ["1", "docks_numbers"], ["10", "city_hall"],
    ["0", null], ["11", null], ["casino", null], ["", null], [undefined, null]] as const)("resolveRacketKey(%s) = %s", (raw, key) => {
    expect(resolveRacketKey(raw as any)?.key ?? null).toBe(key);
  });
});
