
import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { withdrawFromBank, getBankByUserId } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export const data = new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw money from your bank")
    .addStringOption(opt => opt.setName("amount").setDescription("Amount to withdraw (or 'all')").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const amountStr = interaction.options.getString("amount", true);
    await interaction.deferReply();

    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const bank = await getBankByUserId(user.id);
    const emoji = config.currencyEmoji;

    if (!bank) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "No Bank Account", "You do not have a bank account.")] });

    const amount = parseSmartAmount(amountStr, bank.balance);
    if (isNaN(amount) || amount <= 0) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });

    await withdrawFromBank(user.wallet!.id, user.id, amount);
    const updated = await getBankByUserId(user.id);

    await logToChannel(interaction.client, {
        guild: interaction.guild!, type: "ECONOMY", title: "Bank Withdraw",
        description: `**User:** ${interaction.user.tag}\n**Amount:** ${fmtCurrency(amount, emoji)}\n**New Balance:** ${fmtCurrency(updated?.balance ?? 0, emoji)}`,
        color: 0x00AAFF
    });

    return interaction.editReply({ embeds: [successEmbed(interaction.user, "Withdraw Successful", `Withdrew **${fmtCurrency(amount, emoji)}** from bank.\nRemaining bank balance: **${fmtCurrency(updated?.balance ?? 0, emoji)}**`)] });
}
