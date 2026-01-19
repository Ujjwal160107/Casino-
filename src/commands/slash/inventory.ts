
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { getUserInventory } from "../../services/shopService";

export const data = new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your current inventory");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const inv = await getUserInventory(interaction.user.id, interaction.guildId!);

    if (inv.length === 0) return interaction.editReply("Your inventory is empty.");

    const desc = inv.map(i => {
        const item = i.shopItem;
        const usable = (item.consumable || item.effects) ? " **[USE]**" : "";
        return `• **${item.name}${usable}** (x${i.amount})`;
    }).join("\n");

    const embed = new EmbedBuilder().setTitle(`${interaction.user.username}'s Inventory`).setColor(Colors.Blue).setDescription(desc || "Empty");
    return interaction.editReply({ embeds: [embed] });
}
