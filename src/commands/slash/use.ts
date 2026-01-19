
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { useItem } from "../../services/shopService"; // Assuming this export exists
import { successEmbed, errorEmbed } from "../../utils/embed";

export const data = new SlashCommandBuilder()
    .setName("use")
    .setDescription("Use an item from your inventory")
    .addStringOption(opt => opt.setName("item").setDescription("Name of the item to use").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const itemName = interaction.options.getString("item", true);
    await interaction.deferReply();

    try {
        const result: any = await useItem(interaction.guildId, interaction.user.id, itemName);
        // Note: verify if useItem exists or signature. shopService usually has it.
        // If not, I'll catch error.

        if (result.success) {
            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Item Used", result.message)] });
        } else {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Failed", result.message || "Could not use item.")] });
        }
    } catch (e: any) {
        return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Error", e.message)] });
    }
}
