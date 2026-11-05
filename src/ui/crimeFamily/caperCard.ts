// The one writer of the shared caper card (spec 13.2): every render reads the
// caper from the DB and edits the stored channelId/messageId, never through an
// interaction token. A dead board is marked (messageId "") after one failed
// repost and stays dead until `!caper` reposts it.
import type { Family } from "@prisma/client";
import type { Client, GuildBasedChannel } from "discord.js";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { buildCaperCardView, getCaper } from "../../services/crimeFamily/caperQueries";
import { swapCaperMessage } from "../../services/crimeFamily/caperLobbyService";
import { FamilyError } from "../../services/crimeFamily/tx";
import { buildCaperCard, buildLobbyMoved } from "./caperScreens";
import { trailingRender } from "./debounce";
import { editChannelMessage, jumpLink, missingBotPermissions, sendToChannel } from "./post";

/**
 * Edits the stored card to the caper's current screen. A rejected edit is
 * retried once with the banner and `attachments: []` (C5); a dead board gets
 * one repost in the lobby channel. "skipped": no caper, no live board, an
 * edit that kept failing without the board being dead, or a repost another
 * writer superseded.
 */
export async function renderCaperCard(
  client: Client, caperId: string, opts: { note?: string | null; now?: Date } = {},
): Promise<"ok" | "dead" | "skipped"> {
  const view = await buildCaperCardView(caperId, opts.now ?? new Date(), opts.note ?? null);
  if (!view || view.messageId === "") return "skipped";
  const art = view.status === "RESOLVED" || view.status === "CANCELLED";
  let edited = await editChannelMessage(client, view.channelId, view.messageId, buildCaperCard(view, { art }));
  if (edited === "error") edited = await editChannelMessage(client, view.channelId, view.messageId, buildCaperCard(view, { art: true }));
  if (edited === "ok") return "ok";
  if (edited === "error") return "skipped";

  if (!(await swapCaperMessage(caperId, view.messageId, { messageId: "" }))) return "skipped";
  const reposted = await sendToChannel(client, view.channelId, buildCaperCard(view, { art: true }));
  if (reposted === null) return "dead";
  if (await swapCaperMessage(caperId, "", { messageId: reposted })) return "ok";
  return (await settleLostPost(client, caperId, view.channelId, reposted)) ? "ok" : "skipped";
}

/** A debounced render for roster changes (14.3). */
export function requestCaperRender(client: Client, caperId: string): Promise<void> {
  return trailingRender("caper", caperId, CRIME_FAMILY_CONFIG.caperRenderDebounceSeconds,
    () => renderCaperCard(client, caperId).then(() => undefined));
}

/**
 * Posts the card with its art in `channelId` and moves the caper's board there;
 * a superseded live card is edited to "Lobby moved" (C7). The new message id,
 * or null when the send failed or another writer moved the board first.
 */
export async function postCaperCard(client: Client, caperId: string, channelId: string): Promise<string | null> {
  const view = await buildCaperCardView(caperId, new Date());
  if (!view) return null;
  const posted = await sendToChannel(client, channelId, buildCaperCard(view, { art: true }));
  if (posted === null) return null;
  if (!(await swapCaperMessage(caperId, view.messageId, { channelId, messageId: posted }))) {
    return (await settleLostPost(client, caperId, channelId, posted)) ? posted : null;
  }
  if (view.messageId !== "") {
    await editChannelMessage(client, view.channelId, view.messageId, buildLobbyMoved(jumpLink(view.guildId, channelId, posted)));
  }
  return posted;
}

/**
 * A message this writer posted whose board CAS lost: a board left dead adopts
 * it, otherwise another writer owns the board and the post is edited to
 * "Lobby moved" pointing there, so no live card is left untracked. True when
 * the post became the board.
 */
async function settleLostPost(client: Client, caperId: string, channelId: string, posted: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const caper = await getCaper(caperId);
    if (!caper) return false;
    if (caper.messageId !== "") {
      await editChannelMessage(client, channelId, posted, buildLobbyMoved(jumpLink(caper.guildId, caper.channelId, caper.messageId)));
      return false;
    }
    if (await swapCaperMessage(caperId, "", { channelId, messageId: posted })) return true;
  }
  return false;
}

async function fetchGuildChannel(client: Client, channelId: string): Promise<GuildBasedChannel | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    return channel && "guildId" in channel && channel.guildId ? (channel as GuildBasedChannel) : null;
  } catch {
    return null;
  }
}

/**
 * Where a new lobby posts (8.4 step 1, edge 75): this channel when the bot can
 * post there, else the family's home channel when it is in this guild and
 * postable, else a refusal naming the missing permissions.
 */
export async function pickLobbyChannel(client: Client, channelId: string, family: Family): Promise<string> {
  const botId = client.user?.id ?? "";
  const channel = await fetchGuildChannel(client, channelId);
  const missing = channel ? missingBotPermissions(channel, botId) : ["View Channel"];
  if (missing.length === 0) return channelId;
  if (channel && family.homeGuildId === channel.guildId && family.homeChannelId !== channelId) {
    const home = await fetchGuildChannel(client, family.homeChannelId);
    if (home && missingBotPermissions(home, botId).length === 0) return family.homeChannelId;
  }
  throw new FamilyError(`I need ${missing.join(", ")} in this channel to post the lobby.`);
}
