"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCredit = handleCredit;
const discord_js_1 = require("discord.js");
const bankingService_1 = require("../../services/bankingService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const branding_1 = require("../../config/branding");
async function handleCredit(message, args) {
    const targetUser = message.mentions.users.first() || message.author;
    const userSummary = await (0, bankingService_1.getFinancialSummary)(targetUser.id, message.guildId);
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const limits = (0, bankingService_1.calculateCreditLimits)(userSummary.creditScore, config);
    const emoji = config.currencyEmoji;
    let scoreColor = 0xFF0000;
    if (userSummary.creditScore >= 500)
        scoreColor = 0xFFA500;
    if (userSummary.creditScore >= 700)
        scoreColor = 0x00FF00;
    if (userSummary.creditScore >= 900)
        scoreColor = 0x00FFFF;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`<a:credits:1445689337172721716> Credit Profile: ${targetUser.username}`)
        .setColor(scoreColor)
        .addFields({ name: "Credit Score", value: `**${userSummary.creditScore}**`, inline: true }, { name: "Max Loan Amount", value: `${(0, format_1.fmtCurrency)(limits.maxLoan, emoji)}`, inline: true }, { name: "Max Duration", value: `${(0, format_1.formatDuration)(limits.maxDays * 86400000)}`, inline: true });
    if (userSummary.activeLoans.length > 0) {
        embed.addFields({ name: "Active Loans", value: `${userSummary.activeLoans.length} Active`, inline: false });
        userSummary.activeLoans.forEach((loan, i) => {
            const isOverdue = new Date() > new Date(loan.dueDate);
            const dueTimestamp = Math.floor(loan.dueDate.getTime() / 1000);
            embed.addFields({ name: `Loan #${i + 1}`, value: `**Principal:** ${(0, format_1.fmtCurrency)(loan.amount, emoji)}\n**Due:** ${(0, format_1.fmtCurrency)(loan.totalRepayment, emoji)}\n**When:** <t:${dueTimestamp}:R> ${isOverdue ? `${branding_1.Mascot.Emotes.Alert} **OVERDUE**` : ""}`, inline: true });
        });
    }
    else {
        embed.addFields({ name: "Active Loan", value: "None", inline: false });
    }
    embed.setFooter({ text: "Pay loans on time to increase your score!" });
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=credit.js.map