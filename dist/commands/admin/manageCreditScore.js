"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetCreditScore = handleSetCreditScore;
const walletService_1 = require("../../services/walletService");
const embed_1 = require("../../utils/embed");
const discordLogger_1 = require("../../utils/discordLogger");
const guildConfigService_1 = require("../../services/guildConfigService");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const permissionUtils_1 = require("../../utils/permissionUtils");
async function handleSetCreditScore(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Admins or Bot Commanders only.")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const maxScore = config.maxCreditScore;
    const minScore = 50;
    if (args[0]?.toLowerCase() === "all" || args[0]?.toLowerCase() === "everyone") {
        const amountArg = args[1];
        if (!amountArg) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}set-credit-score all <amount>\`\nExample: \`${config.prefix}set-credit-score all 500\``)]
            });
        }
        const amount = parseInt(amountArg);
        if (isNaN(amount) || amount < minScore || amount > maxScore) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", `Score must be between **${minScore}** and **${maxScore}**.`)] });
        }
        const result = await prisma_1.default.user.updateMany({
            where: { guildId: message.guildId },
            data: { creditScore: amount }
        });
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Bulk Credit Score Set",
            description: `**Admin:** ${message.author.tag}\n**Scope:** ALL USERS\n**New Score:** ${amount}\n**Affected:** ${result.count} users`,
            color: 0xFF4500
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Bulk Update Complete", `Set credit score to **${amount}** for **${result.count}** users.`)]
        });
    }
    const targetUser = message.mentions.users.first();
    const amountArg = args.find(a => !a.startsWith("<@") && !isNaN(parseInt(a)));
    if (!targetUser || !amountArg) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}set-credit-score @user <amount>\` or \`${config.prefix}set-credit-score all <amount>\``)]
        });
    }
    const amount = parseInt(amountArg);
    if (isNaN(amount) || amount < minScore || amount > maxScore) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", `Score must be between **${minScore}** and **${maxScore}**.`)] });
    }
    const user = await (0, walletService_1.ensureUserAndWallet)(targetUser.id, message.guildId, targetUser.tag);
    const updatedUser = await prisma_1.default.user.update({
        where: { id: user.id },
        data: { creditScore: amount }
    });
    await (0, discordLogger_1.logToChannel)(message.client, {
        guild: message.guild,
        type: "ADMIN",
        title: "Credit Score Set",
        description: `**Admin:** ${message.author.tag}\n**User:** ${targetUser.tag}\n**Old Score:** ${user.creditScore}\n**New Score:** ${updatedUser.creditScore}`,
        color: 0xFFA500
    });
    return message.reply({
        embeds: [(0, embed_1.successEmbed)(message.author, "Credit Score Updated", `Set ${targetUser.username}'s credit score to **${updatedUser.creditScore}**.`)]
    });
}
//# sourceMappingURL=manageCreditScore.js.map