
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, AttachmentBuilder, Colors } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("properties")
    .setDescription("View available properties for sale");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId);
    const properties = await PropertyService.getAllProperties(interaction.guildId);

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Name} Real Estate Market`)
        .setDescription("Invest in properties to earn passive income and grow your net worth!\nPrices fluctuate based on market demand.")
        .setColor(Mascot.Colors.Base as any)
        .setFooter({ text: `Use /buy-property <key> to purchase` });

    if (properties.length === 0) {
        embed.setDescription("No properties available for sale right now. Ask an admin to create some!");
    } else {
        properties.forEach(p => {
            embed.addFields({
                name: `${p.name} (\`${p.key}\`)`,
                value: `${Mascot.Emotes.Price} **Price:** ${fmtCurrency(p.price, config.currencyEmoji)}\n${Mascot.Emotes.Graph} **Base Price:** ${fmtCurrency(p.basePrice, config.currencyEmoji)}\n${Mascot.Emotes.MoneyBag} **Income:** ${fmtCurrency(p.incomePerCycle, config.currencyEmoji)}/${p.incomeCycleHours}h\n${Mascot.Emotes.Trade} **Sold:** ${p.totalSold}`,
                inline: true
            });
        });
    }

    // Try to attach banner if exists locally, otherwise skip
    // const bannerFile = new AttachmentBuilder("./assets/property_banner.png", { name: 'property-banner.png' });
    // embed.setImage('attachment://property-banner.png');
    // For slash commands, relative paths might be tricky depending on CWD. Skipping image for stability unless crucial.

    return interaction.editReply({ embeds: [embed] });
}
