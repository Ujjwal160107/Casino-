
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View user profile")
    .addUserOption(opt => opt.setName("user").setDescription("User to view").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const target = interaction.options.getUser("user") || interaction.user;
    await interaction.deferReply();

    const config = await getGuildConfig(interaction.guildId);

    // Fetch user without includes first to avoid type inference issues
    const user = await prisma.user.findFirst({
        where: { discordId: interaction.user.id, guildId: interaction.guildId }
    });

    if (!user) {
        return interaction.editReply("User profile not found.");
    }

    // Fetch relations separately to be safe with types
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const bank = await prisma.bank.findUnique({ where: { userId: user.id } });

    // Attempt to find job (assuming user has jobId or via relation hack)
    // If User has jobId field, we can use it. If not, we try to find via relation.
    // Checking previous code, 'job' relation exists.
    // Safest is to try generic approach or rely on what we know.
    // If we can't easily include, we'll try to fetch job where users has this user.
    // Or just skip job title if complex. But user wants profile.
    // Let's try to fetch job if jobId exists (check existence by 'in' operator if possible, or just try-catch).
    // Actually, let's just use `include: { job: true }` with `findFirst`, which usually works better.
    // But since `findUnique` failed, maybe `findFirst` will too if types are strict?
    // Let's try pure separate fetch:
    // This assumes Job <-> User is 1-n or n-n? A user has one job.
    // If User has `jobId`, optimal.

    let jobTitle = "Unemployed";
    if ((user as any).jobId) {
        const job = await prisma.job.findUnique({ where: { id: (user as any).jobId } });
        if (job) jobTitle = job.name;
    } else {
        // Fallback: search job that has this user?
        // const job = await prisma.job.findFirst({ where: { users: { some: { id: user.id } } } });
        // if (job) jobTitle = job.title;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${target.username}'s Profile`)
        .setThumbnail(target.displayAvatarURL())
        .setColor(Mascot.Colors.Base as any)
        .addFields(
            { name: "💰 Wallet", value: fmtCurrency(wallet?.balance || 0, config.currencyEmoji), inline: true },
            { name: "🏦 Bank", value: fmtCurrency(bank?.balance || 0, config.currencyEmoji), inline: true },
            { name: "💼 Job", value: jobTitle, inline: true },
            { name: "📈 Net Worth", value: fmtCurrency((wallet?.balance || 0) + (bank?.balance || 0), config.currencyEmoji), inline: true }
        );

    return interaction.editReply({ embeds: [embed] });
}
