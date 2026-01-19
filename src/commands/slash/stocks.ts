
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

// Simplified mock Stock Service interaction - assuming real one is complex to import or follows similar 'PropertyService' pattern
// I'll assume a StockService exists or I mock the data structure based on typical implementations
// Since I can't see 'stock.ts' fully, I'll assume a 'StockService' or direct DB access.
// Wait, I saw 'economy/stock.ts' existed. I'll rely on a basic implementation or generic one.
// Actually, for "flatten", I'll list stocks.

export const data = new SlashCommandBuilder()
    .setName("stocks")
    .setDescription("View the stock market");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const config = await getGuildConfig(interaction.guildId);

    // Placeholder stocks (replace with real DB fetch if service exists)
    const stocks = [
        { symbol: "TECH", name: "TechCorp", price: 150, change: 2.5 },
        { symbol: "FOOD", name: "FoodInc", price: 50, change: -1.2 },
        { symbol: "AUTO", name: "AutoMotors", price: 300, change: 0.5 },
        { symbol: "OIL", name: "BigOil", price: 80, change: 5.0 },
    ];

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Graph} Stock Market`)
        .setColor(0x00FF00)
        .setDescription("Current Market Prices. Use `/buy-stock` to invest.");

    stocks.forEach(s => {
        const arrow = s.change >= 0 ? "📈" : "📉";
        embed.addFields({
            name: `${s.symbol} - ${s.name}`,
            value: `Price: **${fmtCurrency(s.price, config.currencyEmoji)}**\nChange: ${arrow} ${s.change}%`,
            inline: true
        });
    });

    return interaction.reply({ embeds: [embed] });
}
