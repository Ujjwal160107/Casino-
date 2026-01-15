"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const bankingService_1 = require("../../services/bankingService");
const embed_1 = require("../../utils/embed");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const walletService_1 = require("../../services/walletService");
const branding_1 = require("../../config/branding");
exports.data = {
    name: "bank",
    description: "Manage your finances: Loans, Investments, and Credit Score.",
};
async function execute(message, args) {
    const user = message.author || message.user;
    const guildId = message.guildId;
    if (!user || !guildId)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const subCommand = args[0]?.toLowerCase();
    if (subCommand === "repay") {
        const amountStr = args[1];
        if (!amountStr)
            return message.reply(`Usage: \`${config.prefix}bank repay <amount>\``);
        const userWallet = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
        const amount = (0, format_1.parseSmartAmount)(amountStr, userWallet.wallet.balance);
        if (isNaN(amount) || amount <= 0)
            return message.reply("Invalid amount.");
        try {
            await (0, bankingService_1.repayLoan)(user.id, guildId, amount);
            return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Loan Repaid", `Repaid **${(0, format_1.fmtCurrency)(amount)}** towards your loan.`)] });
        }
        catch (e) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Repayment Failed", e.message)] });
        }
    }
    const summary = await (0, bankingService_1.getFinancialSummary)(user.id, guildId);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${user.username}'s Financial Dashboard`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`Welcome to the ${config.currencyName} Bank. Manage your assets and liabilities here.`)
        .addFields({ name: `${branding_1.Mascot.Emotes.Money} Net Worth`, value: `${config.currencyEmoji} ${summary.netWorth.toLocaleString('en-US')}`, inline: true }, { name: "<a:credits:1445689337172721716> Credit Score", value: `${summary.creditScore}`, inline: true }, {
        name: `${config.currencyEmoji} Active Loans`, value: summary.activeLoans.length > 0
            ? `**${summary.activeLoans.length} Active**\n(Use \`${config.prefix}credit\` for details)`
            : "None", inline: true
    }, { name: `${branding_1.Mascot.Emotes.Think} Investments`, value: `${summary.investments.length} Active`, inline: true })
        .setFooter({ text: `${branding_1.Mascot.Name} • Use the buttons below to navigate.` });
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("bank_deposit_withdraw")
        .setLabel("Deposit/Withdraw")
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setEmoji(config.currencyEmoji), new discord_js_1.ButtonBuilder()
        .setCustomId("bank_loans")
        .setLabel("Loans")
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setEmoji("<a:credits:1445689337172721716>"), new discord_js_1.ButtonBuilder()
        .setCustomId("bank_invest")
        .setLabel("Investments")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setEmoji("<:graph:1445689267861979197>"), new discord_js_1.ButtonBuilder()
        .setCustomId("bank_refresh")
        .setLabel("Refresh")
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setEmoji("🔄"));
    if (message.reply) {
        await message.reply({ embeds: [embed], components: [row] });
    }
    else {
        await message.reply({ embeds: [embed], components: [row] }); // Logic seems duplicated for message/interaction support but keeping as is
    }
}
//# sourceMappingURL=bank.js.map