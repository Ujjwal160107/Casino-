"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCasinoUnban = handleCasinoUnban;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
async function handleCasinoUnban(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Permission", "Administrator or Bot Commander required.")] });
    }
    const mention = args[0];
    if (!mention) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}casinounban @user\``)] });
    }
    const discordId = mention.replace(/[<@!>]/g, "");
    try {
        const user = await prisma_1.default.user.update({
            where: { discordId_guildId: { discordId, guildId: message.guildId } },
            data: { isBanned: false }
        });
        const { logToChannel } = require("../../utils/discordLogger");
        await logToChannel(message.client, {
            guild: message.guild,
            type: "MODERATION",
            title: "User Unbanned",
            description: `**User:** <@${discordId}>\n**Unbanned By:** ${message.author.tag}`,
            color: 0x00FF00
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "User Unbanned", `${branding_1.Mascot.Emotes.Accept} **<@${discordId}>** has been unbanned from the casino.`)]
        });
    }
    catch (error) {
        console.error(error);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Failed to unban user (maybe they aren't in the DB?).")] });
    }
}
//# sourceMappingURL=casinoUnban.js.map