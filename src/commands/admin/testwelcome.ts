import {
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    TextChannel,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { DEVELOPER_ONLY_COMMAND_MESSAGE, isBotDeveloper } from "../../utils/developerAccess";
import { v2Reply } from "../../utils/componentsV2";

export async function handleTestWelcome(message: Message) {
    // Basic Admin Check (Optional, but good practice even for debug)
    if (!isBotDeveloper(message.author.id)) {
        return message.reply(DEVELOPER_ONLY_COMMAND_MESSAGE);
    }

    const guild = message.guild!;
    const me = guild.members.me;

    if (!me) {
        return message.reply("Error: `guild.members.me` is undefined.");
    }

    await message.reply("Starting Welcome Message Simulation...");

    // 1. Prepare Welcome Container
    const welcomeContainer = new ContainerBuilder();
    welcomeContainer.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## Thanks for adding ${Mascot.Name}!\n` +
                    `I'm here to handle your server's **Economy**, **Games**, and **Moderation** needs.\n\n` +
                    `Here are some quick links to help you get started:`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(message.client.user?.displayAvatarURL() || "")
            )
    );
    welcomeContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**Getting Started:** Use \`/setup\` to configure your server's economy and settings.\n` +
            `**Documentation:** Read our [Docs](${Mascot.Links.Docs}) for a full command list and guides.\n` +
            `**Support:** Need help? Join our [Support Server](${Mascot.Links.Support}).`
        )
    );

    // 2. Prepare Buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("Documentation")
            .setStyle(ButtonStyle.Link)
            .setURL(Mascot.Links.Docs),
        new ButtonBuilder()
            .setLabel("Support Server")
            .setStyle(ButtonStyle.Link)
            .setURL(Mascot.Links.Support)
    );
    welcomeContainer.addActionRowComponents(row);

    // 3. Find a suitable channel to send the message
    let targetChannel: TextChannel | null = null;
    let log = "";

    // Try system channel first
    if (guild.systemChannel) {
        const perms = guild.systemChannel.permissionsFor(me);
        if (perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
            targetChannel = guild.systemChannel;
            log += `Selected System Channel: ${targetChannel.name}\n`;
        } else {
            log += `System Channel (${guild.systemChannel.name}) is not writable/viewable.\n`;
        }
    } else {
        log += `No System Channel configured.\n`;
    }

    if (!targetChannel) {
        // Find first accessible text or announcement channel
        const channel = guild.channels.cache.find(c =>
            (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
            c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
        );
        if (channel) {
            targetChannel = channel as TextChannel;
            log += `Selected Fallback Channel: ${targetChannel.name}\n`;
        } else {
            log += `Could not find ANY accessible text/announcement channel.\n`;
        }
    }

    // 4. Send Message
    if (targetChannel) {
        try {
            await targetChannel.send(v2Reply(welcomeContainer));
            log += `Message SENT successfully to ${targetChannel.toString()}.`;
        } catch (err: any) {
            log += `Error sending message: ${err.message}`;
        }
    }

    await message.reply(`**Diagnostics Log:**\n\`\`\`\n${log}\n\`\`\``);
}
