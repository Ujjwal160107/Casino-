import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedRackets, resolveRacketKey } from "../../src/services/crimeFamily/racketService";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

describe("seedRackets (15) and key resolution", () => {
  it("creates the 10 rackets owned by the Street with their class baselines", async () => {
    await seedRackets();
    const rows = await testPrisma.racket.findMany({ orderBy: { incomePerCycle: "asc" } });
    expect(rows).toHaveLength(10);
    expect(rows.reduce((s, r) => s + r.incomePerCycle, 0)).toBe(6_400_000);
    expect(rows.every((r) => r.ownerFamilyId === "" && r.neglectStrikes === 0)).toBe(true);
    expect(rows.find((r) => r.key === "casino_row")).toMatchObject({ class: "CROWN", baseDefense: 80, warDow: 6, warHourUtc: 18 });
  });

  it("a rerun updates the definition but never ownership, timers or strikes (edge 61)", async () => {
    await seedRackets();
    const when = new Date("2026-10-01T00:00:00Z");
    await testPrisma.racket.update({ where: { key: "pawn_row" }, data: { ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2, name: "Old Name" } });
    await Promise.all([seedRackets(), seedRackets()]);
    expect(await testPrisma.racket.count()).toBe(10);
    expect(await testPrisma.racket.findUnique({ where: { key: "pawn_row" } })).toMatchObject({ name: "Pawn Row Fencing", ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2 });
  });

  it.each([["casino_row", "casino_row"], ["CASINO_ROW", "casino_row"], [" 9 ", "casino_row"], ["1", "docks_numbers"], ["10", "city_hall"],
    ["0", null], ["11", null], ["casino", null], ["", null], [undefined, null]] as const)("resolveRacketKey(%s) = %s", (raw, key) => {
    expect(resolveRacketKey(raw as any)?.key ?? null).toBe(key);
  });
});
