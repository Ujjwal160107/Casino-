import fs from "fs";
import path from "path";

/**
 * Where bundled art lives.
 *
 * Resolved from __dirname, never process.cwd(). In production the bot runs from
 * /opt/fortuna/current with its compiled code in dist/, so a cwd-relative path
 * like "src/assets" points at a source tree the release has no reason to ship --
 * and when it stopped shipping, seventeen call sites silently stopped finding
 * their images. A missing image left a ComponentsV2 Section with no accessory,
 * which throws at toJSON and destroys the whole reply.
 *
 * __dirname lands on dist/assets in production and src/assets under ts-node,
 * because copyAssets.js mirrors one into the other at build time. Both work
 * without the caller knowing which it is.
 */
const BUNDLED = path.resolve(__dirname, "..", "assets");

/** The repo-root assets/ directory, which ships alongside dist/. */
const ROOT = path.resolve(__dirname, "..", "..", "assets");

export const ASSET_DIRS: readonly string[] = [BUNDLED, ROOT];

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

/**
 * Absolute path to a bundled asset, or null when it isn't there.
 *
 * `name` may include an extension or omit it, in which case the common image
 * extensions are tried in order.
 */
export function findAsset(name: string): string | null {
    for (const dir of ASSET_DIRS) {
        if (path.extname(name)) {
            const direct = path.join(dir, name);
            if (fs.existsSync(direct)) return direct;
            continue;
        }
        for (const ext of IMAGE_EXTENSIONS) {
            const candidate = path.join(dir, `${name}${ext}`);
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return null;
}

/**
 * Absolute path to a bundled asset whether or not it exists.
 *
 * For callers that only need a path to hand to AttachmentBuilder and already
 * tolerate a missing file. Prefer findAsset when the result gates rendering.
 */
export function assetPath(name: string): string {
    return path.join(BUNDLED, name);
}
