import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import prisma from "../../utils/prisma";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleRelax(message: Message) {
    if (!message.guild) return;

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } }
    });

    if (!user) return;

    // Check existing stress
    if (user.jobStress <= 0) {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Think} No Stress Detected`)
            .setDescription("You are totally chill! **0/100 Stress**. No need to relax right now.\nGet back to work!")
            .setColor("#2ECC71");
        return message.reply({ embeds: [embed] });
    }

    const config = await getGuildConfig(message.guild.id);
    // Calculate Dynamic Prices or Use Config
    const { getJob, getJobPay } = require("../../services/jobService"); // Dynamic import

    // Parse dashboard config
    const relaxConfig = (config.jobRelaxControllers as Record<string, number>) || {};

    let basePay = 1000;
    if (user.jobId) {
        const job = getJob(user.jobId);
        if (job) basePay = await getJobPay(job, message.guild.id);
    }

    const costs = {
        gym: relaxConfig.gym || Math.floor(basePay * 0.75),
        sports: relaxConfig.sports || Math.floor(basePay * 0.50),
        meditation: relaxConfig.meditation || Math.floor(basePay * 0.25)
    };

    const embed = new EmbedBuilder()
        .setTitle(`Relax & Recover`)
        .setDescription(`Your current stress level is **${user.jobStress}/100**.\nHigh stress increases the chance of **Burnout** during work shifts!\n\nChoose an activity to reduce stress:`)
        .addFields(
            { name: `${Mascot.Emotes.Gym} Gym`, value: `**${fmtCurrency(costs.gym, config.currencyEmoji)}**\n-30 Stress`, inline: true },
            { name: `${Mascot.Emotes.Sports} Sports`, value: `**${fmtCurrency(costs.sports, config.currencyEmoji)}**\n-20 Stress`, inline: true },
            { name: `${Mascot.Emotes.Meditation} Meditate`, value: `**${fmtCurrency(costs.meditation, config.currencyEmoji)}**\n-15 Stress`, inline: true }
        )
        .setColor(Mascot.Colors.Base as any)
        .setFooter({ text: "Costs are deducted from your wallet." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirm_stress_gym").setLabel("Gym").setStyle(ButtonStyle.Primary).setEmoji(Mascot.Emotes.Gym),
        new ButtonBuilder().setCustomId("confirm_stress_sports").setLabel("Sports").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Sports),
        new ButtonBuilder().setCustomId("confirm_stress_meditation").setLabel("Meditate").setStyle(ButtonStyle.Secondary).setEmoji(Mascot.Emotes.Meditation)
    );

    await message.reply({ embeds: [embed], components: [row] });
}
