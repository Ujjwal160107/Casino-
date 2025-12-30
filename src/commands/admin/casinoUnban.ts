import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot } from "../../config/branding";

export async function handleCasinoUnban(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "No Permission", "Administrator or Bot Commander required.")] });
    }

    const mention = args[0];
    if (!mention) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}casinounban @user\``)] });
    }

    const discordId = mention.replace(/[<@!>]/g, "");

    try {
        const user = await prisma.user.update({
            where: { discordId_guildId: { discordId, guildId: message.guildId! } },
            data: { isBanned: false }
        });

        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild!,
            type: "MODERATION",
            title: "User Unbanned",
            description: `**User:** <@${discordId}>\n**Unbanned By:** ${message.author.tag}`,
            color: 0x00FF00
        });

        return message.reply({
            embeds: [successEmbed(message.author, "User Unbanned", `${Mascot.Emotes.Accept} **<@${discordId}>** has been unbanned from the casino.`)]
        });

    } catch (error) {
        console.error(error);
        return message.reply({ embeds: [errorEmbed(message.author, "Error", "Failed to unban user (maybe they aren't in the DB?).")] });
    }
}