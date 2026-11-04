import type { Message } from "discord.js";
import prisma from "./prisma";

export type PlayerTarget = { id: string; name: string };

/**
 * Resolves a typed player: a mention, a 17-20 digit user id, or an exact
 * (case-insensitive) Fortuna username. `copy.verb` names the action ("Rob",
 * "Invite"); `copy.bot` is the refusal for a mentioned bot.
 */
export async function resolvePlayerTarget(
  message: Message,
  raw: string | undefined,
  copy: { verb: string; bot: string },
): Promise<PlayerTarget | { error: string }> {
  const mention = message.mentions.members?.first();
  if (mention) {
    if (mention.user.bot) return { error: copy.bot };
    return { id: mention.id, name: mention.displayName };
  }

  const typed = raw?.replace(/[<@!>]/g, "").trim();
  if (!typed) {
    return { error: `${copy.verb} who? Mention them, or use their username or user ID.` };
  }

  if (/^\d{17,20}$/.test(typed)) {
    const target = await prisma.user.findUnique({ where: { discordId: typed } });
    if (!target) return { error: "No Fortuna player with that ID." };
    const member = message.guild?.members.cache.get(typed);
    return { id: target.discordId, name: member?.displayName ?? target.username };
  }

  const matches = await prisma.user.findMany({
    where: { username: { equals: typed, mode: "insensitive" } },
    take: 2,
  });
  if (matches.length === 0) {
    return { error: `No Fortuna player named **${typed}**. Names must match exactly — or use their user ID.` };
  }
  if (matches.length > 1) {
    return { error: `Multiple players share that name — ${copy.verb.toLowerCase()} them by user ID instead.` };
  }
  const member = message.guild?.members.cache.get(matches[0].discordId);
  return { id: matches[0].discordId, name: member?.displayName ?? matches[0].username };
}
