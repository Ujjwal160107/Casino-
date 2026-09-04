import {
    ChatInputCommandInteraction,
    Collection,
    GuildMember,
    Message,
    User,
} from "discord.js";

/**
 * Presents a slash interaction as the `Message` object every command handler
 * already expects, so `routeMessage` and all 76 handlers run unchanged.
 *
 * Why an adapter rather than slash-native handlers: the handlers hold every
 * embed, container, collector and game rule in the bot. Forking them would mean
 * two copies of each to keep in step forever. The router already carries the
 * cross-cutting work (ban checks, wallet provisioning, jail gates), so feeding
 * it a Message-shaped object reuses all of it.
 *
 * This mirrors what index.ts already does for @mention invocations, which
 * rewrite `content` into a prefix command and call the same router.
 *
 * Only the surface handlers actually touch is implemented -- reply, author,
 * guild, guildId, member, client, channel, mentions, delete, edit and the few
 * identity fields. Anything else is deliberately absent so a handler reaching
 * for it fails loudly in tests rather than silently misbehaving in production.
 */
export function createInteractionMessage(
    interaction: ChatInputCommandInteraction,
    content: string,
    mentionedUsers: User[],
): { message: Message; replied: () => boolean } {
    // Handlers universally resolve targets with `message.mentions.users.first()`.
    // Typed `user` options are funnelled here so that keeps working verbatim.
    const users = new Collection<string, User>();
    const members = new Collection<string, GuildMember>();
    for (const user of mentionedUsers) {
        users.set(user.id, user);
        const member = interaction.guild?.members.cache.get(user.id);
        if (member) members.set(user.id, member);
    }

    // The interaction is deferred before we get here, so the first reply edits
    // the placeholder and later ones become follow-ups. Both return a real
    // Message, which is what the handlers that attach component collectors to
    // their reply depend on.
    //
    // editReply carries MessageFlags.IsComponentsV2 fine -- MessageEditOptions
    // explicitly permits that flag. An earlier version of this file sent the
    // first reply as a follow-up and then deleted the placeholder, on the false
    // assumption that it could not; that deleted the visible response instead.
    let hasReplied = false;
    let sent: Message | null = null;
    const reply = async (options: any): Promise<Message> => {
        const payload = typeof options === "string" ? { content: options } : options;
        if (!hasReplied) {
            hasReplied = true;
            sent = (await interaction.editReply(payload)) as Message;
            return sent;
        }
        return (await interaction.followUp(payload)) as Message;
    };

    const adapter = {
        id: interaction.id,
        content,
        author: interaction.user,
        member: interaction.member as GuildMember | null,
        guild: interaction.guild,
        guildId: interaction.guildId,
        channel: interaction.channel,
        channelId: interaction.channelId,
        client: interaction.client,
        createdTimestamp: interaction.createdTimestamp,

        mentions: {
            users,
            members,
            everyone: false,
            has: (target: { id: string } | string) =>
                users.has(typeof target === "string" ? target : target.id),
        },

        reply,

        // Handlers call this to tidy away the user's own command message after
        // a cooldown notice. A slash invocation has no such message, so there
        // is nothing to remove.
        delete: async () => adapter as unknown as Message,

        // Edits the message we actually sent. Not editReply -- the deferred
        // placeholder it refers to has been deleted by then.
        edit: async (options: any) => {
            const payload = typeof options === "string" ? { content: options } : options;
            if (!sent) return reply(payload);
            return (await sent.edit(payload)) as Message;
        },
    };

    // `replied` lets the caller notice a handler that returned without saying
    // anything, which would otherwise leave the deferred reply spinning forever.
    return { message: adapter as unknown as Message, replied: () => hasReplied };
}
