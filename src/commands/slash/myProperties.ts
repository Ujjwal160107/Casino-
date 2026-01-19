
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("my-properties")
    .setDescription("View your owned properties");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();

    const config = await getGuildConfig(interaction.guildId);
    const owned = await PropertyService.getOwnedProperties(interaction.user.id, interaction.guildId);

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Portfolio`)
        .setColor(Mascot.Colors.Base as any);

    if (owned.length === 0) {
        embed.setDescription(`You don't own any properties yet. Use \`/properties\` to view the market.`);
    } else {
        let totalIncome = 0;
        owned.forEach(op => {
            const p = op.property;
            totalIncome += p.incomePerCycle;

            const nextCollect = new Date(op.lastCollected.getTime() + (p.incomeCycleHours * 60 * 60 * 1000));
            const ready = new Date() >= nextCollect;
            const status = ready ? `${Mascot.Emotes.Accept} **Rent Due**` : `${Mascot.Emotes.Cooldown} Due <t:${Math.floor(nextCollect.getTime() / 1000)}:R>`;

            embed.addFields({
                name: `${p.name}`,
                value: `${Mascot.Emotes.Price} Purchased: ${fmtCurrency(op.purchasedPrice, config.currencyEmoji)}\n${Mascot.Emotes.GraphUp} Val: ${fmtCurrency(p.price, config.currencyEmoji)}\n${Mascot.Emotes.MoneyBag} Rent: ${fmtCurrency(p.incomePerCycle, config.currencyEmoji)}\n${status}`,
                inline: true
            });
        });

        embed.setDescription(`Total Properties: **${owned.length}**\nTotal Potential Income: **${fmtCurrency(totalIncome, config.currencyEmoji)}** per cycle.`);
    }

    return interaction.editReply({ embeds: [embed] });
}
