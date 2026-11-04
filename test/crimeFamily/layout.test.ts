import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import type { FamilyDashboardView } from "../../src/services/crimeFamily/views";
import type { CfPayload } from "../../src/ui/crimeFamily/kit";
import { CREW_IDS, TURF_IDS } from "../../src/ui/crimeFamily/ids";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
const { buildDashboard, buildLeaderboard } = await import("../../src/ui/crimeFamily/familyScreens");

const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);
const chars = (n: any): number => (typeof n.content === "string" ? n.content.length : 0) + (n.components ?? []).reduce((s: number, c: any) => s + chars(c), 0) + (n.accessory ? chars(n.accessory) : 0);
const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); };

beforeAll(() => { for (const k of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${k}`, { id: "1456569047758929931", name: `cf_${k}` }); });

const labels = crimeFamilyWorstCases().map((c) => c.label);

describe.each([true, false])("family screens, art present = %s", (present) => {
  it.each(labels)("%s", (label) => {
      art.present = present; // payloads are built inside the test, after the toggle
      const c = crimeFamilyWorstCases().find((x) => x.label === label)!;
      const json = c.payload.components.map((x) => x.toJSON());
      const total = json.reduce((s, x) => s + count(x), 0);
      expect(total).toBeLessThanOrEqual(c.max);
      expect(total).toBeLessThan(40);
      expect(json.reduce((s, x) => s + chars(x), 0)).toBeLessThanOrEqual(4000);
      expect(c.payload.allowedMentions.parse).toEqual([]);
      expect(c.payload.files?.length ?? 0).toBeLessThanOrEqual(present ? 1 : 0);
      json.forEach((x) => walk(x, (n) => {
        if (n.type === ComponentType.Section) expect(n.accessory).toBeTruthy();
        if (n.custom_id) expect(n.custom_id.length).toBeLessThanOrEqual(100);
        if (n.type === ComponentType.Button && n.label) expect(n.label).not.toMatch(/<a?:\w+:\d+>/);
      }));
  });
});

describe("screen details", () => {
  const view = (o: Partial<FamilyDashboardView> = {}, viewer: Partial<FamilyDashboardView["viewer"]> = {}): FamilyDashboardView => ({
    familyId: "65f000000000000000000001", name: "Velvet Ante", tag: "VLA", level: 1, xp: 0, nextLevelXp: 1_000, memberCount: 2, memberCap: 6,
    crestKey: "crest_1", roster: [{ userId: "1", role: "BOSS", associateUntil: null }, { userId: "2", role: "UNDERBOSS", associateUntil: null }],
    duesArrears: 0, nextCaperAt: new Date(), underInvestigation: false, racketsHeld: null, showTurf: false, ...o,
    viewer: { userId: "2", role: "UNDERBOSS", canManage: true, canClaim: false, ...viewer },
  });
  const ids = (p: CfPayload) => { const out: string[] = []; p.components.forEach((c) => walk(c.toJSON(), (n) => n.custom_id && out.push(n.custom_id))); return out; };
  const text = (p: CfPayload) => JSON.stringify(p.components.map((c) => c.toJSON()));

  it("S2 Back from an ephemeral panel sends the crest and clears attachments", () => {
    art.present = true;
    const p = buildDashboard(view(), { art: true });
    expect(p.files).toHaveLength(1);
    expect(p.attachments).toEqual([]);
    expect(buildDashboard(view(), { art: false }).files ?? []).toHaveLength(0);
  });

  it("S2 hides Turf while turfEnabled is false and shows Claim only for a claim-eligible Underboss", () => {
    expect(ids(buildDashboard(view(), { art: false })).some((id) => id.startsWith("turf:"))).toBe(false);
    expect(ids(buildDashboard(view({ showTurf: true }), { art: false }))).toContain(TURF_IDS.viewMap("2"));
    expect(ids(buildDashboard(view(), { art: false }))).not.toContain(CREW_IDS.claim("65f000000000000000000001"));
    expect(ids(buildDashboard(view({}, { canClaim: true }), { art: false }))).toContain(CREW_IDS.claim("65f000000000000000000001"));
  });

  it("S2 never labels the Boss an Associate and hides rackets with no provider", () => {
    const t = text(buildDashboard(view({ roster: [{ userId: "1", role: "BOSS", associateUntil: null }, { userId: "2", role: "SOLDIER", associateUntil: new Date(Date.now() + 3600_000) }] }), { art: false }));
    expect(t.match(/Associate until/g)).toHaveLength(1);
    expect(t).not.toMatch(/Rackets/);
    expect(text(buildDashboard(view({ racketsHeld: 2 }), { art: false }))).toMatch(/Rackets 2/);
  });

  it("S10 marks a level 10 family 'Made Family' and shows rackets only when known", () => {
    const row = (rank: number, level: number, rackets: number | null) => ({ rank, familyId: `f${rank}`, tag: `T${rank}`, name: `Family ${rank}`, level, crestKey: "crest_4", members: 12, rackets, value: 60_000 - rank });
    const lb = (rackets: number | null) => ({ sort: "xp", sorts: [{ key: "xp", label: "XP" }, { key: "war", label: "War wins" }], rows: [row(1, 10, rackets), row(2, 9, rackets)], viewer: null });
    const t = text(buildLeaderboard("u", lb(null), { art: false }));
    expect(t.match(/Made Family/g)).toHaveLength(1);
    expect(t).not.toMatch(/rackets/i);
    expect(text(buildLeaderboard("u", lb(3), { art: false }))).toMatch(/3 rackets/);
  });
});
