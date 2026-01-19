
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("collect-rent")
    .setDescription("Collect rent from your properties");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();

    const result = await PropertyService.collectRent(interaction.user.id, interaction.guildId);

    const embed = new EmbedBuilder()
        .setDescription(result.message)
        .setColor(result.success ? (Mascot.Colors.Success as any) : 0xFF0000);

    if (result.success) embed.setTitle(`${Mascot.Emotes.Accept} Rent Collected`);
    else embed.setTitle(`${Mascot.Emotes.Fail} Status`);

    return interaction.editReply({ embeds: [embed] });
}
