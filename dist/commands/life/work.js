"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWork = handleWork;
const discord_js_1 = require("discord.js");
const jobService_1 = require("../../services/jobService");
const branding_1 = require("../../config/branding");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
async function handleWork(message) {
    if (!message.guild)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } }
    });
    if (!user)
        return;
    // 1. Unemployed View
    if (!user.jobId) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("Employment Status: Unemployed")
            .setDescription(`You currently do not have a job.\nUse \`${config?.prefix || "!"}jobs\` to browse available careers and apply!`)
            .setColor("#95A5A6") // Grey
            .setThumbnail("https://media.discordapp.net/attachments/1093496077363421256/1149712711102713886/interview.png"); // Generic placeholder or none
        return message.reply({ embeds: [embed] });
    }
    // 2. Employed View
    const job = (0, jobService_1.getJob)(user.jobId);
    if (!job) {
        // Fallback if job ID invalid
        return message.reply("Error: Your job ID is invalid. Please contact admin.");
    }
    const nextLevelJob = jobService_1.JOBS.find(j => j.reqJobId === job.id);
    let promoText = "You are at the top of the ladder!";
    let progress = 100;
    // Simple promo logic for display (Real logic in work result later)
    if (nextLevelJob) {
        let shiftsReq = 20; // Default requirement
        if (config && config.jobShiftReqs) {
            const reqs = config.jobShiftReqs;
            if (reqs[nextLevelJob.id]) {
                shiftsReq = reqs[nextLevelJob.id];
            }
        }
        progress = Math.min((user.shiftsWorked / shiftsReq) * 100, 100);
        promoText = `Next Promotion: **${nextLevelJob.title}**\nProgress: ${makeProgressBar(progress)} (${user.shiftsWorked}/${shiftsReq} shifts)`;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setAuthor({ name: `${message.author.username}'s Job Dashboard`, iconURL: message.author.displayAvatarURL() })
        .setTitle(`${job.emoji} ${job.title}`)
        .setDescription(`**Position:** ${job.title}\n**Sector:** ${capitalize(job.sector)}`)
        .setColor(branding_1.Mascot.Colors.Base)
        .addFields({ name: "Salary", value: (0, format_1.fmtCurrency)((0, jobService_1.getJobPaySync)(job, config), config?.currencyEmoji), inline: true }, { name: "Shifts Worked", value: user.shiftsWorked.toString(), inline: true }, { name: "XP", value: user.jobXp.toString(), inline: true }, { name: `${getStressColor(user.jobStress ?? 0)} Stress`, value: `${user.jobStress ?? 0}/100`, inline: true }, { name: "Career Progress", value: promoText })
        .setFooter({ text: "Use the buttons below to work or manage employment." });
    const thumb = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.JobWorking);
    if (thumb)
        embed.setThumbnail(thumb);
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("work_shift").setLabel("Start Shift").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(branding_1.Mascot.Emotes.JobWorking), new discord_js_1.ButtonBuilder().setCustomId("work_resign").setLabel("Resign").setStyle(discord_js_1.ButtonStyle.Danger));
    message.reply({ embeds: [embed], components: [row] });
}
function makeProgressBar(pct) {
    const total = 10;
    const fill = Math.round((pct / 100) * total);
    return "`[" + "█".repeat(fill) + "░".repeat(total - fill) + "]`";
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function getStressColor(stress) {
    if (stress < 30)
        return "<:n_check:1451281806279311435>"; // Low
    if (stress < 70)
        return "<:alert_sign:1451625691664875610>"; // Medium
    return "<:rip:1451287136132403303>"; // High
}
//# sourceMappingURL=work.js.map