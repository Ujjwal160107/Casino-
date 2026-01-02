import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { JOBS, getJob, getJobPaySync } from "../../services/jobService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleWork(message: Message) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } }
    });

    if (!user) return;

    // 1. Unemployed View
    if (!user.jobId) {
        const embed = new EmbedBuilder()
            .setTitle("Employment Status: Unemployed")
            .setDescription(`You currently do not have a job.\nUse \`${config?.prefix || "!"}jobs\` to browse available careers and apply!`)
            .setColor("#95A5A6") // Grey
            .setThumbnail("https://media.discordapp.net/attachments/1093496077363421256/1149712711102713886/interview.png"); // Generic placeholder or none

        return message.reply({ embeds: [embed] });
    }

    // 2. Employed View
    const job = getJob(user.jobId);
    if (!job) {
        // Fallback if job ID invalid
        return message.reply("Error: Your job ID is invalid. Please contact admin.");
    }

    const nextLevelJob = JOBS.find(j => j.reqJobId === job.id);
    let promoText = "You are at the top of the ladder!";
    let progress = 100;

    // Simple promo logic for display (Real logic in work result later)
    if (nextLevelJob) {
        const shiftsReq = 20; // Example requirement
        progress = Math.min((user.shiftsWorked / shiftsReq) * 100, 100);
        promoText = `Next Promotion: **${nextLevelJob.title}**\nProgress: ${makeProgressBar(progress)} (${user.shiftsWorked}/${shiftsReq} shifts)`;
    }

    const embed = new EmbedBuilder()
        .setAuthor({ name: `${message.author.username}'s Job Dashboard`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`${job.emoji} ${job.title}`)
        .setDescription(`**Position:** ${job.title}\n**Sector:** ${capitalize(job.sector)}`)
        .setColor(Mascot.Colors.Base as any)
        .addFields(
            { name: "Salary", value: fmtCurrency(getJobPaySync(job, config), config?.currencyEmoji), inline: true },
            { name: "Shifts Worked", value: user.shiftsWorked.toString(), inline: true },
            { name: "XP", value: user.jobXp.toString(), inline: true },
            { name: `${getStressColor(user.jobStress ?? 0)} Stress`, value: `${user.jobStress ?? 0}/100`, inline: true },
            { name: "Career Progress", value: promoText }
        )
        .setFooter({ text: "Use the buttons below to work or manage employment." });

    const thumb = getEmoteUrl(Mascot.Emotes.JobWorking);
    if (thumb) embed.setThumbnail(thumb);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("work_shift").setLabel("Start Shift").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.JobWorking),
        new ButtonBuilder().setCustomId("work_resign").setLabel("Resign").setStyle(ButtonStyle.Danger)
    );

    message.reply({ embeds: [embed], components: [row] });
}

function makeProgressBar(pct: number) {
    const total = 10;
    const fill = Math.round((pct / 100) * total);
    return "`[" + "█".repeat(fill) + "░".repeat(total - fill) + "]`";
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function getStressColor(stress: number) {
    if (stress < 30) return "<:n_check:1451281806279311435>"; // Low
    if (stress < 70) return "<:alert_sign:1451625691664875610>"; // Medium
    return "<:rip:1451287136132403303>"; // High
}
