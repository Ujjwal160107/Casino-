import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { CF_SPRITES } from "../../src/data/sprites/cf";
import { validateSprite } from "../../src/utils/pixelSprite";

// The grids are the source; npm run gen:pixel-assets renders them into
// src/assets. Every sprite must be valid and have its rendered icon shipped.

describe("Crime Families sprites", () => {
  it("has the 24 icons from PRD section 16.1, each key once", () => {
    const keys = CF_SPRITES.map((s) => s.key);
    expect(keys).toHaveLength(24);
    expect(new Set(keys).size).toBe(24);
  });

  it.each(CF_SPRITES.map((s) => [s.key, s] as const))("%s is a valid grid", (_key, sprite) => {
    expect(validateSprite(sprite)).toEqual([]);
  });

  it.each(CF_SPRITES.map((s) => [s.key] as const))("%s has a rendered icon in src/assets", (key) => {
    expect(fs.existsSync(path.join(__dirname, "../../src/assets", `cf_${key}.png`))).toBe(true);
  });

  it("rejects a grid with a bad palette index and names the cell", () => {
    const bad = { ...CF_SPRITES[0], rows: CF_SPRITES[0].rows.map((r, y) => (y === 5 ? "z" + r.slice(1) : r)) };
    expect(validateSprite(bad)).toContain(`sprite "${bad.key}": row 5 col 0 "z" is not a palette index`);
  });
});
