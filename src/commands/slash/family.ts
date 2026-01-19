
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { getMarriage, depositToJoint, withdrawFromJoint } from "../../services/life/marriageService";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

export const data = new SlashCommandBuilder()
    .setName("family")
    .setDescription("View or manage family")
    .addSubcommand(sub => sub.setName("view").setDescription("View family status"))
    .addSubcommand(sub => sub.setName("deposit").setDescription("Deposit to joint account").addIntegerOption(opt => opt.setName("amount").setDescription("Amount").setRequired(true)))
    .addSubcommand(sub => sub.setName("withdraw").setDescription("Withdraw from joint account").addIntegerOption(opt => opt.setName("amount").setDescription("Amount").setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const sub = interaction.options.getSubcommand();
    const config = await getGuildConfig(interaction.guildId);

    const marriage = await getMarriage(interaction.user.id, interaction.guildId);
    if (!marriage) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Single", "You are not married!")], ephemeral: true });

    if (sub === "view") {
        const spouseRecord = (marriage as any).spouse1.discordId === interaction.user.id ? (marriage as any).spouse2 : (marriage as any).spouse1;
        const spouseName = spouseRecord.username; // Or fetch user

        const embed = new EmbedBuilder()
            .setColor("#ff69b4")
            .setTitle(`Family of ${interaction.user.username}`)
            .addFields(
                { name: "💍 Partner", value: spouseName, inline: true },
                { name: "❤️ Affection", value: `${marriage.affection}`, inline: true },
                { name: "🏦 Joint Savings", value: fmtCurrency(marriage.jointBalance, config.currencyEmoji), inline: true },
                { name: "📅 Married Since", value: `<t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:R>`, inline: true }
            );
        return interaction.reply({ embeds: [embed] });
    }

    if (sub === "deposit") {
        const amount = interaction.options.getInteger("amount", true);
        if (amount <= 0) return interaction.reply({ content: "Invalid amount.", ephemeral: true });

        await interaction.deferReply();
        try {
            const newBal = await depositToJoint(interaction.user.id, interaction.guildId, amount);
            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Deposit Successful", `Deposited **${fmtCurrency(amount, config.currencyEmoji)}**.\nJoint Balance: **${fmtCurrency(newBal, config.currencyEmoji)}**`)] });
        } catch (e: any) {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Failed", e.message)] });
        }
    }

    if (sub === "withdraw") {
        const amount = interaction.options.getInteger("amount", true);
        if (amount <= 0) return interaction.reply({ content: "Invalid amount.", ephemeral: true });

        await interaction.deferReply();
        try {
            const newBal = await withdrawFromJoint(interaction.user.id, interaction.guildId, amount);
            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Withdrawal Successful", `Withdrew **${fmtCurrency(amount, config.currencyEmoji)}**.\nJoint Balance: **${fmtCurrency(newBal, config.currencyEmoji)}**`)] });
        } catch (e: any) {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Failed", e.message)] });
        }
    }
}
