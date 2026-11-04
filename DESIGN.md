# Fortuna Asset Style Guide

Last updated: 2026-10-29

Every image and application emoji in this repo follows this file: shop icons, animals, Lady Fortuna, banners, store pages, property and zoo scenes, card art, and every emoji derived from them. When an asset rule changes, change the code first (render script, mapping table), then this file.

| Area | Source of truth |
| --- | --- |
| Asset lookup (dist vs src) | `src/utils/assetPaths.ts` (`findAsset`, `assetPath`, `ASSET_DIRS`) |
| Build copy step | `src/scripts/copyAssets.js` (runs in `npm run build`, copies `src/assets` to `dist/assets`) |
| Shop icon file per item, and the `shop_` emoji family | `src/utils/shopItemAssets.ts` (`SHOP_ITEM_THUMBNAIL_ASSETS`) |
| Crime Families icon and art tables, and the `cf_` emoji family | `src/utils/crimeFamilyAssets.ts` (`CF_ASSETS`, `CF_ART`) |
| Emoji families (prefix, table, render mode) | `src/utils/applicationEmojiFamilies.ts` (`APPLICATION_EMOJI_FAMILIES`) |
| Emoji render and upload | `src/scripts/syncShopApplicationEmojis.ts` (`npm run validate:app-emojis`, `npm run sync:app-emojis -- --family <id>`; the `shop` aliases `validate:shop-emojis`/`sync:shop-emojis` still work) |
| Programmatic sprites | `src/scripts/generatePixelAssets.ts` (`npm run gen:pixel-assets`), sources in `src/data/sprites/<set>/` |
| Runtime emoji lookup by name | `src/utils/emojiRegistry.ts` (`initEmojiRegistry`, `emojiInline`) |
| Brand colours, legacy hardcoded emoji ids | `src/config/branding.ts` (`Mascot.Colors`, `Mascot.Emotes`, `AnimalEmojis`) |

## 1. Purpose and scope

- Fortuna is a life sim first. Art should read as a cosy 16-bit RPG, not a neon casino.
- Every UI surface is ComponentsV2. Art reaches Discord three ways: a Section **thumbnail** accessory, a **media gallery** item, or an **application emoji**.
- One payload holds at most 40 components. Each thumbnail costs a Section plus a Thumbnail; plan art per screen against that cap. `src/index.ts` swallows error 50035, so an oversized payload fails silently.

## 2. Style pillars

1. **Pixel art.** Every asset sits on an implied pixel grid (section 4). One logical pixel is a solid square block.
2. **Dark outline.** Objects and characters carry a 1-logical-pixel outline in near-black (`#000000` to `#201030`). Inner detail lines use the darkest tone of the local material, not pure black.
3. **Flat shading.** 2–3 tones per material (light, mid, shadow) plus an optional 1-pixel specular highlight. Light comes from the top left.
4. **Limited palette.** 16–32 colours per icon, up to 48 per scene. Reuse the palette in section 3.
5. **No anti-aliasing, blur or glow.** No soft drop shadows, no vignette, no gradient skies, no bloom on text.
6. **Transparent background** for icons, animals and characters (alpha 0 outside the outline). **Opaque** background for banners, store pages and scenes.
7. **Readable at small size.** Every icon must still read as its object at 32 px (emoji) and about 80 px (thumbnail).

## 3. Palette

Brand colours from `src/config/branding.ts:125-129`, plus colours sampled from the shipped art.

| Name | Hex | Use |
| --- | --- | --- |
| Base (brand) | `#9B59B6` | Container accent, Lady Fortuna hair midtone; also `PROPERTY_ACCENT_COLOR` (`properties.ts:32`) |
| Success (brand) | `#2ECC71` | Success accents, profit, green chips |
| Fail (brand) | `#E74C3C` | Failure accents, loss, red marks on maps and crime art |
| Outline | `#000000` / `#100010` | 1 px outline on every object and character |
| Deep purple outline | `#201030` | Outline and shadow on purple objects (counterfeit kit case) |
| Hair light | `#B060C0` | Lady Fortuna hair highlight |
| Hair mid | `#A858B8` | Lady Fortuna hair base |
| Hair shadow | `#502060` / `#401850` | Lady Fortuna hair shadow, purple fabric shadow |
| Outfit purple | `#503050` / `#482848` | General Store outfit, cap |
| Gold light | `#E0A000` | Coins, buckles, title text fill, trims |
| Gold mid | `#D09000` | Gold base tone |
| Gold shadow | `#A06000` | Gold shadow |
| Gold dark | `#402000` | Gold outline and engraving |
| Parchment light | `#D09050` | Maps, scrolls, documents |
| Parchment mid | `#B08040` | Parchment base |
| Leather / wood | `#805020` | Straps, rifle stocks, crates, signs |
| Placard cream | `#F0E8D8` | Banner title placard fill, banner title letters |
| Banner navy | `#101840` | Guide banner background |
| Night slate | `#182030` / `#283040` | Black market and night scene walls |
| Suit navy | `#385880` / `#203050` | Lady Fortuna business suit in banners |
| Store page black | `#000000` | Store page background |
| Store plate tan | `#886840` | Store page name plates and price frames |
| Steel | `#303030` / `#404040` / `#505050` | Gloves, rifles, padlock shackle (3-tone grey ramp) |
| Fur grey | `#606060` / `#808080` / `#D0D0D0` | Wolf and grey animals |
| Magenta | `#B03060` | Padlock body, accent items |

Crime Families art adds no new hues: use night slate, outline, gold, leather and Fail red. Family colours are tints of these, never neon.

## 4. Size classes

New assets must hit these exact sizes. The "observed" column records drift measured in shipped files (logical-pixel pitch from an edge-comb FFT, alpha bounding box, unique colours); do not copy the drift.

| Class | Pixels | Background | Grid x scale | Used for | Example file | Discord surface | Observed drift |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Icon | 160x160 | Transparent | 40x40 x4 | Shop items, crew items, emoji sources | `counterfeit kit.png` (pitch 3.98) | Thumbnail, emoji | `thieves gloves.png` is near 40; `lucky coin.png` is about 36x33 (pitch 4.4/4.8), `dice.png` 32x32 x5, `padlock.png` about 36; 31 mapped shop icons are 1024x1024, 4 are 500x500, 1 is 1254x1254 |
| Small animal | 225x225 | Transparent | 45x45 x5 (new art only) | Hunt and zoo animals | none shipped on this grid | Thumbnail, emoji | `wolf.png` is 32x32 x7, `boar.png` about 48 cells; 8 animals are irregular (148–246 px wide) |
| Large character | 500x500 | Transparent | 250x250 x2 | Lady Fortuna store mascots, legendary animals | `beg_thumbnail.png` (exactly 200x200 x2.5) | Thumbnail | `generalstore_mascot.png` about 178 cells (pitch 2.8), `cockstore_mascot.png` about 189; `white tiger.png` is 100x100 x5; `jobstore_fortuna.png` 328x328, `unistore_fortuna.png` 452x552 |
| Banner | 960x336 | Opaque | 240x84 x4 | Command headers (casino, guide, stock, black market) | `stock_market.jpg` (968x336, clean 242x84 x4) | Media gallery | 964x332, 968x336, 1024x336, 1024x335 in use; `guide_banner.png` (used, `branding.ts:123`) has no placard, a glowing title and Fortuna on the left; `assets/black_market.png` is referenced by no code |
| Store page | 1254x1254 | Opaque | 209x209 x6 | 3x3 item grid with names and prices | `hunt_store1.png` (no clean 6 px period) | Media gallery | `cosmetics_pg*.png` 1295x1214 |
| Scene | 1024x1024 or 1536x1024 | Opaque | 128 x8 / 192x128 x8 | Zoo scenes, canvas backgrounds | `cockfight_bg.png` (1024x559) | Media gallery, thumbnail, canvas | `mini zoo.png` 1402x1122; `roulette_guide.png` 1024x419; `shack.png` is really a cut-out: 59.5% alpha 0 plus 24.5% semi-transparent |
| Property cut-out | about 550x450 | Transparent | none measured; legacy only | House, apartment, mansion, island | `mansion.png` (555x450) | Thumbnail | `house.png` 530x471, `apartment.png` 558x447; no new art in this class until a grid is set |
| Emoji (derived) | 128x128 | Transparent | rendered, not drawn | Inline emoji | generated by the sync script | Emoji | none |

Discord shows a thumbnail at about 80 px and an inline emoji at about 22 px (48 px jumbo). Design for those sizes, deliver at the class size.

## 5. Composition rules

**Icon (160).** One object, centred, spanning 36–38 of the 40 cells on its longer axis (a 1–2-cell margin, like the shipped icons, which fill about 90–98%); the emoji renderer's padding supplies the breathing room. Three-quarter top view for boxes, cases and devices; front view for flat items (coins, cards, documents). No ground shadow, no background, no text except one short glyph if the object needs it (a skull on a contract, `$` on a bag). Silhouette must be recognisable as a solid black shape, and no two icons in one family may share a silhouette at 32 px.

**Small animal (225).** Full body, standing or sitting, facing the viewer or three-quarter left, feet at the bottom 10% line. No ground, no shadow.

**Large character (500).** Lady Fortuna: young woman, long straight purple hair (section 3 hair ramp) to the waist, purple eyes, light skin, soft smile, three-quarter view, framed from head to mid-thigh with the bottom edge cropping the figure and about 5% margin at the top and sides, holding one prop that names the store or feature. Outfit is themed to the surface (General Store: purple cap with a gold clover badge and feather, purple caped coat, cream blouse, brown belt and pouches, gold chains; Hunt Store: camo cap and jacket, rifle on the shoulder; banners: navy business suit). Keep purple, black and gold in every outfit. A crime family outfit is a black or charcoal pinstripe suit with a purple shirt and gold tie pin and cufflinks, plus a fedora with a purple band.

**Banner (960x336).** A full scene of the location, Lady Fortuna in the centre third from the waist up, presenting with an open hand. The title sits on a cream placard (`#F0E8D8`, 2-pixel dark frame) across the top centre, or on a wooden sign or cloth banner on posts for outdoor scenes (`cockfight_bg.png`). Title text is a blocky pixel font, cream or gold fill, 1 px black outline, two lines max: `FORTUNA'S <PLACE>` and `- <TAGLINE>!`. Keep text clear of the outer 16 px; Discord crops gallery corners.

**Store page (1254x1254).** Black background. 3 columns x 3 rows of item tiles. Each tile: rounded square card with a tan (`#886840`) 2-pixel frame and a near-black fill, the item icon centred in the top 70%, a tan name plate with dark pixel caps text at the bottom of the card, and a separate price bar below it (currency icon, then the price in cream digits with thousands separators). Prices on the page must equal `shopCatalog.ts`; a page is regenerated whenever a price changes.

**Scene (1024 class).** Location art with ground and sky, opaque edge to edge, no vignette or fade to transparency. Canvas backgrounds (`imageUtils.ts:13,78`) keep the centre clear for drawn overlays.

## 6. Naming and location

- New files go in `src/assets/`. `copyAssets.js` mirrors it to `dist/assets/`; resolve paths from `__dirname` via `findAsset`/`assetPath`, never `process.cwd()`.
- The repo-root `assets/` directory is searched second by `findAsset` (`assetPaths.ts:21-23`), but no code names any file in it today. Do not add new art there.
- Existing files use lowercase names with spaces and some typos (`gaurd vest.png`, `pheonix serum.png`, `squirel.png`, `artic wolf.png`, `komodo dragonm.png`). Leave them: mapping tables absorb the names, and renaming breaks lookups.
- New files: lowercase, `[a-z0-9_]` only, `.png`, family prefix first. Crime Families art is `cf_<key>.png` (for example `cf_vault.png`), so the file name, the table key and the emoji name line up.
- No spaces, apostrophes or dashes in new names. Attachment names are derived with `fileName.replace(/\s+/g, "_")` (`shopItemAssets.ts:116`); that does not remove the apostrophe in `hunter's compass.png`.
- No copyrighted or trademarked characters, logos, weapons brands or real casino brands. Lady Fortuna is the only recurring character.
- `dashboard/public/art/` holds kebab-case copies for the website (`white-tiger.png`). Copy into it by hand when the site needs a piece; never reference bot paths from the dashboard.

## 7. Emoji derivation

An application emoji is never drawn by hand. It is rendered from the icon file by the sync script.

| Rule | Value | Source |
| --- | --- | --- |
| Canvas | 128x128 PNG, transparent | `syncShopApplicationEmojis.ts:20,84-86` |
| Padding | 8 px each side (art fits a 112x112 box, aspect kept, centred, smoothed) | `:21,87-95` |
| Pixel-grid families (`pixelGrid` set, e.g. `cf`: 40) | Nearest-neighbour at an integer cell scale: 40 cells x 3 px = 120 px art, 4 px padding; source must be square and a multiple of the grid. Smoothed 160 to 112 blurs 4 px cells, against pillar 5 | `applicationEmojiFamilies.ts` |
| Max size | 256 KiB after PNG compression level 9 | `:22,97-100` |
| App emoji cap | 2,000 per application | `:23,260` |
| Name | prefix + key lowercased, non `[a-z0-9_]` to `_`, runs collapsed, trimmed, cut to 32, trailing `_` stripped; must match `^[a-z0-9_]{2,32}$` | `shopItemAssets.ts:11-24`, sync `:125` |
| Families | `shop_` (shop items, 63 entries), `cf_` (Crime Families, 24) | `SHOP_APPLICATION_EMOJI_PREFIX`, `CF_APPLICATION_EMOJI_PREFIX` |
| Prefix rule | No family prefix may start with another family's prefix. `cf_` leaves 29 characters for the key and is reserved for Crime Families even though `cf` is the coinflip command alias; coinflip art uses `coin_` | prune matches by `startsWith` (`:300`) |
| Runtime lookup | By name: `cfEmoji("vault")` / `emojiInline("cf_vault")`, resolved at render time, never in a module-level constant (it would run before the registry loads). Managed-prefix names are never filled from guild emojis. No id goes in code | `emojiRegistry.ts:60-99,133-137` |

- **One source table per family.** `SHOP_ITEM_THUMBNAIL_ASSETS` maps item key to file and is both the thumbnail source and the emoji source. Crime Families gets one table, `key -> file`, used the same way.
- **Extend the sync script, do not fork it.** Generalise the script over a list of families (`{ prefix, assets, validKeys }`); the shop family keeps reading `SHOP_CATALOG` read-only for validation. `npm run sync:shop-emojis` keeps working.
- **Commands:** `npm run validate:app-emojis` renders every family's emojis without contacting Discord. `npm run sync:app-emojis -- --family <id>` uploads missing ones; `--replace` swaps images via a `<prefix>tmp_<sha256>` upload, delete and rename; `--plan` logs in and prints would-create/replace/prune without changing anything (run it before the first `--prune`); `--prune` deletes stale emojis of the selected family only, after a run with zero failures.
- `src/data/emojis.json` is committed as `{}`; restore it before committing art. `src/scripts/checkV2Payloads.ts` seeds its fake ids in memory only (`setEmojiRecord`) and never writes the file. Run it with a dead database URL so it cannot reach live data: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- Do not add new `<:name:id>` strings to `branding.ts`. Those ids break on any re-upload; registry lookup by name does not.

## 8. Production paths

### A. AI image tool

The shipped art came from image models. 47 PNGs in `src/assets`, all 1024 px or larger, carry an OpenAI C2PA manifest (`claim_generator: OpenAI Media Service API`, `softwareAgent: gpt-image`, created 2026-05-10 to 2026-07-14); the provenance of the 500 px, banner and 160 px classes is unknown (none carries a manifest); `cockfight_bg.png` shows a Gemini sparkle watermark. The 160 px icons are downscaled with smoothing, which is why each holds about 4–6% semi-transparent edge pixels and up to about 12,800 unique colours. The `@google/generative-ai` dependency is not part of this pipeline. Running a prompt needs an image-model account the repo does not hold; the person producing art runs it outside the repo.

Prompt template (fill the brackets):

```
16-bit pixel art [icon | character sprite | game banner] of [subject], [view: three-quarter top view | front view],
SNES / GBA era RPG item sprite, crisp hard-edged square pixels on a visible [40x40] grid,
1-pixel near-black outline, flat cel shading with 2-3 tones per material, light from top left,
limited palette of purple #9B59B6, gold #E0A000, parchment #B08040, slate #182030, near-black #100010,
single object centered with 5% empty margin, plain solid [key colour] background, no ground.
```

Key colour: `#00FF00` for Lady Fortuna and any subject with purple or magenta in it; `#FF00FF` otherwise. The key must never occur in the subject (a 50/50 blend of the hair ramp and magenta falls outside a 12% fuzz and survives as a pink halo).

Banners: ChatGPT's image tool returns a wide render (2172x724 in practice) when asked for a 2.86:1 banner; crop it centred to 2.857:1 (2068x724). If the tool returns 1536x1024 instead, crop the middle 1536x538 band (from y=243 by default), so compose everything, placard included, inside that band.

For Lady Fortuna add: `young woman with long straight purple hair, purple eyes, soft smile, three-quarter view, head to mid-thigh, [outfit], holding [prop], purple black and gold colour scheme`.

Negative terms: `anti-aliasing, blur, soft shadow, drop shadow, glow, bloom, gradient, vignette, depth of field, noise, painterly, photorealistic, 3D render, voxel, text, watermark, signature, logo, checkerboard, transparency grid, frame, border, background scenery`.

Post-process every AI render, in order:

1. Key out the background to alpha 0 by flood fill from the four corners (`-fuzz 10% -fill none -draw "color 0,0 floodfill"` per corner), never a global `-transparent`, which also deletes interior pixels near the key. Never trust a "transparent" render: `cheat sheet.png` shipped with a baked-in checkerboard.
2. Crop to the class aspect, then area (box) downscale to the class grid (section 4), then nearest-neighbour upscale by the class factor. A point-sampled, non-integer downscale breaks 1-px outlines and placard letters. **Exception, banners:** box-downscale straight to 960x336 and skip steps 3–4 (no grid snap, no colour cap). The shipped banners are smooth downscales with about 70k–120k colours, and a 240x84 grid makes a two-line placard unreadable (measured on the Crime Families banners, 2026-11-04).
3. Quantise to at most 32 colours, no dithering.
4. Threshold alpha: below 128 becomes 0, the rest 255.
5. Crop or pad to the exact class size, object centred.
6. Strip metadata (C2PA, text chunks) to save bytes.

### B. Programmatic sprite (node `canvas`)

For small icons and emoji-first art, author the grid and render it. Start from a reference, not a blank grid: render the subject with the 8A icon prompt, reduce it to the grid (`-filter box -resize 40x40! -channel A -threshold 50% +channel +dither -colors 24`), import it with `npm run gen:pixel-assets -- --import ref_<key>.png --key <key>`, then hand-finish the outline, palette and tones. A blank 40x40 grid drifts flatter than the shipped icons.

| Class | Grid | Scale | Output |
| --- | --- | --- | --- |
| Icon | 40x40 | x4 | 160x160 |
| Small animal | 45x45 | x5 | 225x225 |
| Large character | 250x250 | x2 | 500x500 |
| Banner | 240x84 (programmatic banners only; AI banners use the 8A exception) | x4 | 960x336 |

Sprite source format: a palette array and one string per row, one character per cell.

```ts
export const CF_VAULT_SPRITE = {
  key: "vault", // unprefixed; the script adds the family prefix to the file name
  grid: 40,
  scale: 4,
  palette: ["transparent", "#100010", "#303030", "#404040", "#505050", "#E0A000", "#A06000"], // index 0 = alpha 0
  rows: [ /* 40 strings of 40 chars, "0"-"9" then "a"-"v" index the palette (max 32 entries) */ ],
};
```

Render rules: `createCanvas(grid * scale, grid * scale)`, `ctx.imageSmoothingEnabled = false`, one `fillRect(x * scale, y * scale, scale, scale)` per non-zero cell, `toBuffer("image/png", { compressionLevel: 9 })`, written to `src/assets/cf_<key>.png`. Validate that every row has `grid` characters, every index exists in the palette, and the opaque bounding box spans at least 36 cells. The family table is derived from the sprite list, so there is one source. `--sheet <out.png>` tiles the set beside shipped icons at 160 px and 32 px for sign-off. The renderer is pure file I/O: no Prisma, no Redis, no `.env`.

## 9. QA checklist before commit

- [ ] Exact class size (section 4); check with `magick identify`.
- [ ] Icons, animals, characters: PNG with alpha; corners and margin are alpha 0.
- [ ] No semi-transparent pixels: every alpha is 0 or 255 (shipped icons fail this at 4–6%; new art must not).
- [ ] No opaque pixel within 20 RGB units of the key colour (no halo).
- [ ] No baked checkerboard, watermark, signature or generator sparkle.
- [ ] Banners, pages, scenes: fully opaque, no vignette or fade; banner placard fully inside, at least 16 px from every edge, text spelled correctly (else stamp it with the pixel font).
- [ ] Unique colour count at or under 32 per icon (48 per scene).
- [ ] Icon object spans 36–38 of 40 cells; no shared silhouette within the family.
- [ ] Byte size: icon under 64 KiB, character under 400 KiB, banner under 700 KiB, page under 2 MiB. Emoji render under 256 KiB (enforced by the script).
- [ ] `npm run validate:app-emojis` and `npm run gen:pixel-assets -- --check` pass after adding a table entry or sprite.
- [ ] Emoji preview downscaled to 32 px still names the object.
- [ ] The owner has signed off the `--sheet` contact sheet (new icons beside shipped ones) before any emoji sync.
- [ ] File name is `[a-z0-9_]+\.png`; attachment name has no spaces or apostrophes.
- [ ] Every new screen stays at or under 40 components with its thumbnails counted.
- [ ] Store page prices match `shopCatalog.ts`.

## 10. Do and don't

| Do | Don't |
| --- | --- |
| Hit the class size exactly | Ship 1024 px icons as shop thumbnails (31 legacy files do; do not add more) |
| Keep a 1 px near-black outline | Outline with grey or coloured glow |
| Use 2–3 flat tones per material | Use gradients, airbrush, soft shadows |
| Key a flat background and threshold alpha | Trust a model's "transparent background" |
| Put new art in `src/assets` | Put new art in repo-root `assets/` |
| Add a row to the family's source table | Hardcode `<:name:id>` in `branding.ts` |
| Look emojis up by name with `emojiInline` | Copy emoji ids into code or `emojis.json` |
| Extend the sync script with a family entry | Fork a second sync script |
| Use `findAsset` to resolve files | Write a new `path.resolve(__dirname, "../../assets")` resolver |
| Keep Lady Fortuna's purple hair and purple/black/gold palette | Give her a different hair colour or face per store |
| Keep text on banners short, pixel font, inside the safe area | Put text on icons or emoji |
| Use original subjects | Use copyrighted characters, real brands or real logos |
