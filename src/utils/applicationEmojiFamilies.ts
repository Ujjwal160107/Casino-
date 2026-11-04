import { SHOP_CATALOG } from "./shopCatalog";
import { SHOP_ITEM_THUMBNAIL_ASSETS } from "./shopItemAssets";
import { CF_ASSETS } from "./crimeFamilyAssets";
import { CF_APPLICATION_EMOJI_PREFIX, SHOP_APPLICATION_EMOJI_PREFIX } from "./applicationEmojiNames";

// The application emoji families the sync script manages (spec 20.4).
// Imported by the script and tests only; the runtime reads just the prefixes
// (applicationEmojiNames.ts). A new family is a new entry, not a new branch.

export type ApplicationEmojiFamily = {
  id: "shop" | "cf";
  prefix: string;                              // "shop_" | "cf_"
  assets: Readonly<Record<string, string>>;    // key -> file name in src/assets
  validKeys: ReadonlySet<string>;              // shop: SHOP_CATALOG keys (read only); cf: keys of CF_ASSETS
  pixelGrid?: number;                          // cf: 40 (nearest-neighbour integer render); shop: unset (smoothed, off-grid sources)
};

export const APPLICATION_EMOJI_FAMILIES: readonly ApplicationEmojiFamily[] = [
  { id: "shop", prefix: SHOP_APPLICATION_EMOJI_PREFIX, assets: SHOP_ITEM_THUMBNAIL_ASSETS, validKeys: new Set(SHOP_CATALOG.map((i) => i.key)) },
  { id: "cf", prefix: CF_APPLICATION_EMOJI_PREFIX, assets: CF_ASSETS, validKeys: new Set(Object.keys(CF_ASSETS)), pixelGrid: 40 },
];

export const MANAGED_EMOJI_PREFIXES = APPLICATION_EMOJI_FAMILIES.map((f) => f.prefix);

/** Throws when two families share an id or one prefix starts with another's (their prunes would overlap). */
export function assertFamilyRegistry(families: readonly ApplicationEmojiFamily[]): void {
  const ids = new Set<string>();
  for (const f of families) {
    if (ids.has(f.id)) throw new Error(`Duplicate application emoji family id "${f.id}".`);
    ids.add(f.id);
    const overlap = families.find((o) => o !== f && f.prefix.startsWith(o.prefix));
    if (overlap) throw new Error(`Emoji prefix "${f.prefix}" (${f.id}) starts with "${overlap.prefix}" (${overlap.id}).`);
  }
}

/** Existing names in this family's prefix that no desired emoji claims. */
export function pruneCandidates(
  existingNames: readonly string[],
  family: ApplicationEmojiFamily,
  desiredNames: ReadonlySet<string>,
): string[] {
  return existingNames.filter((name) => name.startsWith(family.prefix) && !desiredNames.has(name));
}

/** The families named by `--family` (null: all), in registry order. */
export function selectFamilies(ids: string[] | null): ApplicationEmojiFamily[] {
  if (ids === null) return [...APPLICATION_EMOJI_FAMILIES];
  const unknown = ids.filter((id) => !APPLICATION_EMOJI_FAMILIES.some((f) => f.id === id));
  if (unknown.length > 0) {
    throw new Error(`Unknown emoji famil${unknown.length === 1 ? "y" : "ies"}: ${unknown.join(", ")}. Known: ${APPLICATION_EMOJI_FAMILIES.map((f) => f.id).join(", ")}.`);
  }
  return APPLICATION_EMOJI_FAMILIES.filter((f) => ids.includes(f.id));
}
