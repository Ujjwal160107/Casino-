"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMakeCasinoAdmin = handleMakeCasinoAdmin;
exports.handleRemoveCasinoAdmin = handleRemoveCasinoAdmin;
exports.handleListCasinoAdmins = handleListCasinoAdmins;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
async function handleMakeCasinoAdmin(message, args) {
    const BOT_OWNER_ID = "1288340046449086567";
    if (message.author.id !== message.guild?.ownerId && message.author.id !== BOT_OWNER_ID) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Only the **Server Owner** or **Bot Owner** can use this command.")] });
    }
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Mention a user to promote.\nExample: \`${config.prefix}make-casino-admin @user\``)] });
    }
    try {
        if (!message.guild)
            return;
        await prisma_1.default.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isCasinoAdmin: true }
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Casino Admin Promoted",
            description: `**User:** ${targetUser.tag}\n**Promoted By:** ${message.author.tag}`,
            color: 0x00FF00
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Promoted", `${branding_1.Mascot.Emotes.Accept} **${targetUser.tag}** is now a **Casino Admin**.`)]
        });
    }
    catch (e) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Ensure the user is registered in the bot.")] });
    }
}
async function handleRemoveCasinoAdmin(message, args) {
    const BOT_OWNER_ID = "1288340046449086567";
    if (message.author.id !== message.guild?.ownerId && message.author.id !== BOT_OWNER_ID) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Only the **Server Owner** or **Bot Owner** can use this command.")] });
    }
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Mention a user to demote.\nExample: \`${config.prefix}remove-casino-admin @user\``)] });
    }
    try {
        if (!message.guild)
            return;
        await prisma_1.default.user.update({
            where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guild.id } },
            data: { isCasinoAdmin: false }
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Casino Admin Demoted",
            description: `**User:** ${targetUser.tag}\n**Demoted By:** ${message.author.tag}`,
            color: 0xFF0000
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Demoted", `${branding_1.Mascot.Emotes.Accept} **${targetUser.tag}** is no longer a Casino Admin.`)]
        });
    }
    catch (e) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Ensure the user is registered in the bot.")] });
    }
}
async function handleListCasinoAdmins(message) {
    const admins = await prisma_1.default.user.findMany({
        where: { isCasinoAdmin: true, guildId: message.guildId }
    });
    if (admins.length === 0) {
        return message.reply({ embeds: [new discord_js_1.EmbedBuilder().setTitle("Casino Admins").setDescription("None assigned.").setColor("#FFD700")] });
    }
    const list = admins.map((u, i) => `${i + 1}. <@${u.discordId}>`).join("\n");
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`🛡️ Casino Admins (${admins.length})`)
        .setDescription(list)
        .setColor("#FFD700")
        .setFooter({ text: "Casino Admins have elevated privileges." });
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=manageCasinoAdmin.js.map