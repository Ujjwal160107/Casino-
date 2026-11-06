import { describe, it, expect } from "vitest";
import { checkFamilyName, checkFamilyTag } from "../../src/services/crimeFamily/names";
import { can, isAssociate } from "../../src/services/crimeFamily/permissions";

const now = new Date("2026-11-04T12:00:00Z");
const old = new Date("2026-10-01T00:00:00Z");
const fresh = new Date("2026-11-03T12:00:00Z"); // 24h: Associate

describe("names and tags (6.2)", () => {
  it.each([
    ["Velvet Ante", "velvet ante"], ["  Velvet Ante  ", "velvet ante"], ["O'Brien-Kin", "o'brien-kin"],
  ])("accepts %j", (raw, key) => expect(checkFamilyName(raw)).toMatchObject({ ok: true, nameKey: key }));
  it.each(["Velvet  Ante", "ab", "x".repeat(25), "Café Noir", "Ante 😀", "-Ante", "Streetwise", "The F.o.r.t.u.n.a", "Where Eagles Dare", "Model Citizens"])(
    "refuses %j", (raw) => expect(checkFamilyName(raw).ok).toBe(false));
  it("uppercases a tag and refuses bad ones", () => {
    expect(checkFamilyTag(" vla ")).toEqual({ ok: true, tag: "VLA", tagKey: "VLA" });
    for (const t of ["V", "VLAXX", "V-A", "MOD"]) expect(checkFamilyTag(t).ok).toBe(false);
  });
});

describe("permissions (6.3)", () => {
  const as = (role: any, joinedAt = old) => ({ role, joinedAt });
  it.each([
    ["CAPO", "invite", undefined, true], ["SOLDIER", "invite", undefined, false],
    ["BOSS", "kick", "UNDERBOSS", true], ["UNDERBOSS", "kick", "CAPO", true], ["UNDERBOSS", "kick", "UNDERBOSS", false],
    ["CAPO", "kick", "SOLDIER", true], ["CAPO", "kick", "CAPO", false],
    ["BOSS", "promote", "CAPO", true], ["UNDERBOSS", "promote", "SOLDIER", true], ["UNDERBOSS", "promote", "CAPO", false],
    ["UNDERBOSS", "payday", undefined, true], ["CAPO", "payday", undefined, false],
    ["UNDERBOSS", "claim_chair", undefined, true], ["BOSS", "claim_chair", undefined, false],
    ["BOSS", "disband", undefined, true], ["UNDERBOSS", "set_home", undefined, false], ["CAPO", "plan_caper", undefined, true],
    ["UNDERBOSS", "start_vote", undefined, true], ["CAPO", "start_vote", undefined, true],
    ["SOLDIER", "start_vote", undefined, false], ["BOSS", "start_vote", undefined, false],
    ["SOLDIER", "cast_vote", undefined, true], ["BOSS", "cast_vote", undefined, false],
  ] as const)("%s %s %s → %s", (role, action, target, want) =>
    expect(can(as(role), action, now, target ? { role: target } : undefined)).toBe(want));
  it("Associates can deposit but cannot take a seat or act in a war", () => {
    expect(isAssociate(fresh, now)).toBe(true);
    expect(can(as("SOLDIER", fresh), "deposit", now)).toBe(true);
    expect(can(as("SOLDIER", fresh), "take_seat", now)).toBe(false);
    expect(can(as("SOLDIER", fresh), "war_act", now)).toBe(false);
  });
  it("a fresh Capo or Underboss keeps the rank's rights except seats and war acts", () => {
    expect(can(as("CAPO", fresh), "invite", now)).toBe(true);
    expect(can(as("UNDERBOSS", fresh), "payday", now)).toBe(true);
    expect(can(as("CAPO", fresh), "take_seat", now)).toBe(false);
  });
  it.each(["invite", "set_home", "rename", "disband", "payday", "take_seat", "war_act"] as const)(
    "a Boss who founded a minute ago may %s (P20)", (action) => {
      expect(can({ role: "BOSS", joinedAt: new Date(+now - 60_000) }, action, now)).toBe(true);
    });
});
