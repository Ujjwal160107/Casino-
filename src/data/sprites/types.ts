/**
 * A pixel-art icon stored as a grid (DESIGN.md section 8B). The committed
 * source of truth; `npm run gen:pixel-assets` renders it to src/assets.
 */
export type PixelSprite = {
  /** Unprefixed key ("vault"); the set's prefix makes the file name. */
  key: string;
  grid: 40;
  scale: 4;
  /** Index 0 is "transparent"; at most 32 entries. */
  palette: string[];
  /** `grid` strings of `grid` chars; "0"-"9" then "a"-"v" index the palette. */
  rows: string[];
};
