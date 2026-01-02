import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { getJob } from "../../services/jobService";

export async function handleCareer(message: Message) {
    if (!message.guild) return;

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
        include: { workLogs: true }
    });

    if (!user) {
        return message.reply(`You don't have a profile yet.`);
    }

    const config = await getGuildConfig(message.guild.id);

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
    } else {
        if (successRate >= 95) { rating = "S"; ratingColor = "#F1C40F"; } // Gold
        else if (successRate >= 85) { rating = "A"; ratingColor = "#2ECC71"; } // Green
        else if (successRate >= 70) { rating = "B"; ratingColor = "#3498DB"; } // Blue
    }

    // Current Job Info
    let currentJobText = "Unemployed";
    let jobLevel = "None";
    if (user.jobId) {
        const job = getJob(user.jobId);
        if (job) {
            currentJobText = job.title;
            // Emojis handled by branding, assume job.emoji is valid or use Mascot
            jobLevel = job.level;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`📂 Career Profile: ${user.username}`)
        .setColor(ratingColor as any) // Based on rating
        .setThumbnail(user.jobId ? getEmoteUrl(Mascot.Emotes.JobWorking) : getEmoteUrl(Mascot.Emotes.Think))
        .setDescription(`**Employment Status**\n**Position:** ${currentJobText}\n**Level:** ${jobLevel}\n**Stress:** ${user.jobStress}/100`)
        .addFields(
            { name: `${Mascot.Emotes.Monitor} Performance`, value: `**Rating:** ${rating}\n**Success Rate:** ${successRate.toFixed(1)}%\n**Shifts:** ${totalShifts}`, inline: true },
            { name: `${Mascot.Emotes.MoneyBag} Earnings`, value: `**Total:** ${fmtCurrency(totalEarned, config.currencyEmoji)}\n**Avg/Shift:** ${totalShifts > 0 ? fmtCurrency(Math.floor(totalEarned / totalShifts), config.currencyEmoji) : "0"}`, inline: true }
        )
        .setFooter({ text: "Keep working to improve your rating!" });

    message.reply({ embeds: [embed] });
}
