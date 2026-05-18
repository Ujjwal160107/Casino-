import {
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder
} from "discord.js";
import { JOBS, getJob, getJobPaySync } from "../../services/jobService";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

function hexColorToNumber(color: unknown, fallback = 0x9B59B6) {
    if (typeof color === "number") return color;
    if (typeof color === "string") {
        const normalized = color.replace("#", "");
        const parsed = Number.parseInt(normalized, 16);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
}

export async function handleWork(message: Message) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);

    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id }
    });

    if (!user) return;

    if (!user.jobId) {
        const container = new ContainerBuilder()
            .setAccentColor(0x95A5A6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.JobWorking} Employment Status`),
                new TextDisplayBuilder().setContent(`**Position:** Unemployed\nUse \`${config?.prefix || "!"}jobs\` to browse available careers and apply.`)
            );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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
        let shiftsReq = 20; // Default requirement
        if (config && config.jobShiftReqs) {
            const reqs = config.jobShiftReqs as Record<string, number>;
            if (reqs[nextLevelJob.id]) {
                shiftsReq = reqs[nextLevelJob.id];
            }
        }

        progress = Math.min((user.shiftsWorked / shiftsReq) * 100, 100);
        promoText = `Next Promotion: **${nextLevelJob.title}**\nProgress: ${makeProgressBar(progress)} (${user.shiftsWorked}/${shiftsReq} shifts)`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(hexColorToNumber(Mascot.Colors.Base))
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## ${job.emoji} ${job.title}`),
        new TextDisplayBuilder().setContent(`**Sector:** ${capitalize(job.sector)}\n**Level:** ${job.level}\n**Pay:** ${fmtCurrency(getJobPaySync(job), config?.currencyEmoji)}/shift`)
                )
                .setThumbnailAccessory((thumbnail) =>
                    thumbnail
                        .setURL(message.author.displayAvatarURL({ size: 256 }))
                        .setDescription(`${message.author.username}'s avatar`)
                )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### Shift Status\n` +
                `**Shifts Worked:** ${user.shiftsWorked}\n` +
                `**XP:** ${user.jobXp}\n` +
                `**Stress:** ${getStressColor(user.jobStress ?? 0)} ${user.jobStress ?? 0}/100`
            ),
            new TextDisplayBuilder().setContent(`### Career Progress\n${promoText}`)
        );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("work_shift").setLabel("Start Shift").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.JobWorking),
        new ButtonBuilder().setCustomId("work_resign").setLabel("Resign").setStyle(ButtonStyle.Danger)
    );

    message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
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
