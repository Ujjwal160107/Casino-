import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const S = await import("../../src/ui/crimeFamily/turfScreens");
const { turfWorstCases } = await import("../../src/scripts/fixtures/turfScreens");

const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); if (n.accessory) f(n.accessory); };
const json = (p: any) => p.components.map((c: any) => c.toJSON());
const text = (p: any) => JSON.stringify(json(p));
const types = (p: any) => { const t: number[] = []; json(p).forEach((c: any) => walk(c, (n) => t.push(n.type))); return t; };
const view = (o: any = {}) => ({ warId: "65f0000000000000000000ab", racketKey: "casino_row", racketName: "Casino Row Protection", racketClass: "CROWN", startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000),
  attacker: { familyId: "a", label: "[VLA] Velvet Ante" }, defender: { familyId: "", label: "the Street" },
  scores: { docks: { atk: 10, def: 80 }, main: { atk: 0, def: 80 }, alleys: { atk: 0, def: 80 } }, hits: { atk: 14, def: 9 },
  top: { atk: [{ userId: "1", points: 10 }], def: [] }, blackout: false, ...o });

beforeAll(() => { for (const k of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${k}`, { id: "1456569047758929931", name: `cf_${k}` }); });

describe("turf screens (13.3)", () => {
  it("registers every turf case in the shared worst-case table", async () => {
    const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
    const labels = crimeFamilyWorstCases().map((c) => c.label);
    for (const c of turfWorstCases()) expect(labels).toContain(c.label);
  });

  it("S18 shows the baseline outside the blackout and ?? with hit counts inside it", () => {
    art.present = true;
    expect(text(S.buildWarBoard(view(), "none"))).toMatch(/80/);
    const dark = text(S.buildWarBoard(view({ blackout: true }), "none"));
    expect(dark).toContain("??"); expect(dark).toContain("Hits: 14 vs 9"); expect(dark).not.toMatch(/\b80\b/);
  });

  it("S18 art modes: send carries the banner file, keep only the gallery, none neither (T8, D66)", () => {
    art.present = true;
    const send = S.buildWarBoard(view(), "send");
    expect(send.files).toHaveLength(1);
    expect(types(send)).toContain(ComponentType.MediaGallery);
    const keep = S.buildWarBoard(view(), "keep");
    expect(keep.files ?? []).toHaveLength(0);
    expect(types(keep)).toContain(ComponentType.MediaGallery);
    expect(types(S.buildWarBoard(view(), "none"))).not.toContain(ComponentType.MediaGallery);
    art.present = false;
    const absent = S.buildWarBoard(view(), "send");
    expect([absent.files ?? [], types(absent).includes(ComponentType.MediaGallery)]).toEqual([[], false]);
  });

  it("S18 buttons carry block emojis; S19 approach buttons are plain text", () => {
    art.present = true;
    const ids: string[] = []; const emojis: any[] = [];
    json(S.buildWarBoard(view(), "none")).forEach((c: any) => walk(c, (n) => { if (n.custom_id) { ids.push(n.custom_id); emojis.push(n.emoji); } }));
    expect(ids).toEqual([TURF_IDS.scout(view().warId), ...["docks", "main", "alleys"].map((b) => TURF_IDS.hit(view().warId, b as any))]);
    expect(emojis.every(Boolean)).toBe(true);
    const call = S.buildHitCall({ hitId: "65f0000000000000000000ac", block: "docks", deadline: new Date(), slotEndsAt: new Date(), approaches: ["Crane", "Warehouse", "Pier 4", "Boathouse"] }, "Docks");
    const labels: any[] = []; json(call).forEach((c: any) => walk(c, (n) => n.custom_id && labels.push([n.label, n.emoji])));
    expect(labels).toEqual([["Crane", undefined], ["Warehouse", undefined], ["Pier 4", undefined], ["Boathouse", undefined]]);
  });

  it("S21 has no action row; S17 always sends its thumbnail and clears old attachments", () => {
    art.present = true;
    const result = S.buildWarResult({ board: view(), outcome: "HELD", overCap: false, xp: [], heated: 2 }, "keep");
    expect(types(result)).not.toContain(ComponentType.ActionRow);
    const c = turfWorstCases().find((x) => x.label.startsWith("S17"))!;
    expect(c.payload.files).toHaveLength(1);
    expect(c.payload.attachments).toEqual([]);
  });

  it("S17 with no live war says whether bidding is upcoming, open, or closed for the week", () => {
    const at = new Date("2026-11-08T18:00:00Z");
    const detail = (phase: string) => text(S.buildRacketDetail("1", {
      line: { racketId: "65f0000000000000000001aa", cityId: "c", key: "valet_racket", name: "Valet Racket", class: "CORNER", income: 1, ownerFamilyId: "", ownerLabel: "the Street", strikes: 0,
        war: null, nextWarAt: new Date("2026-11-04T18:00:00Z"), bidding: { phase: phase as any, nextOpensAt: at } },
      floor: 1, minBid: 1, city: { id: "c", league: "GOLD", number: 1, label: "Uptown #1" }, viewerIsOfficer: true, canBid: false, blockers: [],
    }));
    expect(detail("UPCOMING")).toContain(`**Bidding:** opens <t:${+at / 1000}:R>`);
    expect(detail("OPEN")).toContain("**Bidding:** open, no bids yet");
    expect(detail("CLOSED")).toContain(`**Bidding:** closed, no bids this week · next window opens <t:${+at / 1000}:R>`);
  });

  it("S16 and S21 drop the gallery and send no file when the banner is absent; S16 sends the banner and clears attachments when present (D66, 13.2)", () => {
    art.present = false;
    const mapAbsent = turfWorstCases().find((x) => x.label.startsWith("S16"))!.payload;
    expect([types(mapAbsent).includes(ComponentType.MediaGallery), mapAbsent.files ?? []]).toEqual([false, []]);
    const resultAbsent = S.buildWarResult({ board: view(), outcome: "HELD", overCap: false, xp: [], heated: 0 }, "keep");
    expect([types(resultAbsent).includes(ComponentType.MediaGallery), resultAbsent.files ?? []]).toEqual([false, []]);
    art.present = true;
    const map = turfWorstCases().find((x) => x.label.startsWith("S16"))!.payload;   // also the S17 → S16 Back payload
    expect(map.files).toHaveLength(1);
    expect(map.attachments).toEqual([]);
  });

  it("S16 lists 10 rackets under 2,000 characters with emojis seeded", () => {
    art.present = true;
    const c = turfWorstCases().find((x) => x.label.startsWith("S16"))!;
    const t = json(c.payload).flatMap((x: any) => { const out: string[] = []; walk(x, (n) => typeof n.content === "string" && out.push(n.content)); return out; }).join("");
    expect(t.length).toBeLessThan(2_000);
    const opts: any[] = []; json(c.payload).forEach((x: any) => walk(x, (n) => n.options && opts.push(...n.options)));
    expect(opts).toHaveLength(10);
  });
});

it("the S20 scout report's hint is not bound to the home channel (G11)", async () => {
  const { visibleText } = await import("./visibleText");
  const scout = turfWorstCases().find((c) => c.label === "S20 scout report")!;
  expect(visibleText(scout.payload)).toContain("it holds until the slot ends");
  expect(visibleText(scout.payload)).not.toContain("in the home channel");
});

it("the war-soon DM carries Scout and the three Hits within its 12-component max", () => {
  const WAR = "65f0000000000000000000ab";
  const dm = turfWorstCases().find((c) => c.label === "DM turf war soon")!;
  expect(dm.max).toBe(12);
  const ids: string[] = []; json(dm.payload).forEach((c: any) => walk(c, (n) => n.custom_id && ids.push(n.custom_id)));
  expect(ids).toEqual([TURF_IDS.scout(WAR), ...["docks", "main", "alleys"].map((b) => TURF_IDS.hit(WAR, b as any))]);
});

it("both S16 cases fit in 20 components and carry no duplicate custom_id (6.8, H3)", async () => {
  const { countComponents } = await import("./layoutHelpers");
  const maps = turfWorstCases().filter((c) => c.label.startsWith("S16"));
  expect(maps.map((c) => c.label)).toEqual([
    "S16 turf map (placed Gold family, 10 owned rackets, live bids, both pager arrows)",
    "S16 turf map (unplaced family)",
  ]);
  for (const c of maps) {
    expect(c.max).toBe(20);
    expect(countComponents(c.payload)).toBeLessThanOrEqual(20);
    const ids: string[] = []; json(c.payload).forEach((x: any) => walk(x, (n) => n.custom_id && ids.push(n.custom_id)));
    expect(new Set(ids).size).toBe(ids.length);
  }
});
