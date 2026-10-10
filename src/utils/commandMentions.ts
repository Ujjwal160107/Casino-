import { Collection } from "discord.js";

type MentionCollections = {
    users: Collection<string, { id: string }>;
    members: Collection<string, { id: string }> | null;
};

/**
 * Narrows a chat command's mentions to the users typed in its text.
 *
 * Discord's mention list also carries the bot that was @mentioned to invoke
 * the command and the author of a replied-to message. Handlers pick their
 * target with `mentions.users.first()`, so without this `@bot profile` shows
 * the bot's profile and a reply targets whoever was replied to.
 */
export function scopeMentionsToCommand(mentions: MentionCollections, commandText: string) {
    const typed = new Set([...commandText.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]));
    mentions.users.sweep((user) => !typed.has(user.id));
    mentions.members?.sweep((member) => !typed.has(member.id));
}
