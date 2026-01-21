import { Client, Guild, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, TextChannel } from "discord.js";
import { guildCleanupService } from "../services/guildCleanupService";
import { Mascot } from "../config/branding";

export const guildCreateListener = (client: Client) => {
    client.on("guildCreate", async (guild: Guild) => {
        console.log(`[GuildCreate] Bot joined guild: ${guild.name} (${guild.id})`);

        // Check if there's a pending deletion and restore it
        await guildCleanupService.restoreGuild(guild.id);

        try {
            // 1. Prepare Welcome Embed
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎉 Thanks for adding ${Mascot.Name}!`)
                .setDescription(
                    `I'm here to handle your server's **Economy**, **Games**, and **Moderation** needs.\n\n` +
                    `Here are some quick links to help you get started:`
                )
                .addFields(
                    { name: "🚀 Getting Started", value: "Use \`/setup\` to configure your server's economy and settings.", inline: false },
                    { name: "📚 Documentation", value: "Read our [Docs](https://fortunabot.dev/docs) for a full command list and guides.", inline: true },
                    { name: "🌐 Dashboard", value: "Manage everything from our [Web Dashboard](https://fortunabot.dev/).", inline: true },
                    { name: "🆘 Support", value: "Need help? Join our [Support Server](https://discord.gg/Y5P44UCH2Y).", inline: true }
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
                    .setURL("https://fortunabot.dev/"),
                new ButtonBuilder()
                    .setLabel("Documentation")
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://fortunabot.dev/docs"),
                new ButtonBuilder()
                    .setLabel("Support Server")
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://discord.gg/Y5P44UCH2Y")
            );

            // 3. Find a suitable channel to send the message
            let targetChannel: TextChannel | null = null;

            // Try system channel first
            if (guild.systemChannel && guild.systemChannel.permissionsFor(guild.members.me!)?.has(PermissionFlagsBits.SendMessages)) {
                targetChannel = guild.systemChannel;
            } else {
                // Find first accessible text channel
                const channel = guild.channels.cache.find(c =>
                    c.type === ChannelType.GuildText &&
                    c.permissionsFor(guild.members.me!)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
                );
                if (channel) targetChannel = channel as TextChannel;
            }

            // 4. Send Message
            if (targetChannel) {
                await targetChannel.send({ embeds: [welcomeEmbed], components: [row] });
                console.log(`[GuildCreate] Sent welcome message to #${targetChannel.name} in ${guild.name}`);
            } else {
                console.warn(`[GuildCreate] Could not find a channel to send welcome message in ${guild.name}`);
            }

        } catch (error) {
            console.error(`[GuildCreate] Error sending welcome message in ${guild.name}:`, error);
        }
    });
};
