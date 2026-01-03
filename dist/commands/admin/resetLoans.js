"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleResetLoans = handleResetLoans;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const guildConfigService_1 = require("../../services/guildConfigService");
const discordLogger_1 = require("../../utils/discordLogger");
async function handleResetLoans(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }
    const targetUser = message.mentions.users.first();
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    if (!targetUser) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Please mention a user to reset loans for.\nExample: \`${config.prefix}reset-loans @user\``)] });
    }
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guildId } }
    });
    if (!user) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "User Not Found", "This user is not registered in the casino system.")] });
    }
    try {
        const result = await prisma_1.default.loan.deleteMany({
            where: { userId: user.id }
        });
        if (result.count === 0) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Loans Found", "This user does not have any loan records to reset.")] });
        }
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Loans Reset",
            description: `**Target:** ${targetUser.tag}\n**Admin:** ${message.author.tag}\n**Records Deleted:** ${result.count}`,
            color: 0xFF0000
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Loans Reset", `Successfully deleted **${result.count}** loan record(s) for ${targetUser.tag}. They correspond to a clean slate.`)]
        });
    }
    catch (e) {
        console.error(e);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Database Error", "Failed to reset loans.")] });
    }
}
//# sourceMappingURL=resetLoans.js.map