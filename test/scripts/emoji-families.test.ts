import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { loadImage, createCanvas } from "canvas";
import { APPLICATION_EMOJI_FAMILIES, MANAGED_EMOJI_PREFIXES, pruneCandidates, assertFamilyRegistry } from "../../src/utils/applicationEmojiFamilies";
import { RUNTIME_MANAGED_PREFIXES, applicationEmojiName } from "../../src/utils/applicationEmojiNames";
import { CF_ASSETS, CF_ART } from "../../src/utils/crimeFamilyAssets";
import { renderApplicationEmoji } from "../../src/scripts/syncShopApplicationEmojis";

const ASSETS = path.join(__dirname, "../../src/assets");
const cf = APPLICATION_EMOJI_FAMILIES.find((f) => f.id === "cf")!;

describe("application emoji families (20.4)", () => {
  it("keeps prefixes disjoint and the runtime list in sync", () => {
    expect(() => assertFamilyRegistry(APPLICATION_EMOJI_FAMILIES)).not.toThrow();
    expect(() => assertFamilyRegistry([...APPLICATION_EMOJI_FAMILIES, { ...cf, id: "cf2" as any, prefix: "cf_x" }])).toThrow();
    expect([...RUNTIME_MANAGED_PREFIXES]).toEqual(MANAGED_EMOJI_PREFIXES);
  });
  it("has 24 cf icons on disk with valid, collision-free names", () => {
    expect(Object.keys(CF_ASSETS)).toHaveLength(24);
    const names = APPLICATION_EMOJI_FAMILIES.flatMap((f) => Object.keys(f.assets).map((k) => applicationEmojiName(f.prefix, k)));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_]{2,32}$/);
    for (const file of Object.values(CF_ASSETS)) expect(fs.existsSync(path.join(ASSETS, file)), file).toBe(true);
  });
  it("prunes only the selected family's stale names", () => {
    expect(pruneCandidates(["cf_old", "cf_vault", "shop_x", "cfx"], cf, new Set(["cf_vault"]))).toEqual(["cf_old"]);
  });
  it("renders a cf icon nearest-neighbour: each 4 px cell becomes exactly 3 px at offset 4", async () => {
    const png = await renderApplicationEmoji(path.join(ASSETS, CF_ASSETS.vault), cf);
    const img = await loadImage(png);
    expect([img.width, img.height]).toEqual([128, 128]);
    const src = await loadImage(path.join(ASSETS, CF_ASSETS.vault));
    const a = createCanvas(160, 160).getContext("2d"); a.drawImage(src, 0, 0);
    const b = createCanvas(128, 128).getContext("2d"); b.drawImage(img, 0, 0);
    for (const [cx, cy] of [[10, 10], [20, 21], [33, 7]]) {
      expect(Array.from(b.getImageData(4 + cx * 3 + 1, 4 + cy * 3 + 1, 1, 1).data)).toEqual(Array.from(a.getImageData(cx * 4 + 1, cy * 4 + 1, 1, 1).data));
    }
  });
  it("ships banners at 960x336, fully opaque, and the mascot at 500x500 with binary alpha and ≤ 32 colours", async () => {
    for (const [key, file] of Object.entries(CF_ART)) {
      const p = path.join(ASSETS, file);
      if (!fs.existsSync(p)) continue; // D66: art may be absent
      const img = await loadImage(p);
      const ctx = createCanvas(img.width, img.height).getContext("2d"); ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;
      const alpha = px.filter((_, i) => i % 4 === 3);
      if (key === "fortuna_don") {
        expect([img.width, img.height]).toEqual([500, 500]);
        expect(alpha.every((v) => v === 0 || v === 255)).toBe(true);
        const colours = new Set<number>();
        for (let i = 0; i < px.length; i += 4) colours.add(((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0);
        expect(colours.size).toBeLessThanOrEqual(32);   // spec 18; P16 drops the cap for banners only
      }
      else { expect([img.width, img.height]).toEqual([960, 336]); expect(alpha.every((v) => v === 255)).toBe(true); }
    }
  });
  it("never fills a managed-prefix name from a guild emoji", async () => {
    vi.resetModules();
    const reg = await import("../../src/utils/emojiRegistry");
    const client = { application: { fetch: async () => {}, emojis: { fetch: async () => new Map() } }, emojis: { cache: new Map([["1", { id: "1", name: "cf_vault", animated: false }]]) }, guilds: { cache: new Map() } } as any;
    await reg.initEmojiRegistry(client);
    expect(reg.emojiInline("cf_vault")).toBeUndefined();
  });
  it("keeps src/data/emojis.json free of managed names and duplicate ids", () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/emojis.json"), "utf8"));
    expect(Object.keys(data).filter((k) => MANAGED_EMOJI_PREFIXES.some((p) => k.startsWith(p)))).toEqual([]);
    const ids = Object.values<any>(data).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
