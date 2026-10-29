import type { PixelSprite } from "../data/sprites/types";

/** Palette index characters: "0"-"9" then "a"-"v" (32 entries). */
export const INDEX_CHARS = "0123456789abcdefghijklmnopqrstuv";

/** An icon fills 36-38 of its 40 cells, like the shipped icons (DESIGN.md section 5). */
const MIN_SPAN = 36;

/** Every problem with a sprite grid, naming the row and column; empty when valid. */
export function validateSprite(sprite: PixelSprite): string[] {
  const errors: string[] = [];
  const where = `sprite "${sprite.key}"`;
  if (!/^[a-z0-9_]{2,29}$/.test(sprite.key)) errors.push(`${where}: key must match [a-z0-9_]{2,29}`);
  if (sprite.palette.length > INDEX_CHARS.length) errors.push(`${where}: palette has ${sprite.palette.length} colours (max 32)`);
  if (sprite.palette[0] !== "transparent") errors.push(`${where}: palette[0] must be "transparent"`);
  sprite.palette.slice(1).forEach((c, i) => {
    if (!/^#[0-9A-F]{6}$/i.test(c)) errors.push(`${where}: palette[${i + 1}] "${c}" is not #RRGGBB`);
  });
  if (sprite.rows.length !== sprite.grid) errors.push(`${where}: ${sprite.rows.length} rows, expected ${sprite.grid}`);

  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  sprite.rows.forEach((row, y) => {
    if (row.length !== sprite.grid) errors.push(`${where}: row ${y} has ${row.length} cells, expected ${sprite.grid}`);
    [...row].forEach((ch, x) => {
      const idx = INDEX_CHARS.indexOf(ch);
      if (idx < 0 || idx >= sprite.palette.length) {
        errors.push(`${where}: row ${y} col ${x} "${ch}" is not a palette index`);
      } else if (idx > 0) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    });
  });
  const span = Math.max(maxX - minX + 1, maxY - minY + 1);
  if (maxX >= 0 && span < MIN_SPAN) errors.push(`${where}: object spans ${span} cells, needs at least ${MIN_SPAN}`);
  return errors;
}
