import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors, GuildMember } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { getBankByUserId, depositToBank, withdrawFromBank } from "../../services/bankService";
import { transferAnyFunds } from "../../services/transferService";
import { getGuildConfig } from "../../services/guildConfigService";
import { balanceEmbed, successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, fmtAmount, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export const data = new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Manage your finances")
    .addSubcommand(sub =>
        sub.setName("balance").setDescription("Check your or another user's balance")
            .addUserOption(opt => opt.setName("user").setDescription("The user to check").setRequired(false))
    )
    .addSubcommand(sub =>
        sub.setName("deposit").setDescription("Deposit money into your bank")
            .addStringOption(opt => opt.setName("amount").setDescription("Amount to deposit (or 'all', 'half')").setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName("withdraw").setDescription("Withdraw money from your bank")
            .addStringOption(opt => opt.setName("amount").setDescription("Amount to withdraw (or 'all')").setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName("transfer").setDescription("Transfer money to another user")
            .addUserOption(opt => opt.setName("user").setDescription("Recipient").setRequired(true))
            .addStringOption(opt => opt.setName("amount").setDescription("Amount to transfer").setRequired(true))
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const config = await getGuildConfig(interaction.guildId!);
    const emoji = config.currencyEmoji;

    try {
        if (sub === "balance") {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            if (targetUser.bot) {
                return interaction.reply({ embeds: [errorEmbed(interaction.user, "Error", "Bots do not have wallets.")], ephemeral: true });
            }
            await interaction.deferReply();
            const user = await ensureUserAndWallet(targetUser.id, interaction.guildId!, targetUser.tag);
            const bank = await getBankByUserId(user.id);

            return interaction.editReply({ embeds: [balanceEmbed(targetUser, user.wallet!.balance, bank?.balance ?? 0, emoji)] });
        }

        if (sub === "deposit") {
            const amountStr = interaction.options.getString("amount", true);
            await interaction.deferReply();
            const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
            const wallet = user.wallet!;

            const amount = parseSmartAmount(amountStr, wallet.balance);
            if (isNaN(amount) || amount <= 0) {
                return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });
            }

            const { bank, actualAmount } = await depositToBank(wallet.id, user.id, amount, interaction.guildId!);
            const updatedBank = await getBankByUserId(user.id);
            const isPartial = actualAmount < amount;
            const partialMsg = isPartial ? ` (Partial Deposit - Bank Limit Reached)` : "";

            await logToChannel(interaction.client, {
                guild: interaction.guild!,
                type: "ECONOMY",
                title: "Bank Deposit",
                description: `**User:** ${interaction.user.tag}\n**Amount:** ${fmtCurrency(actualAmount, emoji)}${partialMsg}\n**New Balance:** ${fmtCurrency(updatedBank?.balance ?? 0, emoji)}`,
                color: 0x00AAFF
            });

            return interaction.editReply({ embeds: [successEmbed(interaction.user, isPartial ? "Partial Deposit" : "Deposit Successful", `Deposited **${fmtCurrency(actualAmount, emoji)}**${partialMsg}.\nBank: **${fmtCurrency(updatedBank?.balance ?? 0, emoji)}**`)] });
        }

        if (sub === "withdraw") {
            const amountStr = interaction.options.getString("amount", true);
            await interaction.deferReply();
            const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
            const bank = await getBankByUserId(user.id);

            if (!bank) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "No Bank Account", "You do not have a bank account.")] });

            const amount = parseSmartAmount(amountStr, bank.balance);
            if (isNaN(amount) || amount <= 0) {
                return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });
            }

            await withdrawFromBank(user.wallet!.id, user.id, amount);
            const updated = await getBankByUserId(user.id);

            await logToChannel(interaction.client, {
                guild: interaction.guild!,
                type: "ECONOMY",
                title: "Bank Withdraw",
                description: `**User:** ${interaction.user.tag}\n**Amount:** ${fmtCurrency(amount, emoji)}\n**New Balance:** ${fmtCurrency(updated?.balance ?? 0, emoji)}`,
                color: 0x00AAFF
            });

            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Withdraw Successful", `Withdrew **${fmtCurrency(amount, emoji)}** from bank.\nRemaining bank balance: **${fmtCurrency(updated?.balance ?? 0, emoji)}**`)] });
        }

        if (sub === "transfer") {
            const targetUser = interaction.options.getUser("user", true);
            const amountStr = interaction.options.getString("amount", true);
            await interaction.deferReply();

            if (targetUser.bot) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Error", "Cannot transfer to bots.")] });
            if (targetUser.id === interaction.user.id) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Error", "Cannot transfer to yourself.")] });

            const sender = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
            if (!sender.wallet) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Wallet Not Found", "Your wallet not found.")] });

            const amount = parseSmartAmount(amountStr, sender.wallet.balance);
            if (isNaN(amount) || amount <= 0) {
                return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });
            }

            await transferAnyFunds(sender.wallet.id, targetUser.id, amount, interaction.user.id, interaction.guildId!);

            await logToChannel(interaction.client, {
                guild: interaction.guild!,
                type: "ECONOMY",
                title: "Transfer",
                description: `**From:** ${interaction.user.tag}\n**To:** ${targetUser.tag}\n**Amount:** ${fmtCurrency(amount, emoji)}`,
                color: 0x00FFFF
            });

            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Transfer Successful", `Transferred **${fmtCurrency(amount, emoji)}** to ${targetUser}.`)] });
        }

    } catch (err) {
        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({ embeds: [errorEmbed(interaction.user, "Failed", (err as Error).message)] });
        }
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Failed", (err as Error).message)], ephemeral: true });
    }
}
