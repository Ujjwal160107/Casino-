"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStock = handleStock;
const discord_js_1 = require("discord.js");
const stockService_1 = require("../../services/stockService");
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
const embed_1 = require("../../utils/embed");
async function handleStock(message, args) {
    // Ensure stocks exist (lazy init per guild)
    if (!message.guildId)
        return;
    await (0, stockService_1.initStocks)(message.guildId);
    const sub = args[0]?.toLowerCase();
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    if (sub === "buy") {
        const symbol = args[1];
        const qty = parseInt(args[2]);
        if (!symbol || isNaN(qty))
            return message.reply("Usage: `!stock buy <symbol> <quantity>`");
        try {
            const res = await (0, stockService_1.buyStock)(message.guildId, message.author.id, symbol, qty);
            return message.reply({
                embeds: [(0, embed_1.successEmbed)(message.author, "Stock Purchased", `Bought **${res.newQty - (res.newQty - qty)}x ${res.stock.symbol}** for **${(0, format_1.fmtCurrency)(res.cost, emoji)}**.\nYou now own ${res.newQty}.`)]
            });
        }
        catch (e) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Purchase Failed", e.message)] });
        }
    }
    if (sub === "sell") {
        const symbol = args[1];
        const qty = parseInt(args[2]);
        if (!symbol || isNaN(qty))
            return message.reply("Usage: `!stock sell <symbol> <quantity>`");
        try {
            const res = await (0, stockService_1.sellStock)(message.guildId, message.author.id, symbol, qty);
            const profitStr = res.profit >= 0 ? `+${(0, format_1.fmtCurrency)(res.profit, emoji)}` : `-${(0, format_1.fmtCurrency)(Math.abs(res.profit), emoji)}`;
            return message.reply({
                embeds: [(0, embed_1.successEmbed)(message.author, "Stock Sold", `Sold **${qty}x ${res.stock.symbol}** for **${(0, format_1.fmtCurrency)(res.value, emoji)}**.\nProfit/Loss: **${profitStr}**.`)]
            });
        }
        catch (e) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Sale Failed", e.message)] });
        }
    }
    if (sub === "portfolio" || sub === "port") {
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
    // Default: Show Market (Per Guild)
    const stocks = await (0, stockService_1.getAllStocks)(message.guildId);
    const file = new discord_js_1.AttachmentBuilder("./src/assets/stock_market.jpg");
    const desc = stocks.map(s => {
        // Trend arrow based on price vs base logic (simplified)
        // Or if we stored 'lastPrice' we could do real trend.
        // For now, if price > base = Green, else Red
        const trend = s.currentPrice >= s.basePrice ? branding_1.Mascot.Emotes.Graph : branding_1.Mascot.Emotes.GraphDown;
        const volatility = s.volatility > 10 ? `${branding_1.Mascot.Emotes.Alert} High Risk` : `${branding_1.Mascot.Emotes.Accept} Stable`;
        return `**${s.symbol}** (${s.name}) - ${trend} **${(0, format_1.fmtCurrency)(s.currentPrice, emoji)}**\n*${volatility}*`;
    }).join("\n\n");
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`📈 Global Stock Market`)
        .setDescription(`Market updates every 10 minutes.\n\n${desc}`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setImage("attachment://stock_market.jpg")
        .setFooter({ text: "Use !stock buy <symbol> <qty> to invest." });
    message.reply({ embeds: [embed], files: [file] });
}
//# sourceMappingURL=stock.js.map