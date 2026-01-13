import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";
import { parseDuration, formatDuration } from "../../utils/duration";

export async function handleCasinoBan(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "No Permission", "Administrator or Bot Commander required.")] });
    }

    const mention = args[0];
    if (!mention) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}casinoban @user [duration] [reason]\`\nExamples:\n\`${config.prefix}casinoban @user 1d Rule violation\`\n\`${config.prefix}casinoban @user Perma ban\``)] });
    }

    const discordId = mention.replace(/[<@!>]/g, "");
    const targetMember = await message.guild?.members.fetch(discordId).catch(() => null);

    const { getPermissionLevel, canActOn, PermissionLevel } = require("../../utils/permissions");
    const actorLevel = await getPermissionLevel(message, message.member!);

    if (actorLevel < PermissionLevel.ADMIN) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator permissions.")] });
    }

    let targetLevel = PermissionLevel.MEMBER;
    if (targetMember) {
        targetLevel = await getPermissionLevel(message, targetMember);
    } else {
        const dbUser = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId: message.guildId! } } });
        if (dbUser && (dbUser as any).isCasinoAdmin) targetLevel = PermissionLevel.CASINO_ADMIN;
        if (discordId === message.guild?.ownerId) targetLevel = PermissionLevel.OWNER;
        if (discordId === "1288340046449086567") targetLevel = PermissionLevel.BOT_OWNER;
    }

    if (!(await canActOn(actorLevel, targetLevel))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You cannot ban this user due to privilege hierarchy.")] });
    }

    // Parse duration
    let durationSeconds = 0;
    let reasonStartIndex = 1;
    let banExpiresAt: Date | null = null;
    let durationStr = "";

    try {
        if (args[1]) {
            durationSeconds = parseDuration(args[1]);
            // If parseDuration succeeds, args[1] was a duration
            banExpiresAt = new Date(Date.now() + durationSeconds * 1000);
            durationStr = formatDuration(durationSeconds);
            reasonStartIndex = 2;
        }
    } catch (e) {
        // Not a duration, simple fallback to permanent
    }

    const reason = args.slice(reasonStartIndex).join(" ") || "No reason provided.";

    try {
        await prisma.user.upsert({
            where: { discordId_guildId: { discordId, guildId: message.guildId! } },
            create: {
                discordId,
                guildId: message.guildId!,
                username: "Unknown",
                isBanned: true,
                banExpiresAt: banExpiresAt
            },
            update: {
                isBanned: true,
                banExpiresAt: banExpiresAt
            }
        });

        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild!,
            type: "MODERATION",
            title: "User Banned (Casino)",
            description: `**User:** <@${discordId}>\n**Banned By:** ${message.author.tag}\n**Duration:** ${banExpiresAt ? durationStr : "Permanent"}\n**Reason:** ${reason}`,
            color: 0xFF0000
        });

        return message.reply({
            embeds: [successEmbed(message.author, "User Banned", `🚫 **<@${discordId}>** has been banned from the casino.\n**Duration:** ${banExpiresAt ? durationStr : "Permanent"}\n**Reason:** ${reason}`)]
        });

    } catch (e) {
        console.error(e);
        return message.reply({ embeds: [errorEmbed(message.author, "Database Error", "Failed to ban user.")] });
    }
}