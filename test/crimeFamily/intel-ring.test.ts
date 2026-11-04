import { describe, it, expect } from "vitest";
import { ringOrder, buildAnswers, parseAnswers, ringNeighbours, leakAtOf, isDark, briefFor } from "../../src/services/crimeFamily/intelRing";
import { resolveCaperOutcome } from "../../src/services/crimeFamily/caperMath";
import { caperRole, type CaperRoleKey } from "../../src/data/crimeFamilyCatalog";
import { cryptoRng } from "../../src/services/crimeFamily/random";

const T2: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"];
const ids = Object.fromEntries(T2.map((r, i) => [r, `u${i}`])) as Record<CaperRoleKey, string>;
const goEndsAt = new Date("2026-11-04T19:08:00Z");
const leakAt = leakAtOf(goEndsAt);
const opened = new Date("2026-11-04T19:06:30Z");
const seats = (dark: CaperRoleKey[] = []) => T2.map((role) => ({ role, userId: ids[role], briefOpened: !dark.includes(role), briefOpenedAt: opened, choice: -1 }));
const correctLabel = (a: ReturnType<typeof buildAnswers>, r: CaperRoleKey) => a.seats[r]!.options[a.seats[r]!.correct];

describe("intel ring (8.3)", () => {
  it("orders the ring by 8.2 over filled seats only", () => {
    expect(ringOrder(["MUSCLE", "MASTERMIND", "SAFECRACKER", "LOOKOUT"])).toEqual(["MASTERMIND", "LOOKOUT", "SAFECRACKER", "MUSCLE"]);
    expect(ringNeighbours(ringOrder(["MUSCLE", "MASTERMIND", "SAFECRACKER", "LOOKOUT"]), "SAFECRACKER")).toEqual({ prev: "LOOKOUT", next: "MUSCLE" });
    expect(ringNeighbours(T2, "MASTERMIND")).toEqual({ prev: "MUSCLE", next: "LOOKOUT" });
  });

  it("gives each seat 4 distinct labels from its own pool and a correct index in 0..3", () => {
    const a = buildAnswers(T2, cryptoRng);
    expect(a.order).toEqual(T2);
    for (const r of T2) {
      expect(new Set(a.seats[r]!.options).size).toBe(4);
      for (const o of a.seats[r]!.options) expect(caperRole(r).labels).toContain(o);
      expect([0, 1, 2, 3]).toContain(a.seats[r]!.correct);
    }
  });

  it("draws the correct index uniformly (chi-square, 3 dof, p > 0.001)", () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[buildAnswers(["MASTERMIND", "LOOKOUT", "SAFECRACKER"], cryptoRng).seats.LOOKOUT!.correct]++;
    expect(counts.reduce((s, c) => s + (c - 2_500) ** 2 / 2_500, 0)).toBeLessThan(16.27);
  });

  it("4.2: the Muscle tells the Driver the route and hears the door from the Mastermind", () => {
    const a = buildAnswers(T2, cryptoRng);
    const b = briefFor({ caperId: "c", answers: a, role: "MUSCLE", seats: seats(), goEndsAt, now: opened });
    expect(b.tell).toEqual({ userId: ids.DRIVER, label: correctLabel(a, "DRIVER") });
    expect(b.call).toEqual({ question: "Which door is unguarded", options: a.seats.MUSCLE!.options, fromUserId: ids.MASTERMIND });
    expect([b.leaked, b.dark, b.lockedIndex, b.ownerId]).toEqual([null, false, null, ids.MUSCLE]);
  });

  it("isDark: unopened, or opened at or after leakAt", () => {
    expect(isDark({ briefOpened: false, briefOpenedAt: opened }, leakAt)).toBe(true);
    expect(isDark({ briefOpened: true, briefOpenedAt: new Date(+leakAt - 1) }, leakAt)).toBe(false);
    expect(isDark({ briefOpened: true, briefOpenedAt: leakAt }, leakAt)).toBe(true);
  });

  it("leaks a seat's own answer from leakAt, only when its intel holder (next) is dark", () => {
    const a = buildAnswers(T2, cryptoRng);
    const s = seats(["MASTERMIND"]);                      // the Muscle's holder went dark
    expect(briefFor({ caperId: "c", answers: a, role: "MUSCLE", seats: s, goEndsAt, now: new Date(+leakAt - 1) }).leaked).toBeNull();
    expect(briefFor({ caperId: "c", answers: a, role: "MUSCLE", seats: s, goEndsAt, now: leakAt }).leaked).toBe(correctLabel(a, "MUSCLE"));
    expect(briefFor({ caperId: "c", answers: a, role: "DRIVER", seats: s, goEndsAt, now: leakAt }).leaked).toBeNull();
    const darkSelf = briefFor({ caperId: "c", answers: a, role: "MASTERMIND", seats: s, goEndsAt, now: leakAt });
    expect(darkSelf.dark).toBe(true);
  });

  it("an all-dark crew is all misses and Busts", () => {
    expect(resolveCaperOutcome({ n: 5, misses: 5, roll: 0.99, base: 0.15, edge: 0.1, hottestHeat: 0 })).toBe("BUST");
  });

  it("parseAnswers rejects missing or malformed data (edge 63)", () => {
    const a = buildAnswers(T2, cryptoRng);
    expect(parseAnswers(JSON.parse(JSON.stringify(a)))).toEqual(a);
    for (const bad of [null, undefined, {}, { order: [] }, { order: ["MASTERMIND"], seats: {} }, { order: ["MASTERMIND"], seats: { MASTERMIND: { options: ["a", "a", "b", "c"], correct: 0 } } }, { order: ["MASTERMIND"], seats: { MASTERMIND: { options: ["a", "b", "c", "d"], correct: 4 } } }])
      expect(parseAnswers(bad)).toBeNull();
  });
});
