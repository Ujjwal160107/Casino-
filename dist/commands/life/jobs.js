"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleJobs = handleJobs;
const discord_js_1 = require("discord.js");
const jobService_1 = require("../../services/jobService");
const branding_1 = require("../../config/branding");
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const SECTORS = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];
async function handleJobs(message) {
    if (!message.guild)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const prefix = config?.prefix || "!";
    let currentPage = 0;
    const generateEmbed = (pageIndex) => {
        const sector = SECTORS[pageIndex];
        const jobs = (0, jobService_1.getJobsBySector)(sector);
        let sectorName = "";
        let sectorEmoji = "";
        switch (sector) {
            case "tech":
                sectorName = "Technology & Development";
                sectorEmoji = branding_1.Mascot.Emotes.JobTech;
                break;
            case "medical":
                sectorName = "Medical & Healthcare";
                sectorEmoji = branding_1.Mascot.Emotes.JobMedical;
                break;
            case "business":
                sectorName = "Business & Finance";
                sectorEmoji = branding_1.Mascot.Emotes.JobBusiness;
                break;
            case "legal":
                sectorName = "Legal & Law";
                sectorEmoji = branding_1.Mascot.Emotes.JobLegal;
                break;
            case "service":
                sectorName = "Service & Hospitality";
                sectorEmoji = branding_1.Mascot.Emotes.JobService;
                break;
            case "trade":
                sectorName = "Skilled Trades";
                sectorEmoji = branding_1.Mascot.Emotes.JobTrade;
                break;
            case "freelance":
                sectorName = "Freelance & Gig Work";
                sectorEmoji = branding_1.Mascot.Emotes.JobWorking;
                break;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${sectorEmoji} Job Board: ${sectorName}`)
            .setDescription(`Browse available careers in the **${sectorName}** sector.\nuse \`${config?.prefix}apply <job_id>\` to apply.`)
            .setColor(branding_1.Mascot.Colors.Base)
            .setFooter({ text: `Page ${pageIndex + 1} of ${SECTORS.length} • ${branding_1.Mascot.Name}` });
        const thumb = (0, branding_1.getEmoteUrl)(sectorEmoji);
        if (thumb)
            embed.setThumbnail(thumb);
        for (const job of jobs) {
            // Add job prereq
            let reqText = "";
            // Show Degree Requirements
            if (job.reqDegrees && job.reqDegrees.length > 0) {
                reqText += `Degree: ${job.reqDegrees.join(" + ")}`;
            }
            else {
                reqText += `Degree: None`;
            }
            // Show Job Prereq
            if (job.reqJobId) {
                // Try to resolve job title for the prereq ID
                const prevJob = jobService_1.JOBS.find(j => j.id === job.reqJobId);
                const prevTitle = prevJob ? prevJob.title : job.reqJobId;
                reqText += `\nExp: Requires ${prevTitle}`;
            }
            embed.addFields({
                name: `${job.title} (${job.id})`,
                value: `**${(0, format_1.fmtCurrency)((0, jobService_1.getJobPaySync)(job, config), config?.currencyEmoji)}** / shift\n${reqText}`,
                inline: true
            });
        }
        return embed;
    };
    const generateRow = (pageIndex) => {
        return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("jobs_prev")
            .setLabel("Previous")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(pageIndex === 0), new discord_js_1.ButtonBuilder()
            .setCustomId("jobs_next")
            .setLabel("Next")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(pageIndex === SECTORS.length - 1));
    };
    const reply = await message.reply({
        embeds: [generateEmbed(currentPage)],
        components: [generateRow(currentPage)]
    });
    const collector = reply.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 120000, // 2 mins
        filter: (i) => i.user.id === message.author.id
    });
    collector.on('collect', async (i) => {
        if (i.customId === "jobs_prev") {
            currentPage = Math.max(0, currentPage - 1);
        }
        else if (i.customId === "jobs_next") {
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
//# sourceMappingURL=jobs.js.map