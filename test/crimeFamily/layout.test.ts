import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import type { FamilyDashboardView } from "../../src/services/crimeFamily/views";
import type { CfPayload } from "../../src/ui/crimeFamily/kit";
import { CREW_IDS, TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { count, chars, walk, countComponents } from "./layoutHelpers";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
const { buildDashboard, buildInviteCard, buildInviteResolved, buildLeaderboard, buildManagePanel } = await import("../../src/ui/crimeFamily/familyScreens");
const { dashboardView } = await import("../../src/scripts/fixtures/crimeFamilyScreens");


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
    capos: 0, capoCap: 1, crestKey: "crest_1", roster: [{ userId: "1", role: "BOSS", associateUntil: null }, { userId: "2", role: "UNDERBOSS", associateUntil: null }],
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

  it("S4 resolved names no attachment and clears the posted crest, whatever crest the family has now", () => {
    art.present = true;
    const invite = { inviteId: "65f000000000000000000009", familyLabel: "[VLA] Velvet Ante", crestKey: "crest_1", inviterId: "1", inviteeId: "2", expiresAt: new Date(), memberCount: 2, memberCap: 6 };
    expect(text(buildInviteCard(invite))).toContain("attachment://");
    const resolved = buildInviteResolved({ ...invite, crestKey: "crest_4" }, "Accepted by <@2>");
    expect(text(resolved)).not.toContain("attachment://");
    expect(resolved.files ?? []).toHaveLength(0);
    expect(resolved.attachments).toEqual([]);
    expect(text(resolved)).toContain("Accepted by <@2>");
  });

  it("S2 hides Turf while turfEnabled is false and shows Claim only for a claim-eligible Underboss", () => {
    expect(ids(buildDashboard(view(), { art: false })).some((id) => id.startsWith("turf:"))).toBe(false);
    expect(ids(buildDashboard(view({ showTurf: true }), { art: false }))).toContain(TURF_IDS.viewMap("2"));
    expect(ids(buildDashboard(view(), { art: false }))).not.toContain(CREW_IDS.claim("65f000000000000000000001"));
    expect(ids(buildDashboard(view({}, { canClaim: true }), { art: false }))).toContain(CREW_IDS.claim("65f000000000000000000001"));
  });

  it("S2 never labels the Boss an Associate and hides rackets with no provider", () => {
    const t = text(buildDashboard(view({ roster: [{ userId: "1", role: "BOSS", associateUntil: null }, { userId: "2", role: "SOLDIER", associateUntil: new Date(Date.now() + 3600_000) }] }), { art: false }));
    expect(t.match(/\*\*Associates\*\* <@2> <t:\d+:R>/g)).toHaveLength(1);
    expect(t).not.toMatch(/\*\*Associates\*\*[^"]*<@1>/);
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

const rosterText = (p: CfPayload) => {
  let text = "";
  p.components.forEach((c) => walk(c.toJSON(), (n) => { if (typeof n.content === "string" && n.content.includes("**Boss**")) text = n.content; }));
  return text;
};
const selectOf = (p: CfPayload) => {
  let sel: any = null;
  p.components.forEach((c) => walk(c.toJSON(), (n) => { if (n.type === ComponentType.StringSelect) sel = n; }));
  return sel;
};
const buttons = (p: CfPayload) => {
  const out: any[] = [];
  p.components.forEach((c) => walk(c.toJSON(), (n) => { if (n.type === ComponentType.Button) out.push(n); }));
  return out;
};

describe("30-member rosters (amendment 2.5)", () => {
  it("S2 groups a 30-member roster into five lines under 1,400 characters", () => {
    const v = dashboardView();
    const text = rosterText(buildDashboard(v, { art: false }));
    const lines = text.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.match(/\*\*(\w+)/)![1])).toEqual(["Boss", "Underboss", "Capos", "Soldiers", "Associates"]);
    expect(text.length).toBeLessThan(1_400);
    const ub = v.roster.find((r) => r.role === "UNDERBOSS")!;
    expect(lines[1]).toContain(`<@${ub.userId}>`);                       // F8: inside 72 h, still on its rank line
    expect(lines[4]).not.toContain(`<@${ub.userId}>`);
  });

  it("S5 page 2 of 2 lists #16..#30 and a select of 15", () => {
    const v = dashboardView();
    const target = v.roster[19].userId;
    const p = buildManagePanel(v.viewer.userId, v, target, 1);
    const sel = selectOf(p);
    expect(sel.custom_id).toBe(CREW_IDS.manageSelect(1, v.viewer.userId));
    expect(sel.options).toHaveLength(15);
    expect(sel.options.find((o: any) => o.default)?.value).toBe(target);
    const [prev, page, next] = buttons(p).filter((b) => /^(Prev|Page|Next)/.test(b.label));
    expect([prev.disabled ?? false, page.label, page.disabled, next.disabled]).toEqual([false, "Page 2/2", true, true]);
    expect(prev.custom_id).toBe(CREW_IDS.managePage(0, v.viewer.userId));
    expect(JSON.stringify(p.components.map((c) => c.toJSON()))).toContain("#16");
    expect(countComponents(p)).toBeLessThanOrEqual(16);
  });

  it("S2's Capos line and the S5 legend name the Capo seats and the promotion bar (amendment 3.4)", () => {
    const v = { ...dashboardView(), capos: 4, capoCap: 3 };
    expect(rosterText(buildDashboard(v, { art: false }))).toContain("**Capos (4/3)**");
    const s5 = JSON.stringify(buildManagePanel(v.viewer.userId, v, null, 0, "<@1> is now a Soldier (no Capo seat was free).").components.map((c) => c.toJSON()));
    expect(s5).toContain("Capo seats 4/3; promotion needs 10,000,000 net worth.");
    expect(s5).toContain("<@1> is now a Soldier (no Capo seat was free).");
  });

  it("S5 clamps a page past the end to the last page; a selection off the page counts as none", () => {
    const v = dashboardView();
    const p = buildManagePanel(v.viewer.userId, v, v.roster[2].userId, 9);
    expect(selectOf(p).custom_id).toBe(CREW_IDS.manageSelect(1, v.viewer.userId));
    expect(selectOf(p).options.some((o: any) => o.default)).toBe(false);
  });
});

describe("payday at 30 members (amendment 2.5)", () => {
  it("S7 groups 30 unpaid members by need; S6 shows 10 ineligible lines and +20 more", () => {
    const text = (label: string) => JSON.stringify(crimeFamilyWorstCases().find((c) => c.label === label)!.payload.components.map((c) => c.toJSON()));
    const s7 = text("S7 payday preview (30 paid, 30 unpaid)");
    expect(s7.match(/\*\*[^*]+:\*\*/g)!.length).toBeLessThanOrEqual(7);
    const s6 = text("S6 vault (30 ineligible)");
    expect(s6).toContain("+20 more: see the payday preview");
  });
});

it("S1 carries Find a family within 14 components; S2 with claim, vote and recruit buttons stays within 20", () => {
  const byLabel = (l: string) => crimeFamilyWorstCases().find((c) => c.label === l)!;
  const s1 = byLabel("S1 no-family card");
  expect(JSON.stringify(s1.payload.components.map((c) => c.toJSON()))).toContain("Find a family");
  expect(countComponents(s1.payload)).toBeLessThanOrEqual(14);
  expect(countComponents(byLabel("S2 dashboard (claim, vote and recruit, 30 members)").payload)).toBeLessThanOrEqual(20);
});

it("S8 names the released rackets and the next census for a league move within 6 components (6.6)", () => {
  const s8 = crimeFamilyWorstCases().find((c) => c.label === "S8 level-up confirm (league move, 3 released)")!;
  const t = JSON.stringify(s8.payload.components.map((c) => c.toJSON()));
  expect(t).toContain("releases");
  expect(t).toContain("next census");
  expect(countComponents(s8.payload)).toBeLessThanOrEqual(6);
});
