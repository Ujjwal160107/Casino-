import { Client, Guild, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, TextChannel } from "discord.js";
import { guildCleanupService } from "../services/guildCleanupService";
import { Mascot } from "../config/branding";

export const guildCreateListener = (client: Client) => {
    console.log("✅ Guild Create Listener Registered");
    client.on("guildCreate", async (guild: Guild) => {
        console.log(`[GuildCreate] Bot joined guild: ${guild.name} (${guild.id})`);

        try {
            // Check if there's a pending deletion and restore it
            // Wrapped in try-catch in case DB/Redis is offline so it doesn't block welcome message
            try {
                await guildCleanupService.restoreGuild(guild.id);
            } catch (err) {
                console.warn(`[GuildCreate] Failed to restore guild (DB error?):`, err);
            }

            // 1. Prepare Welcome Embed
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎉 Thanks for adding ${Mascot.Name}!`)
                .setDescription(
                    `I'm here to handle your server's **Economy**, **Games**, and **Moderation** needs.\n\n` +
                    `Here are some quick links to help you get started:`
                )
                .addFields(
                    { name: "🚀 Getting Started", value: "Use \`/setup\` to configure your server's economy and settings.", inline: false },
                    { name: "📚 Documentation", value: `Read our [Docs](${Mascot.Links.Docs}) for a full command list and guides.`, inline: true },
                    { name: "🌐 Dashboard", value: `Manage everything from our [Web Dashboard](${Mascot.Links.Dashboard}).`, inline: true },
                    { name: "🆘 Support", value: `Need help? Join our [Support Server](${Mascot.Links.Support}).`, inline: true }
                )
                .setColor(Mascot.Colors.Base as any)
                .setThumbnail(client.user?.displayAvatarURL() || "")
                .setFooter({ text: "Let's make this server awesome!" })
                .setTimestamp();

            // 2. Prepare Buttons
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel("Open Dashboard")
                    .setStyle(ButtonStyle.Link)
                    .setURL(Mascot.Links.Dashboard),
                new ButtonBuilder()
                    .setLabel("Documentation")
                    .setStyle(ButtonStyle.Link)
                    .setURL(Mascot.Links.Docs),
                new ButtonBuilder()
                    .setLabel("Support Server")
                    .setStyle(ButtonStyle.Link)
                    .setURL(Mascot.Links.Support)
            );

            // 3. Find a suitable channel to send the message
            let targetChannel: TextChannel | null = null;
            const me = guild.members.me;

            if (!me) {
                console.warn(`[GuildCreate] 'guild.members.me' is undefined for ${guild.name}`);
                return;
            }

            // Try system channel first
            if (guild.systemChannel && guild.systemChannel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
                targetChannel = guild.systemChannel;
                console.log(`[GuildCreate] Selected System Channel: ${targetChannel.name}`);
            } else {
                // Find first accessible text or announcement channel
                const channel = guild.channels.cache.find(c =>
                    (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
                    c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
                );
                if (channel) {
                    targetChannel = channel as TextChannel;
                    console.log(`[GuildCreate] Selected Fallback Channel: ${targetChannel.name}`);
                }
            }

            // 4. Send Message
            if (targetChannel) {
                await targetChannel.send({ embeds: [welcomeEmbed], components: [row] });
                console.log(`[GuildCreate] Sent welcome message to #${targetChannel.name} in ${guild.name}`);
            } else {
                console.warn(`[GuildCreate] Could not find a channel to send welcome message in ${guild.name}. Cache size: ${guild.channels.cache.size}`);
            }

        } catch (error) {
            console.error(`[GuildCreate] Error sending welcome message in ${guild.name}:`, error);
        }
    });
};
