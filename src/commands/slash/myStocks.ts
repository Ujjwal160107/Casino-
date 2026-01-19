
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("my-stocks")
    .setDescription("View your stock portfolio");

export async function execute(interaction: ChatInputCommandInteraction) {
    // Placeholder
    const embed = new EmbedBuilder()
        .setTitle("📈 Portfolio")
        .setDescription("You currently own no stocks.")
        .setColor(Mascot.Colors.Base as any);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}
