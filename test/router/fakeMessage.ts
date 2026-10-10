import { vi } from "vitest";
import type { Message } from "discord.js";

// The router loads many handlers with a lazy CommonJS require(), which goes
// through Node rather than vitest's transformer and so cannot read .ts. Let
// Node transpile them too, so those cases are reachable from a test.
require("ts-node").register({ transpileOnly: true });

/** The slice of a Message that routeMessage's gates read before dispatch. */
export function fakeMessage(content: string, opts: { authorId: string; guildId: string | null }) {
  const reply = vi.fn(async (_payload: unknown) => ({}) as Message);
  const message = {
    content,
    guildId: opts.guildId,
    guild: opts.guildId ? { id: opts.guildId } : null,
    author: { id: opts.authorId, username: "RouterTest", bot: false },
    member: null,
    mentions: { users: new Map(), members: new Map(), everyone: false, has: () => false },
    reply,
  } as unknown as Message;
  return { message, reply };
}

/** Flatten a v2Reply payload into searchable text. */
export function replyText(payload: unknown): string {
  return JSON.stringify(payload);
}
