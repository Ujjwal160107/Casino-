import { Message, EmbedBuilder } from "discord.js";
import { getFinancialSummary, calculateCreditLimits } from "../../services/bankingService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { Mascot } from "../../config/branding";

export async function handleCredit(message: Message, args: string[]) {
    const targetUser = message.mentions.users.first() || message.author;
    const userSummary = await getFinancialSummary(targetUser.id, message.guildId!);
    const config = await getGuildConfig(message.guildId!);
    const limits = calculateCreditLimits(userSummary.creditScore, config);
    const emoji = config.currencyEmoji;
    let scoreColor = 0xFF0000;
    if (userSummary.creditScore >= 500) scoreColor = 0xFFA500;
    if (userSummary.creditScore >= 700) scoreColor = 0x00FF00;
    if (userSummary.creditScore >= 900) scoreColor = 0x00FFFF;
    const embed = new EmbedBuilder()
        .setTitle(`<a:credits:1445689337172721716> Credit Profile: ${targetUser.username}`)
        .setColor(scoreColor)
        .addFields(
            { name: "Credit Score", value: `**${userSummary.creditScore}**`, inline: true },
            { name: "Max Loan Amount", value: `${fmtCurrency(limits.maxLoan, emoji)}`, inline: true },
            { name: "Max Duration", value: `${formatDuration(limits.maxDays * 86400000)}`, inline: true }
        );
    if (userSummary.activeLoans.length > 0) {
        embed.addFields({ name: "Active Loans", value: `${userSummary.activeLoans.length} Active`, inline: false });
        userSummary.activeLoans.forEach((loan, i) => {
            const isOverdue = new Date() > new Date(loan.dueDate);
            const dueTimestamp = Math.floor(loan.dueDate.getTime() / 1000);
            embed.addFields(
                { name: `Loan #${i + 1}`, value: `**Principal:** ${fmtCurrency(loan.amount, emoji)}\n**Due:** ${fmtCurrency(loan.totalRepayment, emoji)}\n**When:** <t:${dueTimestamp}:R> ${isOverdue ? `${Mascot.Emotes.Alert} **OVERDUE**` : ""}`, inline: true }
            );
        });
    } else {
        embed.addFields({ name: "Active Loan", value: "None", inline: false });
    }
    embed.setFooter({ text: "Pay loans on time to increase your score!" });
    return message.reply({ embeds: [embed] });
}