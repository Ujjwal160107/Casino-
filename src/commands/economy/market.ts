import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { getMarketListings } from "../../services/marketService";
import { Mascot } from "../../config/branding";

export async function execute(message: Message, args: string[]) {
    if (!message.guildId) return;
    const config = await getGuildConfig(message.guildId);
    const { total } = await getMarketListings(message.guildId, 1, 1);
    const embed = new EmbedBuilder()
        .setTitle("🏴‍☠️ Black Market")
        .setDescription(`Welcome to the underground.\n\n**Market Tax:** ${config.marketTax}%\n**Active Listings:** ${total}`)
        .setColor(Mascot.Colors.Base as any)
        .setThumbnail("https://media.tenor.com/azwT6M5tO3EAAAAC/black-market.gif")
        .setFooter({ text: `${Mascot.Name} • Buy, Sell, and Trade items securely.` });
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder().setCustomId("market_browse_1").setLabel("Browse Market").setStyle(ButtonStyle.Primary).setEmoji("🛒"),
            new ButtonBuilder().setCustomId("market_sell_flow").setLabel("Sell Item").setStyle(ButtonStyle.Success).setEmoji("➕"),
            new ButtonBuilder().setCustomId("market_sell_prop_flow").setLabel("Sell Property").setStyle(ButtonStyle.Success).setEmoji("🏠"),
            new ButtonBuilder().setCustomId("market_buy_flow").setLabel("Buy by ID").setStyle(ButtonStyle.Secondary).setEmoji("🔍"),
            new ButtonBuilder().setCustomId("market_mine").setLabel("My Listings").setStyle(ButtonStyle.Danger).setEmoji("📦")
        );
    await message.reply({ embeds: [embed], components: [row] });
}