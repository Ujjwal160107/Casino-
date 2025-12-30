import { Message, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import prisma from "../../utils/prisma";
import { Mascot } from "../../config/branding";

export async function handleCommandStatus(message: Message, args: string[]) {
    const commandName = args[0]?.toLowerCase();
    const guildId = message.guildId!;
    const config = await getGuildConfig(guildId);

    if (!commandName) return message.reply(`Usage: \`${config.prefix}command-status <command>\``);

    const userId = message.author.id;
    const channelId = message.channel.id;
    const member = message.member!;
    const trace: string[] = [];

    const isAdmin = member.permissions.has("Administrator");
    const isOwner = userId === message.guild?.ownerId;
    const isBotOwner = userId === "1288340046449086567";

    const userDb = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        select: { isCasinoAdmin: true }
    });
    const isCasinoAdmin = userDb?.isCasinoAdmin ?? false;

    if (isBotOwner) trace.push(`${Mascot.Emotes.Accept} Allowed: Bot Owner override`);
    else if (isOwner) trace.push(`${Mascot.Emotes.Accept} Allowed: Server Owner override`);
    else if (isAdmin) trace.push(`${Mascot.Emotes.Accept} Allowed: Administrator override`);
    else if (isCasinoAdmin) trace.push(`${Mascot.Emotes.Accept} Allowed: Casino Admin override`);
    else trace.push("ℹ️ Not Tier 1 admin");

    const permissions = await prisma.commandPermission.findMany({
        where: {
            guildId,
            command: commandName,
            OR: [
                { targetType: "USER", targetId: userId },
                { targetType: "ROLE", targetId: { in: member.roles.cache.map(r => r.id) } },
                { targetType: "CHANNEL", targetId: channelId }
            ]
        }
    });

    const userAllow = permissions.find(p => p.targetType === "USER" && p.targetId === userId && p.action === "ALLOW");
    if (userAllow) trace.push(`${Mascot.Emotes.Accept} Allowed: Explicit User Permission`);

    const roleAllow = permissions.find(p => p.targetType === "ROLE" && member.roles.cache.has(p.targetId) && p.action === "ALLOW");
    if (roleAllow) trace.push(`${Mascot.Emotes.Accept} Allowed: Explicit Role Permission`);

    const channelDeny = permissions.find(p => p.targetType === "CHANNEL" && p.targetId === channelId && p.action === "DENY");
    if (channelDeny) trace.push(`${Mascot.Emotes.Decline} Denied: Channel Override DENY`);

    if (config.disabledCommands.includes(commandName)) trace.push(`${Mascot.Emotes.Decline} Denied: Global Disable`);
    else trace.push("ℹ️ Not Globally Disabled");

    if (config.casinoChannels.length > 0) {
        if (!config.casinoChannels.includes(channelId)) {
            const channelAllow = permissions.some(p => p.targetType === "CHANNEL" && p.targetId === channelId && p.action === "ALLOW");
            if (!channelAllow) trace.push(`${Mascot.Emotes.Decline} Denied: Channel not in Whitelist (and no Override ALLOW)`);
            else trace.push(`${Mascot.Emotes.Accept} Allowed: Channel Override ALLOW bypasses Whitelist`);
        } else {
            trace.push("ℹ️ Channel is in Whitelist");
        }
    } else {
        trace.push("ℹ️ No Whitelist active");
    }

    const { checkCommandPermission } = require("../../services/permissionService");
    const result = await checkCommandPermission(message, commandName);

    const embed = new EmbedBuilder()
        .setTitle(`Status for: ${commandName}`)
        .setDescription(`**Final Result:** ${result.allowed ? `${Mascot.Emotes.Accept} ALLOWED` : `${Mascot.Emotes.Decline} DENIED`}\n${result.reason ? `**Reason:** ${result.reason}` : ""}\n\n**Logic Trace:**\n${trace.join("\n")}`)
        .setColor(result.allowed ? "Green" : "Red");

    return message.reply({ embeds: [embed] });
}