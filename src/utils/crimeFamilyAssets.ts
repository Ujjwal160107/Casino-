import { AttachmentBuilder } from "discord.js";
import { Mascot } from "../config/branding";
import { CF_SPRITES } from "../data/sprites/cf";
import { applicationEmojiName, CF_APPLICATION_EMOJI_PREFIX, resolveTableAsset } from "./applicationEmojiNames";
import { emojiInline } from "./emojiRegistry";

// Crime Families art (spec 16, 20.4). Icons double as `cf_` application
// emojis; the larger art is sent only as attachments. Every lookup runs at
// render time: the emoji registry is empty until initEmojiRegistry.

export { CF_APPLICATION_EMOJI_PREFIX };

/** The 24 pixel icons: key -> `cf_<key>.png`, one per sprite. */
export const CF_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  CF_SPRITES.map((s) => [s.key, `${CF_APPLICATION_EMOJI_PREFIX}${s.key}.png`]),
);

/** Attachments only, never emojis: the mascot and the banners. Any may be absent (D66). */
export const CF_ART: Readonly<Record<string, string>> = {
  fortuna_don: "cf_fortuna_don.png",
  caper_t1: "cf_caper_t1.png",
  caper_t2: "cf_caper_t2.png",
  caper_t3: "cf_caper_t3.png",
  caper_t4: "cf_caper_t4.png",
  result_clean: "cf_result_clean.png",
  result_messy: "cf_result_messy.png",
  result_bust: "cf_result_bust.png",
  turf_map: "cf_turf_map.png",
  war_banner: "cf_war_banner.png",
};

/** Inline `<:cf_key:id>` for a loaded icon (key without "cf_"), else undefined. */
export function cfEmoji(key: string): string | undefined {
  return emojiInline(applicationEmojiName(CF_APPLICATION_EMOJI_PREFIX, key));
}

/** A CF_ART or CF_ASSETS file as an attachment, or null when the file is missing. */
export function cfAttachment(key: string): { attachment: AttachmentBuilder; url: string } | null {
  const asset = resolveTableAsset(CF_ART, key) ?? resolveTableAsset(CF_ASSETS, key);
  if (!asset) return null;
  return {
    attachment: new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }),
    url: `attachment://${asset.attachmentName}`,
  };
}

/** The emote a family DM notice shows as its thumbnail: the icon, or the Gun while it is not loaded. */
export function cfNoticeEmote(key: string): string {
  return cfEmoji(key) ?? Mascot.Emotes.Gun;
}
