import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { getFinancialSummary, repayLoan } from "../../services/bankingService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { ensureUserAndWallet } from "../../services/walletService";
import { Mascot } from "../../config/branding";

export const data = {
    name: "bank",
    description: "Manage your finances: Loans, Investments, and Credit Score.",
};

export async function execute(message: Message | any, args: string[]) {
    const user = message.author || message.user;
    const guildId = message.guildId;
    if (!user || !guildId) return;

    const config = await getGuildConfig(guildId);
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "repay") {
        const amountStr = args[1];
        if (!amountStr) return message.reply(`Usage: \`${config.prefix}bank repay <amount>\``);
        const userWallet = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
        const amount = parseSmartAmount(amountStr, userWallet.wallet!.balance);
        if (isNaN(amount) || amount <= 0) return message.reply("Invalid amount.");
        try {
            await repayLoan(user.id, guildId, amount);
            return message.reply({ embeds: [successEmbed(message.author, "Loan Repaid", `Repaid **${fmtCurrency(amount)}** towards your loan.`)] });
        } catch (e) {
            return message.reply({ embeds: [errorEmbed(message.author, "Repayment Failed", (e as Error).message)] });
        }
    }



    const summary = await getFinancialSummary(user.id, guildId);
    const embed = new EmbedBuilder()
        .setTitle(`${user.username}'s Financial Dashboard`)
        .setColor(Mascot.Colors.Base as any)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`Welcome to the ${config.currencyName} Bank. Manage your assets and liabilities here.`)
        .addFields(
            { name: `${Mascot.Emotes.Money} Net Worth`, value: `${config.currencyEmoji} ${summary.netWorth.toLocaleString('en-US')}`, inline: true },
            { name: "<a:credits:1445689337172721716> Credit Score", value: `${summary.creditScore}`, inline: true },
            {
                name: `${config.currencyEmoji} Active Loans`, value: summary.activeLoans.length > 0
                    ? `**${summary.activeLoans.length} Active**\n(Use \`${config.prefix}credit\` for details)`
                    : "None", inline: true
            },
            { name: `${Mascot.Emotes.Think} Investments`, value: `${summary.investments.length} Active`, inline: true }
        )
        .setFooter({ text: `${Mascot.Name} • Use the buttons below to navigate.` });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("bank_deposit_withdraw")
                .setLabel("Deposit/Withdraw")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(config.currencyEmoji),
            new ButtonBuilder()
                .setCustomId("bank_loans")
                .setLabel("Loans")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("<a:credits:1445689337172721716>"),
            new ButtonBuilder()
                .setCustomId("bank_invest")
                .setLabel("Investments")
                .setStyle(ButtonStyle.Success)
                .setEmoji("<:graph:1445689267861979197>"),
            new ButtonBuilder()
                .setCustomId("bank_refresh")
                .setLabel("Refresh")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔄")
        );

    if (message.reply) {
        await message.reply({ embeds: [embed], components: [row] });
    } else {
        await message.reply({ embeds: [embed], components: [row] }); // Logic seems duplicated for message/interaction support but keeping as is
    }
}