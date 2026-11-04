import { describe, it, expect } from "vitest";
import { pickHeir } from "../../src/services/crimeFamily/chairService";

const now = new Date("2026-11-04T00:00:00Z");
const m = (userId: string, role: string, joinedDaysAgo: number, activeDaysAgo: number, capers = 0) =>
  ({ userId, role, joinedAt: new Date(+now - joinedDaysAgo * 864e5), lastActiveAt: new Date(+now - activeDaysAgo * 864e5), capers }) as any;

describe("pickHeir (6.7)", () => {
  it("prefers the Underboss, then the earliest Capo, then the Soldier with most capers", () => {
    expect(pickHeir([m("b", "BOSS", 90, 20), m("u", "UNDERBOSS", 10, 1), m("c", "CAPO", 50, 1)], now)!.userId).toBe("u");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("c1", "CAPO", 20, 1), m("c2", "CAPO", 40, 1)], now)!.userId).toBe("c2");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("s1", "SOLDIER", 40, 1, 3), m("s2", "SOLDIER", 10, 1, 9)], now)!.userId).toBe("s2");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("s1", "SOLDIER", 40, 1, 5), m("s2", "SOLDIER", 10, 1, 5)], now)!.userId).toBe("s1");
  });
  it("skips heirs inactive for more than 7 days; nobody → null", () => {
    expect(pickHeir([m("b", "BOSS", 90, 20), m("u", "UNDERBOSS", 10, 8), m("c", "CAPO", 50, 2)], now)!.userId).toBe("c");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("u", "UNDERBOSS", 10, 8)], now)).toBeNull();
  });
});
