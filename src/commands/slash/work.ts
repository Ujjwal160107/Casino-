
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { JOBS, getJob, getJobPaySync } from "../../services/jobService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";
import prisma from "../../utils/prisma";

export const data = new SlashCommandBuilder()
    .setName("work")
    .setDescription("View job status or start work");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId!);
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId! } }
    });

    if (!user) return interaction.editReply("User not found.");

    if (!user.jobId) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("Employment Status: Unemployed")
                .setDescription(`You currently do not have a job.\nUse \`/jobs\` to browse available careers!`)
                .setColor("#95A5A6")
                .setThumbnail("https://media.discordapp.net/attachments/1093496077363421256/1149712711102713886/interview.png")]
        });
    }

    const job = getJob(user.jobId);
    if (!job) return interaction.editReply("Error: Invalid job ID.");

    const nextLevelJob = JOBS.find(j => j.reqJobId === job.id);
    let promoText = "You are at the top of the ladder!";
    let progress = 100;

    if (nextLevelJob) {
        let shiftsReq = 20;
        if (config?.jobShiftReqs) {
            const reqs = config.jobShiftReqs as Record<string, number>;
            if (reqs[nextLevelJob.id]) shiftsReq = reqs[nextLevelJob.id];
        }
        progress = Math.min((user.shiftsWorked / shiftsReq) * 100, 100);
        promoText = `Next Promotion: **${nextLevelJob.title}**\nProgress: ${Math.round(progress)}% (${user.shiftsWorked}/${shiftsReq} shifts)`;
    }

    const embed = new EmbedBuilder()
        .setAuthor({ name: `${interaction.user.username}'s Job Dashboard`, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${job.emoji} ${job.title}`)
        .setDescription(`**Position:** ${job.title}\n**Sector:** ${job.sector}`)
        .setColor(Mascot.Colors.Base as any)
        .addFields(
            { name: "Salary", value: fmtCurrency(getJobPaySync(job, config), config?.currencyEmoji), inline: true },
            { name: "Shifts Worked", value: user.shiftsWorked.toString(), inline: true },
            { name: "XP", value: user.jobXp.toString(), inline: true },
            { name: `${user.jobStress ?? 0 < 30 ? "Check" : "Alert"} Stress`, value: `${user.jobStress ?? 0}/100`, inline: true },
            { name: "Career Progress", value: promoText }
        )
        .setFooter({ text: "Use the buttons below to work or manage employment." });

    const thumb = getEmoteUrl(Mascot.Emotes.JobWorking);
    if (thumb) embed.setThumbnail(thumb);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("work_shift").setLabel("Start Shift").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.JobWorking),
        new ButtonBuilder().setCustomId("work_resign").setLabel("Resign").setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
}
