import { Message, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { getAllStocks, getPortfolio, buyStock, sellStock, initStocks } from "../../services/stockService";
import { fmtCurrency, fmtAmount } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { errorEmbed, successEmbed } from "../../utils/embed";

export async function handleStock(message: Message, args: string[]) {
    // Ensure stocks exist (lazy init per guild)
    if (!message.guildId) return;
    await initStocks(message.guildId);

    const sub = args[0]?.toLowerCase();
    const config = await getGuildConfig(message.guildId!);
    const emoji = config.currencyEmoji;

    if (sub === "buy") {
        const symbol = args[1];
        const qty = parseInt(args[2]);
        if (!symbol || isNaN(qty)) return message.reply("Usage: `!stock buy <symbol> <quantity>`");

        try {
            const res = await buyStock(message.guildId, message.author.id, symbol, qty);
            return message.reply({
                embeds: [successEmbed(message.author, "Stock Purchased", `Bought **${res.newQty - (res.newQty - qty)}x ${res.stock.symbol}** for **${fmtCurrency(res.cost, emoji)}**.\nYou now own ${res.newQty}.`)]
            });
        } catch (e: any) {
            return message.reply({ embeds: [errorEmbed(message.author, "Purchase Failed", e.message)] });
        }
    }

    if (sub === "sell") {
        const symbol = args[1];
        const qty = parseInt(args[2]);
        if (!symbol || isNaN(qty)) return message.reply("Usage: `!stock sell <symbol> <quantity>`");

        try {
            const res = await sellStock(message.guildId, message.author.id, symbol, qty);
            const profitStr = res.profit >= 0 ? `+${fmtCurrency(res.profit, emoji)}` : `-${fmtCurrency(Math.abs(res.profit), emoji)}`;
            return message.reply({
                embeds: [successEmbed(message.author, "Stock Sold", `Sold **${qty}x ${res.stock.symbol}** for **${fmtCurrency(res.value, emoji)}**.\nProfit/Loss: **${profitStr}**.`)]
            });
        } catch (e: any) {
            return message.reply({ embeds: [errorEmbed(message.author, "Sale Failed", e.message)] });
        }
    }

    if (sub === "portfolio" || sub === "port") {
        const pf = await getPortfolio(message.guildId, message.author.id);
        if (!pf || pf.holdings.length === 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "Portfolio Empty", "You don't own any stocks.")] });
        }

        let totalValue = 0;
        let totalCost = 0;

        const lines = pf.holdings.map(h => {
            const val = h.stock.currentPrice * h.quantity;
            const cost = h.avgBuyPrice * h.quantity;
            totalValue += val;
            totalCost += cost;

            const pnl = val - cost;
            const pnlIcon = pnl >= 0 ? Mascot.Emotes.Graph : Mascot.Emotes.GraphDown;
            const pnlStr = pnl >= 0 ? `+${fmtCurrency(pnl, emoji)}` : `-${fmtCurrency(Math.abs(pnl), emoji)}`;

            return `**${h.stock.symbol}**: ${h.quantity} shares @ ${fmtCurrency(h.stock.currentPrice, emoji)} (Avg: ${h.avgBuyPrice})\nValue: **${fmtCurrency(val, emoji)}** (${pnlIcon} ${pnlStr})`;
        });

        const totalPnl = totalValue - totalCost;
        const totalPnlStr = totalPnl >= 0 ? `+${fmtCurrency(totalPnl, emoji)}` : `-${fmtCurrency(Math.abs(totalPnl), emoji)}`;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Stock Portfolio: ${message.author.username}`)
            .setDescription(`**Total Value:** ${fmtCurrency(totalValue, emoji)}\n**Total Profit:** ${totalPnlStr}\n\n${lines.join("\n\n")}`)
            .setColor(Mascot.Colors.Base as any);

        return message.reply({ embeds: [embed] });
    }

    // Default: Show Market (Per Guild)
    const stocks = await getAllStocks(message.guildId);
    const file = new AttachmentBuilder("./src/assets/stock_market.jpg");

    const desc = stocks.map(s => {
        // Trend arrow based on price vs base logic (simplified)
        // Or if we stored 'lastPrice' we could do real trend.
        // For now, if price > base = Green, else Red
        const trend = s.currentPrice >= s.basePrice ? Mascot.Emotes.Graph : Mascot.Emotes.GraphDown;
        const volatility = s.volatility > 10 ? `${Mascot.Emotes.Alert} High Risk` : `${Mascot.Emotes.Accept} Stable`;

        return `**${s.symbol}** (${s.name}) - ${trend} **${fmtCurrency(s.currentPrice, emoji)}**\n*${volatility}*`;
    }).join("\n\n");

    const embed = new EmbedBuilder()
        .setTitle(`📈 Global Stock Market`)
        .setDescription(`Market updates every 10 minutes.\n\n${desc}`)
        .setColor(Mascot.Colors.Base as any)
        .setImage("attachment://stock_market.jpg")
        .setFooter({ text: "Use !stock buy <symbol> <qty> to invest." });

    message.reply({ embeds: [embed], files: [file] });
}
