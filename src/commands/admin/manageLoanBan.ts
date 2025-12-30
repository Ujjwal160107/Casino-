import { Message, PermissionsBitField } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot } from "../../config/branding";

export async function handleLoanBan(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Please mention a user to ban from loans.\nExample: \`${config.prefix}loan-ban @user\``)] });
    }

    const { getPermissionLevel, canActOn, PermissionLevel } = require("../../utils/permissions");
    const actorLevel = await getPermissionLevel(message, message.member!);
    const targetMember = await message.guild?.members.fetch(targetUser.id).catch(() => null);

    let targetLevel = PermissionLevel.MEMBER;
    if (targetMember) {
        targetLevel = await getPermissionLevel(message, targetMember);
    } else {
        if (!message.guild) return;
        const dbUser = await prisma.user.findUnique({ where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } } });
        if (dbUser && (dbUser as any).isCasinoAdmin) targetLevel = PermissionLevel.CASINO_ADMIN;
        if (targetUser.id === message.guild?.ownerId) targetLevel = PermissionLevel.OWNER;
        if (targetUser.id === "1288340046449086567") targetLevel = PermissionLevel.BOT_OWNER;
    }

    if (!(await canActOn(actorLevel, targetLevel))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You cannot ban this user due to privilege hierarchy.")] });
    }

    try {
        if (!message.guild) return;
        await prisma.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isLoanBanned: true } as any
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild!,
            type: "MODERATION",
            title: "User Banned from Loans",
            description: `**User:** ${targetUser.tag}\n**Banned By:** ${message.author.tag}`,
            color: 0xFF0000
        });
        return message.reply({
            embeds: [successEmbed(message.author, "User Banned from Loans", `🚫 **${targetUser.tag}** has been banned from taking new loans.`)]
        });
    } catch (e) {
        console.error(e);
        return message.reply({ embeds: [errorEmbed(message.author, "Database Error", "Failed to update user status. Ensure they are registered.")] });
    }
}

export async function handleLoanUnban(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Please mention a user to unban from loans.\nExample: \`${config.prefix}loan-unban @user\``)] });
    }

    try {
        if (!message.guild) return;
        await prisma.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isLoanBanned: false } as any
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild!,
            type: "MODERATION",
            title: "User Unbanned from Loans",
            description: `**User:** ${targetUser.tag}\n**Unbanned By:** ${message.author.tag}`,
            color: 0x00FF00
        });
        return message.reply({
            embeds: [successEmbed(message.author, "User Unbanned", `${Mascot.Emotes.Accept} **${targetUser.tag}** can now take loans again.`)]
        });
    } catch (e) {
        console.error(e);
        return message.reply({ embeds: [errorEmbed(message.author, "Database Error", "Failed to update user status.")] });
    }
}