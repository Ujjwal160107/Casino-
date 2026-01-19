
import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { transferAnyFunds } from "../../services/transferService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export const data = new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("Transfer money to another user")
    .addUserOption(opt => opt.setName("user").setDescription("Recipient").setRequired(true))
    .addStringOption(opt => opt.setName("amount").setDescription("Amount to transfer").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const amountStr = interaction.options.getString("amount", true);
    await interaction.deferReply();

    if (targetUser.bot) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Error", "Cannot transfer to bots.")] });
    if (targetUser.id === interaction.user.id) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Error", "Cannot transfer to yourself.")] });

    const config = await getGuildConfig(interaction.guildId!);
    const sender = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    if (!sender.wallet) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Wallet Not Found", "Your wallet not found.")] });

    const amount = parseSmartAmount(amountStr, sender.wallet.balance);
    if (isNaN(amount) || amount <= 0) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });

    await transferAnyFunds(sender.wallet.id, targetUser.id, amount, interaction.user.id, interaction.guildId!);

    await logToChannel(interaction.client, {
        guild: interaction.guild!, type: "ECONOMY", title: "Transfer",
        description: `**From:** ${interaction.user.tag}\n**To:** ${targetUser.tag}\n**Amount:** ${fmtCurrency(amount, config.currencyEmoji)}`,
        color: 0x00FFFF
    });

    return interaction.editReply({ embeds: [successEmbed(interaction.user, "Transfer Successful", `Transferred **${fmtCurrency(amount, config.currencyEmoji)}** to ${targetUser}.`)] });
}
