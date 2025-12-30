import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot } from "../../config/branding";

export async function handleMakeCasinoAdmin(message: Message, args: string[]) {
    const BOT_OWNER_ID = "1288340046449086567";
    if (message.author.id !== message.guild?.ownerId && message.author.id !== BOT_OWNER_ID) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Only the **Server Owner** or **Bot Owner** can use this command.")] });
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Mention a user to promote.\nExample: \`${config.prefix}make-casino-admin @user\``)] });
    }

    try {
        if (!message.guild) return;
        await prisma.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isCasinoAdmin: true } as any
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Casino Admin Promoted",
            description: `**User:** ${targetUser.tag}\n**Promoted By:** ${message.author.tag}`,
            color: 0x00FF00
        });
        return message.reply({
            embeds: [successEmbed(message.author, "Promoted", `${Mascot.Emotes.Accept} **${targetUser.tag}** is now a **Casino Admin**.`)]
        });
    } catch (e) {
        return message.reply({ embeds: [errorEmbed(message.author, "Error", "Ensure the user is registered in the bot.")] });
    }
}

export async function handleRemoveCasinoAdmin(message: Message, args: string[]) {
    const BOT_OWNER_ID = "1288340046449086567";
    if (message.author.id !== message.guild?.ownerId && message.author.id !== BOT_OWNER_ID) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Only the **Server Owner** or **Bot Owner** can use this command.")] });
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Mention a user to demote.\nExample: \`${config.prefix}remove-casino-admin @user\``)] });
    }

    try {
        if (!message.guild) return;
        await prisma.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isCasinoAdmin: false } as any
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Casino Admin Demoted",
            description: `**User:** ${targetUser.tag}\n**Demoted By:** ${message.author.tag}`,
            color: 0xFF0000
        });
        return message.reply({
            embeds: [successEmbed(message.author, "Demoted", `${Mascot.Emotes.Accept} **${targetUser.tag}** is no longer a Casino Admin.`)]
        });
    } catch (e) {
        return message.reply({ embeds: [errorEmbed(message.author, "Error", "Ensure the user is registered in the bot.")] });
    }
}

export async function handleListCasinoAdmins(message: Message) {
    const admins = await prisma.user.findMany({
        where: { isCasinoAdmin: true, guildId: message.guildId! } as any
    });

    if (admins.length === 0) {
        return message.reply({ embeds: [new EmbedBuilder().setTitle("Casino Admins").setDescription("None assigned.").setColor("#FFD700")] });
    }

    const list = admins.map((u, i) => `${i + 1}. <@${u.discordId}>`).join("\n");
    const embed = new EmbedBuilder()
        .setTitle(`🛡️ Casino Admins (${admins.length})`)
        .setDescription(list)
        .setColor("#FFD700")
        .setFooter({ text: "Casino Admins have elevated privileges." });

    return message.reply({ embeds: [embed] });
}