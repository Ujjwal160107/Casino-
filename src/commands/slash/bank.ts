
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { ensureBankForUser } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("bank")
    .setDescription("View your bank account details");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    await interaction.deferReply();
    try {
        const config = await getGuildConfig(interaction.guildId);
        // Ensure bank exists (creates if not)
        const bank = await ensureBankForUser(interaction.user.id, interaction.guildId, interaction.user.username);

        const embed = new EmbedBuilder()
            .setTitle(`🏦 Bank of ${Mascot.Name}`)
            .setColor(Mascot.Colors.Base as any)
            .addFields(
                { name: "Balance", value: fmtCurrency(bank.balance, config.currencyEmoji), inline: true },
                { name: "Capacity", value: config.bankLimit ? fmtCurrency(config.bankLimit, config.currencyEmoji) : "Unlimited", inline: true },
                { name: "Interest Rate", value: "2.5% / month", inline: true } // Example
            )
            .setFooter({ text: "Use /deposit and /withdraw to manage funds." });

        return interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
        console.error("Bank Command Error:", error);
        return interaction.editReply({ content: `${Mascot.Emotes.Fail} An error occurred while fetching your bank details: ${error.message}` });
    }
}
