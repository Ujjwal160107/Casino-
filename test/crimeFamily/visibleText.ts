// The text a player can see in a payload: every value under a text-bearing key,
// builders toJSON()ed first. customIds, URLs, media, attachment files and emoji
// names are skipped.
const TEXT_KEYS = new Set(["content", "label", "placeholder", "description", "title", "value", "name"]);
const SKIP_KEYS = new Set(["emoji", "custom_id", "customId", "url", "media", "files"]);

function walk(node: unknown, key: string | null, out: string[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === "object" && typeof (node as { toJSON?: unknown }).toJSON === "function") {
    walk((node as { toJSON: () => unknown }).toJSON(), key, out);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, key, out);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_KEYS.has(k)) continue;
      walk(v, k, out);
    }
    return;
  }
  if (typeof node === "string" && key !== null && TEXT_KEYS.has(key)) out.push(node);
}

/** Every player-visible string in a payload, joined by newlines. */
export function visibleText(payload: unknown): string {
  const out: string[] = [];
  walk(payload, null, out);
  return out.join("\n");
}
