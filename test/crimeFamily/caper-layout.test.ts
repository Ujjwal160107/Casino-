// test/crimeFamily/caper-layout.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { visibleText } from "./visibleText";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const { caperWorstCases } = await import("../../src/scripts/fixtures/caperScreens");
const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
const { buildCaperCard, buildBrief } = await import("../../src/ui/crimeFamily/caperScreens");

const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); (n.items ?? []).forEach((c: any) => f(c)); };
const json = (p: any) => p.components.map((c: any) => c.toJSON());
const types = (p: any) => { const t: number[] = []; json(p).forEach((x: any) => walk(x, (n) => n.type && t.push(n.type))); return t; };
const ids = (p: any) => { const t: string[] = []; json(p).forEach((x: any) => walk(x, (n) => n.custom_id && t.push(n.custom_id))); return t; };
const pick = (label: string) => caperWorstCases().find((c) => c.label === label)!.payload;

beforeAll(() => { for (const k of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${k}`, { id: "1456569047758929931", name: `cf_${k}` }); });

describe("caper screens (13.3)", () => {
  it("are all part of the family worst-case table", () => {
    const all = crimeFamilyWorstCases().map((c) => c.label);
    for (const c of caperWorstCases()) expect(all).toContain(c.label);
  });

  it("S12 with every seat filled has no select; without the banner it has no gallery and no file", () => {
    art.present = true;
    expect(types(pick("S12 lobby (T4, full)"))).not.toContain(ComponentType.StringSelect);
    expect(ids(pick("S12 lobby (T4, 1 seat)")).some((i) => i.startsWith("cpr:join:"))).toBe(true);
    art.present = false;
    const p = pick("S12 lobby (T4, 1 seat)");
    expect(types(p)).not.toContain(ComponentType.MediaGallery);
    expect(p.files ?? []).toHaveLength(0);
    art.present = true;
  });

  it("S13 is an edit that sends no file; S15 sends the result banner and clears attachments; the cancelled card clears them too", () => {
    art.present = true;
    const go = pick("S13 GO (T4, 6 seats)");
    expect(go.files ?? []).toHaveLength(0);
    expect(types(go)).toContain(ComponentType.MediaGallery);
    const result = pick("S15 result (T4 BUST, 6 seats)");
    expect(result.files!.map((f: any) => f.name)).toEqual(["cf_result_bust.png"]);
    expect(result.attachments).toEqual([]);
    expect(types(result)).not.toContain(ComponentType.ActionRow);
    expect(pick("S12 cancelled").attachments).toEqual([]);
  });

  it("S14 option buttons carry plain labels and no emoji; a dark seat gets only Refresh", () => {
    const open = json(pick("S14 brief (open)"));
    const buttons: any[] = []; open.forEach((x: any) => walk(x, (n) => n.type === ComponentType.Button && buttons.push(n)));
    expect(buttons.filter((b) => b.custom_id.startsWith("cpr:act:")).every((b) => !b.emoji && !/<a?:\w+:\d+>/.test(b.label))).toBe(true);
    expect(ids(pick("S14 brief (dark)")).filter((i) => i.startsWith("cpr:act:"))).toHaveLength(0);
    expect(pick("S14 brief (open)").flags & 64).toBe(64);
  });

  it("only the GO call pings, and only the crew", () => {
    expect(pick("S28 GO call (6 crew)").allowedMentions).toEqual({ parse: [], users: expect.arrayContaining([expect.any(String)]) });
    expect(pick("S28 GO call (6 crew)").allowedMentions.users).toHaveLength(6);
    for (const c of caperWorstCases().filter((x) => x.label !== "S28 GO call (6 crew)")) expect(c.payload.allowedMentions).toEqual({ parse: [] });
  });

  it("customIds stay under 100 characters at max length", () => {
    const longest = [CPR_IDS.openBrief("a".repeat(24), "9".repeat(20)), CPR_IDS.act("a".repeat(24), 3), CPR_IDS.plan("9".repeat(20))];
    expect(Math.max(...longest.map((s) => s.length))).toBe(60);
  });
});

it("S11 names the size-scaled heist cap", () => {
  const s11 = caperWorstCases().find((c) => c.label === "S11 planner (Capo)")!;
  expect(visibleText(s11.payload)).toContain("/10 in 24 h");
});
