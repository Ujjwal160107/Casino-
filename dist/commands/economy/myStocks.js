"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMyStocks = handleMyStocks;
const discord_js_1 = require("discord.js");
const stockService_1 = require("../../services/stockService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const branding_1 = require("../../config/branding");
const embed_1 = require("../../utils/embed");
async function handleMyStocks(message) {
    if (!message.guildId)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const pf = await (0, stockService_1.getPortfolio)(message.guildId, message.author.id);
    if (!pf || pf.holdings.length === 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Portfolio Empty", "You don't own any stocks.")] });
    }
    let totalValue = 0;
    let totalCost = 0;
    const lines = pf.holdings.map(h => {
        const val = h.stock.currentPrice * h.quantity;
        const cost = h.avgBuyPrice * h.quantity;
        totalValue += val;
        totalCost += cost;
        const pnl = val - cost;
        const pnlIcon = pnl >= 0 ? branding_1.Mascot.Emotes.Graph : branding_1.Mascot.Emotes.GraphDown;
        const pnlStr = pnl >= 0 ? `+${(0, format_1.fmtCurrency)(pnl, emoji)}` : `-${(0, format_1.fmtCurrency)(Math.abs(pnl), emoji)}`;
        return `**${h.stock.symbol}**: ${h.quantity} shares @ ${(0, format_1.fmtCurrency)(h.stock.currentPrice, emoji)} (Avg: ${h.avgBuyPrice})\nValue: **${(0, format_1.fmtCurrency)(val, emoji)}** (${pnlIcon} ${pnlStr})`;
    });
    const totalPnl = totalValue - totalCost;
    const totalPnlStr = totalPnl >= 0 ? `+${(0, format_1.fmtCurrency)(totalPnl, emoji)}` : `-${(0, format_1.fmtCurrency)(Math.abs(totalPnl), emoji)}`;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`📊 Stock Portfolio: ${message.author.username}`)
        .setDescription(`**Total Value:** ${(0, format_1.fmtCurrency)(totalValue, emoji)}\n**Total Profit:** ${totalPnlStr}\n\n${lines.join("\n\n")}`)
        .setColor(branding_1.Mascot.Colors.Base);
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=myStocks.js.map