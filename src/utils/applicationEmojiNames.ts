import fs from "fs";
import { findAsset } from "./assetPaths";

// Names and files of the bot's managed application emojis. The prefixes live
// here, not in the family registry, so the runtime emoji registry can import
// them without pulling in every family's tables (P18).

export const SHOP_APPLICATION_EMOJI_PREFIX = "shop_";
export const CF_APPLICATION_EMOJI_PREFIX = "cf_";

/** Prefixes owned by the emoji sync script; a guild emoji may never fill one of these names. */
export const RUNTIME_MANAGED_PREFIXES: readonly string[] = [SHOP_APPLICATION_EMOJI_PREFIX, CF_APPLICATION_EMOJI_PREFIX];

/**
 * Stable Discord application-emoji name for a managed key.
 * Discord emoji names support lowercase letters, numbers, and underscores.
 */
export function applicationEmojiName(prefix: string, key: string): string {
  const normalizedKey = key
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = `${prefix}${normalizedKey}`.slice(0, 32).replace(/_+$/g, "");

  if (!normalizedKey || name.length < 2) {
    throw new Error(`Cannot create a valid application emoji name for "${prefix}${key}".`);
  }

  return name;
}

export type TableAsset = { fileName: string; filePath: string; attachmentName: string };

/** The file behind `key` in an asset table, or null when it is unmapped or missing on disk. */
export function resolveTableAsset(table: Readonly<Record<string, string>>, key: string): TableAsset | null {
  const fileName = table[key];
  if (!fileName) return null;

  const filePath = findAsset(fileName);
  if (!filePath || !fs.statSync(filePath).isFile()) return null;

  return { fileName, filePath, attachmentName: fileName.replace(/\s+/g, "_") };
}
