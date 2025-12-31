import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { JOBS, JobDefinition, getJobsBySector, getJobPaySync } from "../../services/jobService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

const SECTORS: JobDefinition['sector'][] = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];

export async function handleJobs(message: Message) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);
    const prefix = config?.prefix || "!";

    let currentPage = 0;

    const generateEmbed = (pageIndex: number) => {
        const sector = SECTORS[pageIndex];
        const jobs = getJobsBySector(sector);

        let sectorName = "";
        let sectorEmoji = "";

        switch (sector) {
            case "tech": sectorName = "Technology & Development"; sectorEmoji = Mascot.Emotes.JobTech; break;
            case "medical": sectorName = "Medical & Healthcare"; sectorEmoji = Mascot.Emotes.JobMedical; break;
            case "business": sectorName = "Business & Finance"; sectorEmoji = Mascot.Emotes.JobBusiness; break;
            case "legal": sectorName = "Legal & Law"; sectorEmoji = Mascot.Emotes.JobLegal; break;
            case "service": sectorName = "Service & Hospitality"; sectorEmoji = Mascot.Emotes.JobService; break;
            case "trade": sectorName = "Skilled Trades"; sectorEmoji = Mascot.Emotes.JobTrade; break;
            case "freelance": sectorName = "Freelance & Gig Work"; sectorEmoji = Mascot.Emotes.JobWorking; break;
        }

        const embed = new EmbedBuilder()
            .setTitle(`${sectorEmoji} Job Board: ${sectorName}`)
            .setDescription(`Browse available careers in the **${sectorName}** sector.\nuse \`${config?.prefix}apply <job_id>\` to apply.`)
            .setColor(Mascot.Colors.Base as any)
            .setFooter({ text: `Page ${pageIndex + 1} of ${SECTORS.length} • ${Mascot.Name}` });

        const thumb = getEmoteUrl(sectorEmoji);
        if (thumb) embed.setThumbnail(thumb);

        for (const job of jobs) {
            // Add job prereq
            let reqText = "";

            // Show Degree Requirements
            if (job.reqDegrees && job.reqDegrees.length > 0) {
                reqText += `Degree: ${job.reqDegrees.join(" + ")}`;
            } else {
                reqText += `Degree: None`;
            }

            // Show Job Prereq
            if (job.reqJobId) {
                // Try to resolve job title for the prereq ID
                const prevJob = JOBS.find(j => j.id === job.reqJobId);
                const prevTitle = prevJob ? prevJob.title : job.reqJobId;
                reqText += `\nExp: Requires ${prevTitle}`;
            }

            embed.addFields({
                name: `${job.title} (${job.id})`,
                value: `**${fmtCurrency(getJobPaySync(job, config), config?.currencyEmoji)}** / shift\n${reqText}`,
                inline: true
            });
        }

        return embed;
    };

    const generateRow = (pageIndex: number) => {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("jobs_prev")
                .setLabel("Previous")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageIndex === 0),
            new ButtonBuilder()
                .setCustomId("jobs_next")
                .setLabel("Next")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageIndex === SECTORS.length - 1)
        );
    };

    const reply = await message.reply({
        embeds: [generateEmbed(currentPage)],
        components: [generateRow(currentPage)]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000, // 2 mins
        filter: (i) => i.user.id === message.author.id
    });

    collector.on('collect', async (i) => {
        if (i.customId === "jobs_prev") {
            currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === "jobs_next") {
            currentPage = Math.min(SECTORS.length - 1, currentPage + 1);
        }

        await i.update({
            embeds: [generateEmbed(currentPage)],
            components: [generateRow(currentPage)]
        });
    });

    collector.on('end', () => {
        reply.edit({ components: [] }).catch(() => { });
    });
}
