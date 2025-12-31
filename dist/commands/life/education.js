"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEducation = handleEducation;
exports.handleListDegrees = handleListDegrees;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../../services/educationService");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const branding_1 = require("../../config/branding");
async function handleEducation(message, args) {
    if (!message.guild)
        return;
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const prefix = config?.prefix || "!";
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } }, degrees: { include: { degree: true } } }
    });
    if (!user)
        return;
    // User Avatar as Thumbnail
    const userAvatar = message.author.displayAvatarURL({ extension: "png", size: 256 });
    // 1. Enrolled View
    if (user.currentEducation) {
        const edu = user.currentEducation;
        const deg = edu.degree;
        // Single Semester Logic: Progress is just Intelligence / Pass Req
        const points = Math.min(6, edu.currentGpa); // Cap display at 6 for progress? or just show raw. Let's show raw / 6.
        const progress = Math.min(100, Math.round((edu.currentGpa / 6.0) * 100)); // 6 is pass
        const progressBar = "▓".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));
        const EMOJI_XP = "<:xpfull:1451636569982111765>";
        const EMOJI_XP_EMPTY = "<:xpempty:1451642829427314822>";
        const filledBars = Math.min(10, Math.floor(edu.currentGpa));
        const emptyBars = 10 - filledBars;
        const intProgress = `${EMOJI_XP.repeat(filledBars)}${EMOJI_XP_EMPTY.repeat(Math.max(0, emptyBars))}`;
        // Scholarship Status
        const scholarshipMilestones = [
            { level: 9, multi: 1.5, desc: "1.5x Refund" },
            { level: 10, multi: 2, desc: "2x Refund" }
        ];
        const scholarshipLines = scholarshipMilestones.map(m => {
            const isClaimed = edu.scholarshipsClaimed.includes(m.level);
            const isEligible = edu.currentGpa >= m.level;
            let status = "<:lockk:1455461260635144387> ";
            if (isClaimed)
                status = `${branding_1.Mascot.Emotes.Accept} Claimed`;
            else if (isEligible)
                status = `${branding_1.Mascot.Emotes.MoneyBag} Available`;
            return `${status} **${m.level}.0 Int** (${m.desc})`;
        });
        const scholarshipGuide = scholarshipLines.join("\n");
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Student Dashboard: ${deg.name}`)
            .setDescription(`**Degree Fee Paid**: ${(0, format_1.fmtCurrency)(deg.tuitionPerSem, config.currencyEmoji)}\n${progressBar} ${progress}% to Graduation`)
            .setColor(edu.stress > 80 ? "#FF0000" : "#3498DB")
            .addFields({ name: "Intelligence", value: `${intProgress} **${edu.currentGpa.toFixed(1)} / 10**\nRequired: 6.0`, inline: true }, { name: "Stress", value: `${edu.stress}%`, inline: true }, { name: "Actions", value: `\`${prefix}study\` - Gain Intelligence (+0.5)\n\`${prefix}exam\` - Take Final Exam (Req: 6 Intelligence)` }, { name: `${branding_1.Mascot.Emotes.MoneyBag} Scholarship Guide`, value: scholarshipGuide });
        const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Teacher);
        if (thumbUrl)
            embed.setThumbnail(thumbUrl);
        if (edu.stress > 70) {
            embed.setDescription(embed.data.description + `\n\n${branding_1.Mascot.Emotes.Alert} **High Stress!** You should visit the Gym, meditate, or play sports to relax!`);
        }
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("stress_sports").setLabel("Sports").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(branding_1.Mascot.Emotes.Sports), new discord_js_1.ButtonBuilder().setCustomId("stress_gym").setLabel("Gym").setStyle(discord_js_1.ButtonStyle.Primary).setEmoji(branding_1.Mascot.Emotes.Gym), new discord_js_1.ButtonBuilder().setCustomId("stress_meditation").setLabel("Meditation").setStyle(discord_js_1.ButtonStyle.Secondary).setEmoji(branding_1.Mascot.Emotes.Meditation));
        // Check for Scholarships
        const milestones = [9, 10];
        const currentInt = Math.floor(edu.currentGpa);
        const claimed = edu.scholarshipsClaimed;
        for (const m of milestones) {
            if (currentInt >= m && !claimed.includes(m)) {
                row.addComponents(new discord_js_1.ButtonBuilder()
                    .setCustomId(`claim_scholarship_${m}`)
                    .setLabel(`Claim ${m}.0 Int Scholarship`)
                    .setStyle(discord_js_1.ButtonStyle.Success)
                    .setEmoji(branding_1.Mascot.Emotes.MoneyBag));
                // Only show one claim button at a time to avoid clutter/spam
                break;
            }
        }
        return message.reply({ embeds: [embed], components: [row] });
    }
    // 2. Not Enrolled View (List Schools)
    const degrees = await (0, educationService_1.getDegrees)(guildId);
    const myDegreeIds = new Set(user.degrees.map(d => d.degreeId));
    const BANNER_PATH = "C:/Users/ujjwa/.gemini/antigravity/brain/b2dfa908-8bed-421c-a1af-8d2dea50cc66/uploaded_image_1766908422125.png";
    const bannerAttachment = new discord_js_1.AttachmentBuilder(BANNER_PATH, { name: 'uni_banner.png' });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Education & Careers")
        .setDescription(`**Intelligence:** ${user.intelligence} | **Discipline:** ${user.discipline}\n\nSelect a program to enroll:`)
        .setColor("#F1C40F")
        .setImage("attachment://uni_banner.png");
    const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
    if (thumbUrl)
        embed.setThumbnail(thumbUrl);
    const fields = degrees.map(d => {
        const isCompleted = myDegreeIds.has(d.id);
        const hasPrereq = !d.requiredDegreeId || myDegreeIds.has(d.requiredDegreeId);
        const hasInt = user.intelligence >= d.minIntelligence;
        let statusIcon = "";
        let statusText = "";
        let reqText = "";
        if (isCompleted) {
            statusIcon = branding_1.Mascot.Emotes.Accept;
            statusText = "Completed";
            reqText = "None";
        }
        else {
            // Check Requirements
            const missing = [];
            if (!hasPrereq) {
                const reqName = d.requiredDegree ? d.requiredDegree.name : "Prerequisite Degree";
                missing.push(`Need ${reqName}`);
            }
            if (!hasInt) {
                missing.push(`Need ${d.minIntelligence} Int`);
            }
            if (missing.length > 0) {
                statusIcon = branding_1.Mascot.Emotes.Decline;
                statusText = "Locked";
                reqText = missing.join(", ");
            }
            else {
                statusIcon = branding_1.Mascot.Emotes.Accept;
                statusText = "Open";
                reqText = "Eligible";
            }
        }
        const displayName = d.name.includes(d.type) ? d.name : `${d.name} (${d.type})`;
        return {
            name: `${statusIcon} ${displayName}`,
            value: `**Status:** ${statusText}\n**Degree Fee:** ${(0, format_1.fmtCurrency)(d.tuitionPerSem, config.currencyEmoji)}\n**Reqs:** ${reqText}`,
            inline: false
        };
    });
    embed.addFields(fields);
    embed.setFooter({ text: `Use ${prefix}enroll <name> to start. Warning: Dropping out leaves debt!` });
    message.reply({ embeds: [embed], files: [bannerAttachment] });
}
async function handleListDegrees(message) {
    if (!message.guild)
        return;
    const userId = message.author.id;
    const guildId = message.guild.id;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { degrees: { include: { degree: true } } }
    });
    if (!user || user.degrees.length === 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Degrees", "You haven't earned any degrees yet. Use `!education` to find a program!")] });
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setDescription(`# ${branding_1.Mascot.Emotes.Graduate} ${message.author.username}'s Earned Degrees`)
        .setColor("#F1C40F")
        .setThumbnail(message.author.displayAvatarURL());
    const fields = user.degrees.map(ud => {
        return {
            name: `🎓 ${ud.degree.name}`,
            value: `**GPA:** ${ud.finalGpa.toFixed(1)} | **Obtained:** <t:${Math.floor(ud.obtainedAt.getTime() / 1000)}:D>`,
            inline: false
        };
    });
    embed.addFields(fields);
    embed.setFooter({ text: `Total Degrees: ${user.degrees.length}` });
    message.reply({ embeds: [embed] });
}
//# sourceMappingURL=education.js.map