import fs from "fs";
import path from "path";
import { Client, Guild } from "discord.js";

let APP_EMOJIS: Record<string, { id: string; name?: string; animated?: boolean }> = {};
try {
  const mod = require("../config/emojis");
  if (mod && typeof mod.APP_EMOJIS === "object") APP_EMOJIS = mod.APP_EMOJIS;
} catch {}

export type EmojiRecord = { id: string; name: string; animated?: boolean };

const registry = new Map<string, EmojiRecord>();

const DATA_PATH = path.join(__dirname, "..", "data", "emojis.json");

function readPersisted(): Record<string, EmojiRecord> {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    console.warn("emojiRegistry: Failed to read persisted emojis:", e);
    return {};
  }
}

function writePersisted(obj: Record<string, EmojiRecord>) {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error("emojiRegistry: Failed to write persisted emojis:", e);
  }
}

export async function initEmojiRegistry(client: Client): Promise<void> {
  // 1. Hardcoded APP_EMOJIS from config
  try {
    if (APP_EMOJIS && typeof APP_EMOJIS === "object") {
      for (const [key, v] of Object.entries(APP_EMOJIS)) {
        if (!v || !v.id) continue;
        registry.set(key, { id: v.id, name: v.name ?? key, animated: !!v.animated });
      }
    }
  } catch (e) {
    console.warn("emojiRegistry: failed loading APP_EMOJIS", e);
  }

  // 2. Persisted emojis from disk
  try {
    const persisted = readPersisted();
    for (const [key, rec] of Object.entries(persisted)) {
      if (rec && rec.id) registry.set(key, { id: rec.id, name: rec.name ?? key, animated: !!rec.animated });
    }
  } catch (e) {
    console.warn("emojiRegistry: failed loading persisted emojis", e);
  }

  // 3. Application emojis (uploaded to the bot application itself — no guild needed)
  try {
    await client.application?.fetch();
    const appEmojis = await (client.application as any)?.emojis?.fetch?.();
    if (appEmojis) {
      appEmojis.forEach((e: any) => {
        if (e.name && e.id) {
          registry.set(e.name, { id: e.id, name: e.name, animated: !!e.animated });
        }
      });
      console.log(`emojiRegistry: loaded ${appEmojis.size} application emojis`);
    }
  } catch (e) {
    console.warn("emojiRegistry: failed to fetch application emojis:", e);
  }

  // 4. Guild emoji cache
  try {
    client.emojis.cache.forEach((e) => {
      if (e.name && !registry.has(e.name)) registry.set(e.name, { id: e.id, name: e.name, animated: e.animated });
    });
  } catch (e) {
    console.warn("emojiRegistry: error discovering client emoji cache", e);
  }

  // 5. Optional storage guild for extra emojis
  const storGuildId = process.env.EMOJI_GUILD_ID;
  if (storGuildId) {
    try {
      const guild = client.guilds.cache.get(storGuildId) ?? (await client.guilds.fetch(storGuildId).catch(() => null));
      if (guild) {
        await (guild as Guild).emojis.fetch().catch(() => null);
        (guild as Guild).emojis.cache.forEach((e) => {
          if (e.name && !registry.has(e.name)) registry.set(e.name, { id: e.id, name: e.name, animated: e.animated });
        });
      }
    } catch (e) {
      console.warn("emojiRegistry: failed to fetch emojis from storage guild:", e);
    }
  }
}

export function setPersistedEmoji(key: string, rec: EmojiRecord) {
  try {
    const obj = readPersisted();
    obj[key] = rec;
    writePersisted(obj);
    registry.set(key, rec);
  } catch (e) {
    console.error("emojiRegistry: failed to persist emoji mapping:", e);
  }
}

export function getEmojiRecord(key: string): EmojiRecord | undefined {
  return registry.get(key);
}

export function emojiCdnUrl(id?: string, animated = false): string | undefined {
  if (!id) return undefined;
  const ext = animated ? "gif" : "png";
  return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=256&quality=lossless`;
}

export function emojiIconUrl(key: string): string | undefined {
  const r = getEmojiRecord(key);
  if (!r) return undefined;
  return emojiCdnUrl(r.id, !!r.animated);
}

/**
 * Returns inline emoji string. Works for both app emojis and guild emojis.
 * App emojis don't require a guild — they are formatted directly from registry.
 */
export function emojiInline(key: string, guild?: Guild | null): string | undefined {
  const r = getEmojiRecord(key);
  if (!r) return undefined;
  return r.animated ? `<a:${r.name}:${r.id}>` : `<:${r.name}:${r.id}>`;
}

export function preferEmojiInlineOrUrl(key: string, guild?: Guild | null) {
  const inline = emojiInline(key, guild);
  if (inline) return { type: "inline", value: inline } as const;
  const url = emojiIconUrl(key);
  if (url) return { type: "url", value: url } as const;
  return null;
}

export function listEmojiKeys(): string[] {
  return Array.from(registry.keys());
}
