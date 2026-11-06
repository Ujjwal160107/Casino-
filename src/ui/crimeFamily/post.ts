// Channel I/O for family cards that outlive an interaction token (payday
// card, claim notice, invite card). Both go through the REST seam, so they
// work from any shard (A28). A deleted channel or lost access is a "dead"
// board: callers carry on (money still moves, DMs still go).
import { PermissionFlagsBits, type Client, type GuildBasedChannel } from "discord.js";
import { restEdit, restSend } from "../../utils/restMessages";
import type { CfPayload } from "./kit";

/** Unknown Channel, Unknown Message, Missing Access, Missing Permissions. */
const DEAD_CODES: ReadonlySet<number> = new Set([10003, 10008, 50001, 50013]);

const isDead = (err: unknown) => DEAD_CODES.has(Number((err as { code?: unknown } | null)?.code));

/** Posts the payload; the new message id, or null when the channel is dead or the send failed. Never throws. */
export async function sendToChannel(client: Client, channelId: string, payload: CfPayload): Promise<string | null> {
  try {
    return await restSend(client, channelId, payload);
  } catch (err) {
    if (!isDead(err)) console.error(`[crimeFamily] send to ${channelId} failed:`, err);
    return null;
  }
}

/** Edits a stored message without fetching it. Never throws. */
export async function editChannelMessage(
  client: Client, channelId: string, messageId: string, payload: CfPayload,
): Promise<"ok" | "dead" | "error"> {
  try {
    await restEdit(client, channelId, messageId, payload);
    return "ok";
  } catch (err) {
    if (isDead(err)) return "dead";
    console.error(`[crimeFamily] edit of ${channelId}/${messageId} failed:`, err);
    return "error";
  }
}

const NEEDED_PERMISSIONS = [
  ["ViewChannel", "View Channel"],
  ["SendMessages", "Send Messages"],
  ["ReadMessageHistory", "Read Message History"],
  ["AttachFiles", "Attach Files"],
] as const;

/** The display names of the permissions the bot lacks in channel to post family cards. */
export function missingBotPermissions(channel: GuildBasedChannel, botId: string): string[] {
  const perms = channel.permissionsFor(botId);
  return NEEDED_PERMISSIONS.filter(([flag]) => !perms?.has(PermissionFlagsBits[flag])).map(([, name]) => name);
}

export function jumpLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** The family's home channel, for notices sent before any board exists (T9). */
export function channelLink(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}
