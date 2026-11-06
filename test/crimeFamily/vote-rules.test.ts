import { describe, it, expect } from "vitest";
import { decideVote, votePassNeed, voteCooldownUntil, voidReasonOf } from "../../src/services/crimeFamily/voteRules";

const T = new Date("2026-11-10T00:00:00Z");
const WEEK = 604_800_000;

describe("vote rules (amendment 4.2)", () => {
  it("needs ceil(2n/3) YES for every n from 3 to 29", () => {
    for (let n = 3; n <= 29; n++) expect(votePassNeed(n)).toBe(Math.ceil((2 * n) / 3));
    expect(votePassNeed(29)).toBe(20);
  });
  it("decides in the documented order", () => {
    expect(decideVote({ eligibleAtClose: 29, yes: 29, heirId: "u", chairMoved: true })).toEqual({ status: "VOID", voidReason: "chair_moved" });
    expect(decideVote({ eligibleAtClose: 2, yes: 2, heirId: "u", chairMoved: false })).toEqual({ status: "VOID", voidReason: "too_few" });
    expect(decideVote({ eligibleAtClose: 29, yes: 19, heirId: "u", chairMoved: false })).toEqual({ status: "FAILED", voidReason: null });
    expect(decideVote({ eligibleAtClose: 29, yes: 20, heirId: null, chairMoved: false })).toEqual({ status: "VOID", voidReason: "no_heir" });
    expect(decideVote({ eligibleAtClose: 29, yes: 20, heirId: "u", chairMoved: false })).toEqual({ status: "PASSED", voidReason: null });
  });
  it("cools down 7 days after FAILED, too_few and no_heir only (A46)", () => {
    expect(+voteCooldownUntil("FAILED", null, T)).toBe(+T + WEEK);
    expect(+voteCooldownUntil("VOID", "too_few", T)).toBe(+T + WEEK);
    expect(+voteCooldownUntil("VOID", "no_heir", T)).toBe(+T + WEEK);
    expect(+voteCooldownUntil("VOID", "chair_moved", T)).toBe(+T);
    expect(+voteCooldownUntil("PASSED", null, T)).toBe(+T);
    expect(voidReasonOf({ status: "VOID", eligibleAtClose: 9, cooldownUntil: T, closedAt: T } as any)).toBe("chair_moved");
  });
});
