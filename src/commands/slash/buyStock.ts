
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
// Placeholder logic
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("buy-stock")
    .setDescription("Buy stocks")
    .addStringOption(opt => opt.setName("symbol").setDescription("Stock Symbol").setRequired(true))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Amount to buy").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    // Placeholder
    const sym = interaction.options.getString("symbol", true);
    const amt = interaction.options.getInteger("amount", true);

    return interaction.reply({
        embeds: [new EmbedBuilder().setColor(Mascot.Colors.Base as any).setDescription(`Successfully bought **${amt}** shares of **${sym}** (Simulated).`)],
        ephemeral: true
    });
}
