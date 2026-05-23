import {
    Message,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder
} from "discord.js";
import prisma from "../../utils/prisma";
import { Mascot } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { getJob } from "../../services/jobService";
import { getAllSectorReputation } from "../../services/jobReputationService";

export async function handleCareer(message: Message) {
    if (!message.guild) return;

    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id },
        include: { workLogs: true }
    });

    if (!user) {
        return message.reply("You don't have a profile yet.");
    }

    const config = await getGuildConfig(message.guild.id);
    const totalShifts = user.workLogs.length;
    const successfulShifts = user.workLogs.filter((log) => log.success).length;
    const successRate = totalShifts > 0 ? (successfulShifts / totalShifts) * 100 : 0;
    const totalEarned = user.workLogs.reduce((acc, log) => acc + log.earnings, 0);

    let rating = "C";
    let ratingColor = 0xE74C3C;
    if (totalShifts < 5) {
        rating = "N/A";
        ratingColor = 0x95A5A6;
    } else if (successRate >= 95) {
        rating = "S";
        ratingColor = 0xF1C40F;
    } else if (successRate >= 85) {
        rating = "A";
        ratingColor = 0x2ECC71;
    } else if (successRate >= 70) {
        rating = "B";
        ratingColor = 0x3498DB;
    }

    let currentJobText = "Unemployed";
    let jobLevel = "None";
    if (user.jobId) {
        const job = getJob(user.jobId);
        if (job) {
            currentJobText = job.title;
            jobLevel = job.level;
        }
    }

    const allRep = await getAllSectorReputation(user.discordId);
    const repLines = allRep.length > 0
        ? allRep.map(r => `**${r.sector.charAt(0).toUpperCase() + r.sector.slice(1)}:** ${r.rep} rep — ${r.tier.name}`).join("\n")
        : "No reputation earned yet. Work shifts to build it.";

    const container = new ContainerBuilder()
        .setAccentColor(ratingColor)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.JobWorking} Career Profile`),
                    new TextDisplayBuilder().setContent(
                        `**User:** ${user.username}\n` +
                        `**Position:** ${currentJobText}\n` +
                        `**Level:** ${jobLevel}\n` +
                        `**Stress:** ${user.jobStress}/100`
                    )
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
                `### ${Mascot.Emotes.Monitor} Performance\n` +
                `**Rating:** ${rating}\n` +
                `**Success Rate:** ${successRate.toFixed(1)}%\n` +
                `**Shifts:** ${totalShifts}`
            ),
            new TextDisplayBuilder().setContent(
                `### ${Mascot.Emotes.MoneyBag} Earnings\n` +
                `**Total:** ${fmtCurrency(totalEarned, config.currencyEmoji)}\n` +
                `**Avg/Shift:** ${totalShifts > 0 ? fmtCurrency(Math.floor(totalEarned / totalShifts), config.currencyEmoji) : "0"}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Sector Reputation\n${repLines}`)
        );

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}
