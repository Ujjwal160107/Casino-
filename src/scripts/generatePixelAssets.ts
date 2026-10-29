/**
 * Render pixel-art sprite grids to PNGs in src/assets (DESIGN.md section 8B).
 * Pure file I/O: no Prisma, no Redis, no .env, no Discord.
 *
 *   npm run gen:pixel-assets -- --set cf                  validate + write all
 *   npm run gen:pixel-assets -- --set cf --only vault,war only those keys
 *   npm run gen:pixel-assets -- --set cf --check          validate only
 *   npm run gen:pixel-assets -- --set cf --sheet out.png  contact sheet for sign-off
 *   npm run gen:pixel-assets -- --import ref.png --key vault --set cf
 *                                                         40x40 PNG -> sprite source
 */
import fs from "fs";
import path from "path";
import { createCanvas, loadImage, Image } from "canvas";
import type { PixelSprite } from "../data/sprites/types";
import { CF_SPRITES } from "../data/sprites/cf";
import { INDEX_CHARS, validateSprite } from "../utils/pixelSprite";

export const SPRITE_SETS: Record<string, { prefix: string; dir: string; sprites: readonly PixelSprite[] }> = {
  cf: { prefix: "cf_", dir: "cf", sprites: CF_SPRITES },
};

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const SPRITES_DIR = path.join(__dirname, "..", "data", "sprites");
const MAX_BYTES = 64 * 1024;
const SHEET_REFERENCES = ["lucky coin.png", "thieves gloves.png", "padlock.png"];
const SHEET_BG = "#2b2d31"; // Discord dark theme

export function renderSprite(sprite: PixelSprite): Buffer {
  const size = sprite.grid * sprite.scale;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  sprite.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const idx = INDEX_CHARS.indexOf(ch);
      if (idx <= 0) return;
      ctx.fillStyle = sprite.palette[idx];
      ctx.fillRect(x * sprite.scale, y * sprite.scale, sprite.scale, sprite.scale);
    });
  });
  return canvas.toBuffer("image/png", { compressionLevel: 9 });
}

/** Read a 40x40 reference PNG into a sprite (alpha below 128 is transparent). */
export async function importSprite(file: string, key: string): Promise<PixelSprite> {
  const img = await loadImage(file);
  if (img.width !== 40 || img.height !== 40) throw new Error(`${file} is ${img.width}x${img.height}, expected 40x40`);
  const canvas = createCanvas(40, 40);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, 40, 40).data;
  const palette = ["transparent"];
  const rows: string[] = [];
  for (let y = 0; y < 40; y++) {
    let row = "";
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      if (data[i + 3] < 128) { row += "0"; continue; }
      const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      let idx = palette.indexOf(hex);
      if (idx < 0) idx = palette.push(hex) - 1;
      if (idx >= INDEX_CHARS.length) throw new Error(`${file} has more than 32 colours`);
      row += INDEX_CHARS[idx];
    }
    rows.push(row);
  }
  return { key, grid: 40, scale: 4, palette, rows };
}

export function spriteExportName(prefix: string, key: string): string {
  return `${prefix}${key}`.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function spriteSource(prefix: string, sprite: PixelSprite): string {
  return [
    `import type { PixelSprite } from "../types";`,
    ``,
    `export const ${spriteExportName(prefix, sprite.key)}: PixelSprite = {`,
    `  key: ${JSON.stringify(sprite.key)},`,
    `  grid: ${sprite.grid},`,
    `  scale: ${sprite.scale},`,
    `  palette: ${JSON.stringify(sprite.palette).replace(/,/g, ", ")},`,
    `  rows: [`,
    ...sprite.rows.map((r) => `    "${r}",`),
    `  ],`,
    `};`,
    ``,
  ].join("\n");
}

async function writeSheet(out: string, prefix: string, sprites: readonly PixelSprite[]) {
  const cell = 176;
  const tiles: Image[] = [];
  for (const ref of SHEET_REFERENCES) tiles.push(await loadImage(path.join(ASSETS_DIR, ref)));
  for (const s of sprites) tiles.push(await loadImage(renderSprite(s)));
  const cols = 9;
  const rows = Math.ceil(tiles.length / cols);
  const canvas = createCanvas(cols * cell, rows * (cell + 40));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SHEET_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  tiles.forEach((img, i) => {
    const x = (i % cols) * cell + 8;
    const y = Math.floor(i / cols) * (cell + 40) + 8;
    ctx.drawImage(img, x, y, 160, 160);
    ctx.drawImage(img, x + 64, y + 168, 32, 32); // still reads at emoji size?
  });
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`Sheet: ${out} (${SHEET_REFERENCES.length} shipped icons, then ${sprites.length} ${prefix}* icons)`);
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]) {
  const setName = arg(argv, "--set") ?? "cf";
  const set = SPRITE_SETS[setName];
  if (!set) throw new Error(`Unknown set "${setName}". Known: ${Object.keys(SPRITE_SETS).join(", ")}`);

  const importFile = arg(argv, "--import");
  if (importFile) {
    const key = arg(argv, "--key");
    if (!key) throw new Error("--import needs --key");
    const sprite = await importSprite(importFile, key);
    const errors = validateSprite(sprite);
    if (errors.length) throw new Error(errors.join("\n"));
    const out = path.join(SPRITES_DIR, set.dir, `${key}.ts`);
    fs.writeFileSync(out, spriteSource(set.prefix, sprite));
    console.log(`Imported ${importFile} -> ${out} (${sprite.palette.length - 1} colours)`);
    return;
  }

  const only = arg(argv, "--only")?.split(",");
  const sprites = only ? set.sprites.filter((s) => only.includes(s.key)) : set.sprites;
  const unknown = only?.filter((k) => !set.sprites.some((s) => s.key === k)) ?? [];
  const keys = set.sprites.map((s) => s.key);
  const errors = [
    ...unknown.map((k) => `--only: no sprite "${k}" in set ${setName}`),
    ...keys.filter((k, i) => keys.indexOf(k) !== i).map((k) => `duplicate key "${k}"`),
    ...sprites.flatMap(validateSprite),
  ];
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    process.exit(1);
  }

  const sheet = arg(argv, "--sheet");
  if (sheet) return writeSheet(sheet, set.prefix, sprites);
  if (argv.includes("--check")) {
    console.log(`${sprites.length} ${setName} sprites valid`);
    return;
  }

  let written = 0, unchanged = 0;
  for (const s of sprites) {
    const png = renderSprite(s);
    if (png.length > MAX_BYTES) {
      console.error(`${s.key}: ${png.length} bytes exceeds ${MAX_BYTES}`);
      process.exit(1);
    }
    const out = path.join(ASSETS_DIR, `${set.prefix}${s.key}.png`);
    if (fs.existsSync(out) && fs.readFileSync(out).equals(png)) { unchanged++; continue; }
    fs.writeFileSync(out, png);
    written++;
  }
  console.log(`${setName}: ${written} written, ${unchanged} unchanged`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
