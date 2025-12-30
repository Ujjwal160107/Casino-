import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from "discord.js";
import { getDegrees } from "../../services/educationService";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { errorEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleEducation(message: Message, args: string[]) {
    if (!message.guild) return;
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = await getGuildConfig(guildId);
    const prefix = config?.prefix || "!";

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } }, degrees: { include: { degree: true } } }
    });

    if (!user) return;

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

            let status = "🔒";
            if (isClaimed) status = `${Mascot.Emotes.Accept} Claimed`;
            else if (isEligible) status = `${Mascot.Emotes.MoneyBag} Available`;

            return `${status} **${m.level}.0 Int** (${m.desc})`;
        });
        const scholarshipGuide = scholarshipLines.join("\n");

        const embed = new EmbedBuilder()
            .setTitle(`Student Dashboard: ${deg.name}`)
            .setDescription(`**Degree Fee Paid**: ${fmtCurrency(deg.tuitionPerSem, config.currencyEmoji)}\n${progressBar} ${progress}% to Graduation`)
            .setColor(edu.stress > 80 ? "#FF0000" : "#3498DB")
            .addFields(
                { name: "Intelligence", value: `${intProgress} **${edu.currentGpa.toFixed(1)} / 10**\nRequired: 6.0`, inline: true },
                { name: "Stress", value: `${edu.stress}%`, inline: true },
                { name: "Actions", value: `\`${prefix}study\` - Gain Intelligence (+0.5)\n\`${prefix}exam\` - Take Final Exam (Req: 6 Intelligence)` },                { name: `${Mascot.Emotes.MoneyBag} Scholarship Guide`, value: scholarshipGuide }
            );

        const thumbUrl = getEmoteUrl(Mascot.Emotes.Teacher);
        if (thumbUrl) embed.setThumbnail(thumbUrl);

        if (edu.stress > 70) {
            embed.setDescription(embed.data.description + `\n\n⚠️ **High Stress!** You should visit the Gym, meditate, or play sports to relax!`);
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("stress_sports").setLabel("Sports").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Sports),
            new ButtonBuilder().setCustomId("stress_gym").setLabel("Gym").setStyle(ButtonStyle.Primary).setEmoji(Mascot.Emotes.Gym),
            new ButtonBuilder().setCustomId("stress_meditation").setLabel("Meditation").setStyle(ButtonStyle.Secondary).setEmoji(Mascot.Emotes.Meditation)
        );

        // Check for Scholarships
        const milestones = [9, 10];
        const currentInt = Math.floor(edu.currentGpa);
        const claimed = edu.scholarshipsClaimed;

        for (const m of milestones) {
            if (currentInt >= m && !claimed.includes(m)) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`claim_scholarship_${m}`)
                        .setLabel(`Claim ${m}.0 Int Scholarship`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji(Mascot.Emotes.MoneyBag)
                );
                // Only show one claim button at a time to avoid clutter/spam
                break;
            }
        }

        return message.reply({ embeds: [embed], components: [row] });
    }

    // 2. Not Enrolled View (List Schools)
    const degrees = await getDegrees(guildId);
    const myDegreeIds = new Set(user.degrees.map(d => d.degreeId));

    const BANNER_PATH = "C:/Users/ujjwa/.gemini/antigravity/brain/b2dfa908-8bed-421c-a1af-8d2dea50cc66/uploaded_image_1766908422125.png";
    const bannerAttachment = new AttachmentBuilder(BANNER_PATH, { name: 'uni_banner.png' });

    const embed = new EmbedBuilder()
        .setTitle("Education & Careers")
        .setDescription(`**Intelligence:** ${user.intelligence} | **Discipline:** ${user.discipline}\n\nSelect a program to enroll:`)
        .setColor("#F1C40F")
        .setImage("attachment://uni_banner.png");

    const thumbUrl = getEmoteUrl(Mascot.Emotes.Think);
    if (thumbUrl) embed.setThumbnail(thumbUrl);

    const fields = degrees.map(d => {
        const isCompleted = myDegreeIds.has(d.id);
        const hasPrereq = !d.requiredDegreeId || myDegreeIds.has(d.requiredDegreeId);
        const hasInt = user.intelligence >= d.minIntelligence;

        let statusIcon = "";
        let statusText = "";
        let reqText = "";

        if (isCompleted) {
            statusIcon = Mascot.Emotes.Accept;
            statusText = "Completed";
            reqText = "None";
        } else {
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
                statusIcon = Mascot.Emotes.Decline;
                statusText = "Locked";
                reqText = missing.join(", ");
            } else {
                statusIcon = Mascot.Emotes.Accept;
                statusText = "Open";
                reqText = "Eligible";
            }
        }

        const displayName = d.name.includes(d.type) ? d.name : `${d.name} (${d.type})`;
        return {
            name: `${statusIcon} ${displayName}`,
            value: `**Status:** ${statusText}\n**Degree Fee:** ${fmtCurrency(d.tuitionPerSem, config.currencyEmoji)}\n**Reqs:** ${reqText}`,
            inline: false
        };
    });

    embed.addFields(fields);
    embed.setFooter({ text: `Use ${prefix}enroll <name> to start. Warning: Dropping out leaves debt!` });

    message.reply({ embeds: [embed], files: [bannerAttachment] });
}

export async function handleListDegrees(message: Message) {
    if (!message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { degrees: { include: { degree: true } } }
    });

    if (!user || user.degrees.length === 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "No Degrees", "You haven't earned any degrees yet. Use `!education` to find a program!")] });
    }

    const embed = new EmbedBuilder()
        .setDescription(`# ${Mascot.Emotes.Graduate} ${message.author.username}'s Earned Degrees`)
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
