"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCareer = handleCareer;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const branding_1 = require("../../config/branding");
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const jobService_1 = require("../../services/jobService");
async function handleCareer(message) {
    if (!message.guild)
        return;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
        include: { workLogs: true }
    });
    if (!user) {
        return message.reply(`You don't have a profile yet.`);
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    // Stats Calculation
    const totalShifts = user.workLogs.length;
    const successfulShifts = user.workLogs.filter(l => l.success).length;
    // Avoid division by zero
    const successRate = totalShifts > 0 ? (successfulShifts / totalShifts) * 100 : 0;
    // Total Earnings
    const totalEarned = user.workLogs.reduce((acc, log) => acc + log.earnings, 0);
    // Performance Rating
    let rating = "C";
    let ratingColor = "#E74C3C"; // Red (Fail/Low)
    if (totalShifts < 5) {
        rating = "N/A"; // Not enough data
        ratingColor = "#95A5A6"; // Grey
    }
    else {
        if (successRate >= 95) {
            rating = "S";
            ratingColor = "#F1C40F";
        } // Gold
        else if (successRate >= 85) {
            rating = "A";
            ratingColor = "#2ECC71";
        } // Green
        else if (successRate >= 70) {
            rating = "B";
            ratingColor = "#3498DB";
        } // Blue
    }
    // Current Job Info
    let currentJobText = "Unemployed";
    let jobLevel = "None";
    if (user.jobId) {
        const job = (0, jobService_1.getJob)(user.jobId);
        if (job) {
            currentJobText = job.title;
            // Emojis handled by branding, assume job.emoji is valid or use Mascot
            jobLevel = job.level;
        }
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`📂 Career Profile: ${user.username}`)
        .setColor(ratingColor) // Based on rating
        .setThumbnail(user.jobId ? (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.JobWorking) : (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think))
        .setDescription(`**Employment Status**\n**Position:** ${currentJobText}\n**Level:** ${jobLevel}\n**Stress:** ${user.jobStress}/100`)
        .addFields({ name: `${branding_1.Mascot.Emotes.Monitor} Performance`, value: `**Rating:** ${rating}\n**Success Rate:** ${successRate.toFixed(1)}%\n**Shifts:** ${totalShifts}`, inline: true }, { name: `${branding_1.Mascot.Emotes.MoneyBag} Earnings`, value: `**Total:** ${(0, format_1.fmtCurrency)(totalEarned, config.currencyEmoji)}\n**Avg/Shift:** ${totalShifts > 0 ? (0, format_1.fmtCurrency)(Math.floor(totalEarned / totalShifts), config.currencyEmoji) : "0"}`, inline: true })
        .setFooter({ text: "Keep working to improve your rating!" });
    message.reply({ embeds: [embed] });
}
//# sourceMappingURL=career.js.map