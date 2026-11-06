// Channel messages through client.rest (spec A28): works for any channel the
// bot can reach, whether or not this shard caches its guild. Both throw the
// DiscordAPIError Discord returns; callers read its `code`.
import {
  MessagePayload,
  Routes,
  type Client,
  type MessageCreateOptions,
  type MessageEditOptions,
  type MessageTarget,
} from "discord.js";

/** The REST body and files for a payload. The builder reads only `target.client` for a plain channel target. */
async function resolvePayload(client: Client, payload: MessageCreateOptions | MessageEditOptions) {
  const mp = MessagePayload.create({ client } as unknown as MessageTarget, payload);
  return mp.resolveBody().resolveFiles();
}

/** Posts a message to the channel; the new message id. */
export async function restSend(client: Client, channelId: string, payload: MessageCreateOptions): Promise<string> {
  const { body, files } = await resolvePayload(client, payload);
  const msg = (await client.rest.post(Routes.channelMessages(channelId), { body, files: files ?? undefined })) as { id: string };
  return msg.id;
}

/** Edits a stored message without fetching it. */
export async function restEdit(client: Client, channelId: string, messageId: string, payload: MessageEditOptions): Promise<void> {
  const { body, files } = await resolvePayload(client, payload);
  await client.rest.patch(Routes.channelMessage(channelId, messageId), { body, files: files ?? undefined });
}
