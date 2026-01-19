
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { ensureBankForUser } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export const data = new SlashCommandBuilder()
    .setName("add-money")
    .setDescription("Add money to a user's wallet or bank")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt => opt.setName("user").setDescription("Target user").setRequired(true))
    .addStringOption(opt => opt.setName("amount").setDescription("Amount to add").setRequired(true))
    .addStringOption(opt => opt.setName("target").setDescription("Wallet or Bank").setRequired(false).addChoices(
        { name: "Wallet", value: "wallet" },
        { name: "Bank", value: "bank" }
    ));

export async function execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const amountStr = interaction.options.getString("amount", true);
    const targetType = interaction.options.getString("target") || "wallet";
    await interaction.deferReply();

    const config = await getGuildConfig(interaction.guildId!);
    const emoji = config.currencyEmoji;

    const amount = parseSmartAmount(amountStr);
    if (isNaN(amount) || amount <= 0) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });

    const target = await ensureUserAndWallet(targetUser.id, interaction.guildId!, targetUser.username);
    const MAX_INT = 2147483647;
    const safeAmount = amount > MAX_INT ? MAX_INT : amount;

    if (targetType === "bank") {
        const bank = await ensureBankForUser(target.id);
        await prisma.$transaction([
            prisma.transaction.create({
                data: { walletId: target.wallet!.id, amount: safeAmount, type: "admin_add_bank", meta: { by: interaction.user.id }, isEarned: false }
            }),
            prisma.bank.update({ where: { id: bank.id }, data: { balance: { increment: safeAmount } } }),
            prisma.audit.create({
                data: { guildId: interaction.guildId!, userId: target.id, type: "admin_add", meta: { amount: safeAmount, target: "bank", by: interaction.user.id } }
            })
        ]);
        await logToChannel(interaction.client, {
            guild: interaction.guild!, type: "ADMIN", title: "Money Added (Bank)",
            description: `**Admin:** ${interaction.user.tag}\n**Target:** ${targetUser.tag}\n**Amount:** +${fmtCurrency(safeAmount, emoji)}`,
            color: 0x00FF00
        });
        return interaction.editReply({ embeds: [successEmbed(interaction.user, "Money Added", `Added **${fmtCurrency(safeAmount, emoji)}** to ${targetUser}'s **Bank**.`)] });
    } else {
        await prisma.$transaction([
            prisma.transaction.create({
                data: { walletId: target.wallet!.id, amount: safeAmount, type: "admin_add", meta: { by: interaction.user.id }, isEarned: false }
            }),
            prisma.wallet.update({ where: { id: target.wallet!.id }, data: { balance: { increment: safeAmount } } }),
            prisma.audit.create({
                data: { guildId: interaction.guildId!, userId: target.id, type: "admin_add", meta: { amount: safeAmount, target: "wallet", by: interaction.user.id } }
            })
        ]);
        await logToChannel(interaction.client, {
            guild: interaction.guild!, type: "ADMIN", title: "Money Added (Wallet)",
            description: `**Admin:** ${interaction.user.tag}\n**Target:** ${targetUser.tag}\n**Amount:** +${fmtCurrency(safeAmount, emoji)}`,
            color: 0x00FF00
        });
        return interaction.editReply({ embeds: [successEmbed(interaction.user, "Money Added", `Added **${fmtCurrency(safeAmount, emoji)}** to ${targetUser}'s **Wallet**.`)] });
    }
}
