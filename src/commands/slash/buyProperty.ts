
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("buy-property")
    .setDescription("Purchase a real estate property")
    .addStringOption(opt => opt.setName("key").setDescription("The property key (e.g. pent, apt)").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const key = interaction.options.getString("key", true);
    await interaction.deferReply();

    const result = await PropertyService.buyProperty(interaction.user.id, interaction.guildId, key);

    const embed = new EmbedBuilder()
        .setDescription(result.message)
        .setColor(result.success ? (Mascot.Colors.Success as any) : 0xFF0000); // Red if fail

    if (result.success) embed.setTitle(`${Mascot.Emotes.Accept} Purchase Successful`);
    else embed.setTitle(`${Mascot.Emotes.Fail} Purchase Failed`);

    return interaction.editReply({ embeds: [embed] });
}
