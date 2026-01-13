"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCasinoBan = handleCasinoBan;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const guildConfigService_1 = require("../../services/guildConfigService");
const duration_1 = require("../../utils/duration");
async function handleCasinoBan(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Permission", "Administrator or Bot Commander required.")] });
    }
    const mention = args[0];
    if (!mention) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}casinoban @user [duration] [reason]\`\nExamples:\n\`${config.prefix}casinoban @user 1d Rule violation\`\n\`${config.prefix}casinoban @user Perma ban\``)] });
    }
    const discordId = mention.replace(/[<@!>]/g, "");
    const targetMember = await message.guild?.members.fetch(discordId).catch(() => null);
    const { getPermissionLevel, canActOn, PermissionLevel } = require("../../utils/permissions");
    const actorLevel = await getPermissionLevel(message, message.member);
    if (actorLevel < PermissionLevel.ADMIN) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator permissions.")] });
    }
    let targetLevel = PermissionLevel.MEMBER;
    if (targetMember) {
        targetLevel = await getPermissionLevel(message, targetMember);
    }
    else {
        const dbUser = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId: message.guildId } } });
        if (dbUser && dbUser.isCasinoAdmin)
            targetLevel = PermissionLevel.CASINO_ADMIN;
        if (discordId === message.guild?.ownerId)
            targetLevel = PermissionLevel.OWNER;
        if (discordId === "1288340046449086567")
            targetLevel = PermissionLevel.BOT_OWNER;
    }
    if (!(await canActOn(actorLevel, targetLevel))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You cannot ban this user due to privilege hierarchy.")] });
    }
    // Parse duration
    let durationSeconds = 0;
    let reasonStartIndex = 1;
    let banExpiresAt = null;
    let durationStr = "";
    try {
        if (args[1]) {
            durationSeconds = (0, duration_1.parseDuration)(args[1]);
            // If parseDuration succeeds, args[1] was a duration
            banExpiresAt = new Date(Date.now() + durationSeconds * 1000);
            durationStr = (0, duration_1.formatDuration)(durationSeconds);
            reasonStartIndex = 2;
        }
    }
    catch (e) {
        // Not a duration, simple fallback to permanent
    }
    const reason = args.slice(reasonStartIndex).join(" ") || "No reason provided.";
    try {
        await prisma_1.default.user.upsert({
            where: { discordId_guildId: { discordId, guildId: message.guildId } },
            create: {
                discordId,
                guildId: message.guildId,
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
            guild: message.guild,
            type: "MODERATION",
            title: "User Banned (Casino)",
            description: `**User:** <@${discordId}>\n**Banned By:** ${message.author.tag}\n**Duration:** ${banExpiresAt ? durationStr : "Permanent"}\n**Reason:** ${reason}`,
            color: 0xFF0000
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "User Banned", `🚫 **<@${discordId}>** has been banned from the casino.\n**Duration:** ${banExpiresAt ? durationStr : "Permanent"}\n**Reason:** ${reason}`)]
        });
    }
    catch (e) {
        console.error(e);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Database Error", "Failed to ban user.")] });
    }
}
//# sourceMappingURL=casinoBan.js.map