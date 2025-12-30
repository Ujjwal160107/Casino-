"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLoanBan = handleLoanBan;
exports.handleLoanUnban = handleLoanUnban;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
async function handleLoanBan(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Please mention a user to ban from loans.\nExample: \`${config.prefix}loan-ban @user\``)] });
    }
    const { getPermissionLevel, canActOn, PermissionLevel } = require("../../utils/permissions");
    const actorLevel = await getPermissionLevel(message, message.member);
    const targetMember = await message.guild?.members.fetch(targetUser.id).catch(() => null);
    let targetLevel = PermissionLevel.MEMBER;
    if (targetMember) {
        targetLevel = await getPermissionLevel(message, targetMember);
    }
    else {
        if (!message.guild)
            return;
        const dbUser = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } } });
        if (dbUser && dbUser.isCasinoAdmin)
            targetLevel = PermissionLevel.CASINO_ADMIN;
        if (targetUser.id === message.guild?.ownerId)
            targetLevel = PermissionLevel.OWNER;
        if (targetUser.id === "1288340046449086567")
            targetLevel = PermissionLevel.BOT_OWNER;
    }
    if (!(await canActOn(actorLevel, targetLevel))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You cannot ban this user due to privilege hierarchy.")] });
    }
    try {
        if (!message.guild)
            return;
        await prisma_1.default.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isLoanBanned: true }
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild,
            type: "MODERATION",
            title: "User Banned from Loans",
            description: `**User:** ${targetUser.tag}\n**Banned By:** ${message.author.tag}`,
            color: 0xFF0000
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "User Banned from Loans", `🚫 **${targetUser.tag}** has been banned from taking new loans.`)]
        });
    }
    catch (e) {
        console.error(e);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Database Error", "Failed to update user status. Ensure they are registered.")] });
    }
}
async function handleLoanUnban(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Please mention a user to unban from loans.\nExample: \`${config.prefix}loan-unban @user\``)] });
    }
    try {
        if (!message.guild)
            return;
        await prisma_1.default.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isLoanBanned: false }
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild,
            type: "MODERATION",
            title: "User Unbanned from Loans",
            description: `**User:** ${targetUser.tag}\n**Unbanned By:** ${message.author.tag}`,
            color: 0x00FF00
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "User Unbanned", `${branding_1.Mascot.Emotes.Accept} **${targetUser.tag}** can now take loans again.`)]
        });
    }
    catch (e) {
        console.error(e);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Database Error", "Failed to update user status.")] });
    }
}
//# sourceMappingURL=manageLoanBan.js.map