import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import * as M from "../../src/services/crimeFamily/warMath";
import { RACKETS, racketDef } from "../../src/data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG, isTurfOpen } from "../../src/utils/economyConfig";
import { withCfConfig } from "../helpers";

const at = (s: string) => new Date(s);
const S = (atk: [number, number, number], def: [number, number, number]): M.BlockScores =>
  ({ docks: { atk: atk[0], def: def[0] }, main: { atk: atk[1], def: def[1] }, alleys: { atk: atk[2], def: def[2] } });

describe("war math (9.1, 9.4, 15)", () => {
  it("nextWarStart is the next weekly UTC instant, strictly after now", () => {
    const now = at("2026-11-04T10:00:00Z"); // a Wednesday
    expect(Object.fromEntries(RACKETS.map((r) => [r.key, M.nextWarStart(r, now).toISOString()]))).toEqual({
      docks_numbers: "2026-11-09T18:00:00.000Z", laundromat_front: "2026-11-10T12:00:00.000Z", harbor_customs: "2026-11-10T18:00:00.000Z",
      neon_strip: "2026-11-11T01:00:00.000Z", valet_racket: "2026-11-04T18:00:00.000Z", pawn_row: "2026-11-05T01:00:00.000Z",
      union_kickbacks: "2026-11-05T18:00:00.000Z", racetrack_book: "2026-11-06T12:00:00.000Z", casino_row: "2026-11-07T18:00:00.000Z",
      city_hall: "2026-11-08T12:00:00.000Z",
    });
    expect(M.nextWarStart(racketDef("valet_racket")!, at("2026-11-04T18:00:00Z")).toISOString()).toBe("2026-11-11T18:00:00.000Z");
  });

  it("isoWeekKey follows ISO-8601, including the year boundary", () => {
    expect(M.isoWeekKey(at("2026-11-04T18:00:00Z"))).toBe("2026-W45");
    expect(M.isoWeekKey(at("2026-11-08T12:00:00Z"))).toBe("2026-W45"); // Sunday closes the ISO week
    expect(M.isoWeekKey(at("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(M.isoWeekKey(at("2027-01-04T18:00:00Z"))).toBe("2027-W01");
  });

  it("warWindow opens 72 h before, closes 1 h before and lasts 60 minutes", () => {
    expect(M.warWindow(at("2026-11-04T18:00:00Z"))).toEqual({
      periodKey: "2026-W45", bidOpensAt: at("2026-11-01T18:00:00Z"), bidClosesAt: at("2026-11-04T17:00:00Z"),
      startsAt: at("2026-11-04T18:00:00Z"), endsAt: at("2026-11-04T19:00:00Z"),
    });
  });

  it("bidPhase is upcoming, open, then closed with next week's opening for the last hour", () => {
    const s = at("2026-11-04T18:00:00Z");
    expect([at("2026-11-01T17:59:59Z"), at("2026-11-01T18:00:00Z"), at("2026-11-04T16:59:59Z"), at("2026-11-04T17:00:00Z"), at("2026-11-04T17:59:59Z")]
      .map((now) => M.bidPhase(s, now))).toEqual([
      { phase: "UPCOMING", nextOpensAt: at("2026-11-01T18:00:00Z") },
      { phase: "OPEN", nextOpensAt: at("2026-11-01T18:00:00Z") },
      { phase: "OPEN", nextOpensAt: at("2026-11-01T18:00:00Z") },
      { phase: "CLOSED", nextOpensAt: at("2026-11-08T18:00:00Z") },
      { phase: "CLOSED", nextOpensAt: at("2026-11-08T18:00:00Z") },
    ]);
  });

  it("slots are 5 minutes, 0..11, clamped; blackout is the last 600 s", () => {
    const s = at("2026-11-04T18:00:00Z");
    expect([0, 299_999, 300_000, 3_599_999, 3_600_000, 9e6].map((ms) => M.slotOf(s, new Date(+s + ms)))).toEqual([0, 0, 1, 11, 11, 11]);
    expect(M.slotEndsAt(s, 4)).toEqual(at("2026-11-04T18:25:00Z"));
    const end = at("2026-11-04T19:00:00Z");
    expect(M.isBlackout(end, at("2026-11-04T18:49:59Z"))).toBe(false);
    expect(M.isBlackout(end, at("2026-11-04T18:50:00Z"))).toBe(true);
  });

  it("weakPoint is HMAC-SHA256(seed, block:slot)[0] mod 4, and uniform", () => {
    const seed = "ab".repeat(16);
    expect(M.weakPoint(seed, "main", 7)).toBe(createHmac("sha256", seed).update("main:7").digest()[0] % 4);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[M.weakPoint(i.toString(16).padStart(32, "0"), "docks", i % 12)]++;
    for (const c of counts) { expect(c).toBeGreaterThan(2_300); expect(c).toBeLessThan(2_700); }
  });

  it("blocks go to the higher score, ties to the defender; 2 of 3 wins (9.4)", () => {
    expect(M.blockResults(S([90, 80, 0], [80, 80, 80])).map((b) => b.winner)).toEqual(["ATK", "DEF", "DEF"]);
    expect(M.attackerWins(S([90, 90, 0], [80, 80, 80]))).toBe(true);
    expect(M.attackerWins(S([90, 80, 0], [80, 80, 80]))).toBe(false);
  });

  it("defence earns XP only when the attacker scored on ≥ 2 blocks (D64)", () => {
    expect(M.defenceEarnsXp(S([10, 10, 0], [30, 30, 30]))).toBe(true);
    expect(M.defenceEarnsXp(S([20, 0, 0], [30, 30, 30]))).toBe(false);
  });

  it("baseline, floor, raise and capture XP come from the catalog", () => {
    expect(M.baselineScores("CROWN")).toEqual({ defDocks: 80, defMain: 80, defAlleys: 80 });
    expect(M.baselineScores("CORNER")).toEqual({ defDocks: 30, defMain: 30, defAlleys: 30 });
    expect(RACKETS.map((r) => M.bidFloor(r))).toEqual([2_100_000, 2_100_000, 4_550_000, 4_550_000, 2_100_000, 2_100_000, 4_550_000, 4_550_000, 9_100_000, 9_100_000]);
    expect(M.minNextBid(0, 9_100_000)).toBe(9_100_000);
    expect(M.minNextBid(9_100_000, 9_100_000)).toBe(10_010_000);
    expect(M.minNextBid(10_010_000, 9_100_000)).toBe(11_011_000);
    expect(M.minNextBid(5_505_500, 4_550_000)).toBe(6_056_050); // floating 5_505_500 * 1.1 would ceil to 6,056,051
    expect([M.captureXp("CORNER"), M.captureXp("DISTRICT"), M.captureXp("CROWN")]).toEqual([300, 450, 600]);
    expect(M.scoreField("DEF", "alleys")).toBe("defAlleys");
  });

  it("isTurfOpen needs enabled, turfEnabled and an allowed guild", async () => {
    expect(CRIME_FAMILY_CONFIG).toMatchObject({ bidOpensBeforeSeconds: 259_200, bidClosesBeforeSeconds: 3_600, bidRaisePct: 10, bidMinRaise: 100_000, warSoonSeconds: 900, racketEligibleMin: 3, neglectStrikesToRelease: 3, activeCorrectHits: 3 });
    await withCfConfig({ enabled: true }, async () => expect(isTurfOpen("g1")).toBe(false));
    await withCfConfig({ enabled: true, turfEnabled: true, allowGuildIds: ["g1"] }, async () => {
      expect(isTurfOpen("g1")).toBe(true);
      expect(isTurfOpen("g2")).toBe(false);
    });
  });
});
