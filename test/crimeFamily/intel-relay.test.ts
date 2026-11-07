// test/crimeFamily/intel-relay.test.ts
import { describe, it, expect } from "vitest";
import { buildAnswers, briefFor, leakAtOf } from "../../src/services/crimeFamily/intelRing";
import type { CaperRoleKey } from "../../src/data/crimeFamilyCatalog";
import { cryptoRng } from "../../src/services/crimeFamily/random";

const T2: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"];
const ids = Object.fromEntries(T2.map((r, i) => [r, `u${i}`])) as Record<CaperRoleKey, string>;
const goEndsAt = new Date("2026-11-04T19:08:00Z");
const leakAt = leakAtOf(goEndsAt);
const opened = new Date("2026-11-04T19:06:30Z");
const answers = buildAnswers(T2, cryptoRng);
const label = (r: CaperRoleKey) => answers.seats[r]!.options[answers.seats[r]!.correct];
const seats = (o: { shared?: CaperRoleKey[]; unopened?: CaperRoleKey[]; lateOpen?: CaperRoleKey[] } = {}) => T2.map((role) => ({
  role, userId: ids[role], choice: -1,
  briefOpened: !o.unopened?.includes(role), briefOpenedAt: o.lateOpen?.includes(role) ? leakAt : opened,
  sharedIntel: !!o.shared?.includes(role),
}));
const brief = (role: CaperRoleKey, s = seats(), now = opened) => briefFor({ caperId: "c", answers, role, seats: s, goEndsAt, now });

describe("intel relay (amendment 5.3)", () => {
  it("the Muscle's share shows the Driver's own answer in the Driver's brief and nowhere else", () => {
    const s = seats({ shared: ["MUSCLE"] });
    expect(brief("DRIVER", s).relayed).toBe(label("DRIVER"));
    for (const r of ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "MUSCLE"] as const) expect(brief(r, s).relayed).toBeNull();
    expect(brief("MUSCLE", s)).toMatchObject({ shared: true, canShare: false, tell: { userId: ids.DRIVER, label: label("DRIVER") } });
  });

  it("the Mastermind's share reaches the last seat of the ring", () => {
    expect(brief("MUSCLE", seats({ shared: ["MASTERMIND"] })).relayed).toBe(label("MUSCLE"));
  });

  it("canShare needs an opened brief that is not dark, no earlier share and time left", () => {
    expect(brief("LOOKOUT").canShare).toBe(true);
    expect(brief("LOOKOUT", seats(), leakAt).canShare).toBe(true);                     // opened before the leak: never dark
    expect(brief("LOOKOUT", seats({ unopened: ["LOOKOUT"] })).canShare).toBe(false);
    expect(brief("LOOKOUT", seats({ lateOpen: ["LOOKOUT"] }), leakAt)).toMatchObject({ dark: true, canShare: false });
    expect(brief("LOOKOUT", seats(), goEndsAt).canShare).toBe(false);
    expect(brief("LOOKOUT", seats({ shared: ["LOOKOUT"] }))).toMatchObject({ canShare: false, shared: true });
  });

  it("a dark holder still leaks at GO−30 s and relays nothing; a holder that shared is never dark, so relayed and leaked never both hold", () => {
    expect(brief("DRIVER", seats({ unopened: ["MUSCLE"] }), leakAt)).toMatchObject({ leaked: label("DRIVER"), relayed: null });
    expect(brief("DRIVER", seats({ unopened: ["MUSCLE"] }), opened).leaked).toBeNull();
    expect(brief("DRIVER", seats({ shared: ["MUSCLE"] }), leakAt)).toMatchObject({ leaked: null, relayed: label("DRIVER") });
  });
});
