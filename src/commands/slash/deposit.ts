
import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { depositToBank, getBankByUserId } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export const data = new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Deposit money into your bank")
    .addStringOption(opt => opt.setName("amount").setDescription("Amount to deposit (or 'all', 'half')").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const amountStr = interaction.options.getString("amount", true);
    await interaction.deferReply();

    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const wallet = user.wallet!;
    const emoji = config.currencyEmoji;

    const amount = parseSmartAmount(amountStr, wallet.balance);
    if (isNaN(amount) || amount <= 0) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });

    const { actualAmount } = await depositToBank(wallet.id, user.id, amount, interaction.guildId!);
    const updatedBank = await getBankByUserId(user.id);
    const isPartial = actualAmount < amount;
    const partialMsg = isPartial ? ` (Bank Limit Reached)` : "";

    await logToChannel(interaction.client, {
        guild: interaction.guild!, type: "ECONOMY", title: "Bank Deposit",
        description: `**User:** ${interaction.user.tag}\n**Amount:** ${fmtCurrency(actualAmount, emoji)}${partialMsg}\n**New Balance:** ${fmtCurrency(updatedBank?.balance ?? 0, emoji)}`,
        color: 0x00AAFF
    });

    return interaction.editReply({ embeds: [successEmbed(interaction.user, isPartial ? "Partial Deposit" : "Deposit Successful", `Deposited **${fmtCurrency(actualAmount, emoji)}**${partialMsg}.\nBank: **${fmtCurrency(updatedBank?.balance ?? 0, emoji)}**`)] });
}
