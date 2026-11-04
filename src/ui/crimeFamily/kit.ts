// The Crime Families UI kit: the one payload wrapper (no pings, V2 flag),
// art that degrades when a file is missing (D66), emoji helpers that run at
// render time only, and the two generic cards (S27 opener, S28 notice).
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { v2Quiet } from "../../utils/componentsV2";
import { cfAttachment, cfEmoji } from "../../utils/crimeFamilyAssets";

export interface CfPayload {
  components: ContainerBuilder[];
  flags: number;
  allowedMentions: { parse: []; users?: string[] };
  files?: AttachmentBuilder[];
  attachments?: [];
}

/**
 * Every family send and edit goes through here. `freshAttachments` replaces
 * whatever the message held (a render into a message without this art).
 */
export function cfPayload(
  container: ContainerBuilder,
  opts: { files?: AttachmentBuilder[]; freshAttachments?: boolean; ephemeral?: boolean; mentionUsers?: string[] } = {},
): CfPayload {
  const payload: CfPayload = v2Quiet(container, opts.files, opts.ephemeral ? MessageFlags.Ephemeral : 0, opts.mentionUsers);
  if (opts.freshAttachments) payload.attachments = [];
  return payload;
}

/** A Section with the art as its thumbnail, or one TextDisplay (no file) when the art is missing. */
export function thumbSection(text: string, artKey: string): { component: SectionBuilder | TextDisplayBuilder; file: AttachmentBuilder | null } {
  const art = cfAttachment(artKey);
  const display = new TextDisplayBuilder().setContent(text);
  if (!art) return { component: display, file: null };
  return {
    component: new SectionBuilder().addTextDisplayComponents(display).setThumbnailAccessory(new ThumbnailBuilder().setURL(art.url)),
    file: art.attachment,
  };
}

/** A one-image gallery, or null (no gallery, no file) when the banner is missing. */
export function bannerGallery(artKey: string): { gallery: MediaGalleryBuilder; file: AttachmentBuilder } | null {
  const art = cfAttachment(artKey);
  if (!art) return null;
  return { gallery: new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(art.url)), file: art.attachment };
}

/** Adds a thumbSection to the container and returns its file. */
export function addThumbSection(container: ContainerBuilder, text: string, artKey: string): AttachmentBuilder | null {
  const { component, file } = thumbSection(text, artKey);
  if (component instanceof SectionBuilder) container.addSectionComponents(component);
  else container.addTextDisplayComponents(component);
  return file;
}

/** Inline text with the cf_ icon in front, or the plain label while the icon is not loaded. */
export function cfLabel(key: string, label: string): string {
  const emoji = cfEmoji(key);
  return emoji ? `${emoji} ${label}` : label;
}

/** A button with a plain-text label; the cf_ icon is set only when it is loaded. */
export function cfButton(
  customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, opts: { emojiKey?: string; disabled?: boolean } = {},
): ButtonBuilder {
  const button = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(!!opts.disabled);
  const emoji = opts.emojiKey ? cfEmoji(opts.emojiKey) : undefined;
  if (emoji) button.setEmoji(emoji);
  return button;
}

export function buttonRow(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

/** S27: a public, owner-scoped card whose one button opens the private screen or modal. */
export function buildOpener(ownerSummary: string, button: { customId: string; label: string }): CfPayload {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(ownerSummary))
    .addActionRowComponents(buttonRow(cfButton(button.customId, button.label, ButtonStyle.Primary)));
  return cfPayload(container);
}

/** S28: a public notice, optionally with one button. */
export function buildNotice(content: string, button?: { customId: string; label: string }, mentionUsers?: string[]): CfPayload {
  const container = new ContainerBuilder().addTextDisplayComponents(text(content));
  if (button) container.addActionRowComponents(buttonRow(cfButton(button.customId, button.label, ButtonStyle.Primary)));
  return cfPayload(container, { mentionUsers });
}
