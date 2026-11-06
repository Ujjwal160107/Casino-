import { describe, it, expect } from "vitest";
import { checkPublicText } from "../../src/services/crimeFamily/names";
import { parseRequirement } from "../../src/services/crimeFamily/recruitService";

const P = { min: 10, max: 150 };
const ok = (s: string) => checkPublicText(s, P);

describe("checkPublicText (A37)", () => {
  it.each(["Where there is a street, we run it.", "Don't be a nerd, we play daily", "go ok team, heists nightly",
    "we are tardy but loyal", "much inky ink here ok"])("accepts %s", (s) => expect(ok(s).ok).toBe(true));
  it.each([
    ["Join us at discord.gg/abc now", "No links or invites."],
    ["@everyone welcome to the crew", "No mentions or pings."],
    ["@​everyone welcome to the crew", "No mentions or pings."],
    ["visit disc​ord.gg/abc today", "No links or invites."],
    ["Fortuna staff family recruiting", "Don't use Fortuna, staff or Discord names."],
    ["we are n i g g e r s crew", "That text is not allowed."],
    ["we are n.i.g.g.e.r crew ok", "That text is not allowed."],
    ["short", "Write 10–150 characters."],
  ])("refuses %s", (s, reason) => expect(ok(s)).toEqual({ ok: false, reason }));
  it("collapses whitespace and keeps markdown as literal text for the renderer to escape", () => {
    expect(ok("**bold**   # Big\n\n\n-# tiny ||spoiler|| <t:0:R>")).toEqual({ ok: true, text: "**bold** # Big -# tiny ||spoiler|| <t:0:R>" });
  });
});

describe("parseRequirement (Review Focus 2)", () => {
  it.each([["10m", 10_000_000], ["2.5b", 2_500_000_000], ["1,000", 1_000], ["", 0], ["0", 0]])("%s → %i", (raw, v) =>
    expect(parseRequirement(raw, 10_000_000_000)).toEqual({ ok: true, value: v }));
  it.each(["-5", "abc", "1e9", "2.5", "all"])("refuses %s", (raw) =>
    expect(parseRequirement(raw, 5_000)).toEqual({ ok: false, reason: "Enter a whole number like 10m or 1,000." }));
  it("names the limit", () => expect(parseRequirement("20b", 10_000_000_000)).toEqual({ ok: false, reason: "Max 10,000,000,000." }));
});
