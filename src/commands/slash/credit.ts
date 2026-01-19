
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import prisma from "../../utils/prisma";

export const data = new SlashCommandBuilder()
    .setName("credit")
    .setDescription("Check your credit score");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId } }
    });

    const score = user?.creditScore || 300; // Default if not set

    let rating = "Poor";
    let color = 0xFF0000;
    if (score >= 700) { rating = "Excellent"; color = 0x00FF00; }
    else if (score >= 500) { rating = "Good"; color = 0xFFFF00; }

    const embed = new EmbedBuilder()
        .setTitle("💳 Credit Score")
        .setDescription(`**Score:** ${score}\n**Rating:** ${rating}`)
        .setColor(color)
        .setFooter({ text: "Pay loans on time to improve." });

    return interaction.editReply({ embeds: [embed] });
}
