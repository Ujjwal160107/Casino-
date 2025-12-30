"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEnroll = handleEnroll;
exports.handleExam = handleExam;
const discord_js_1 = require("discord.js");
const guildConfigService_1 = require("../../services/guildConfigService");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const branding_1 = require("../../config/branding");
async function handleEnroll(message, args) {
    if (!message.guild)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const prefix = config?.prefix || "!";
    const nameQuery = args.join(" ").toLowerCase();
    if (!nameQuery) {
        // Using Confused emote for invalid usage
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${prefix}enroll <degree name>\``)] });
    }
    try {
        const degrees = await prisma_1.default.degree.findMany({ where: { guildId: message.guild.id } });
        const degree = degrees.find(d => d.name.toLowerCase().includes(nameQuery));
        if (!degree) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Degree Not Found", "Could not find a degree with that name.")] });
        }
        const user = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
            include: { currentEducation: { include: { degree: true } } }
        });
        if (user?.currentEducation) {
            const embed = (0, embed_1.errorEmbed)(message.author, "Already Enrolled", `You are already studying **${user.currentEducation.degree.name}**. Please complete it first!`);
            const angryUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Angry);
            if (angryUrl)
                embed.setThumbnail(angryUrl);
            return message.reply({ embeds: [embed] });
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Enrollment Confirmation`)
            .setDescription(`Are you sure you want to enroll in **${degree.name}**?`)
            .addFields({ name: "Tuition Fee", value: (0, format_1.fmtCurrency)(degree.tuitionPerSem, config.currencyEmoji), inline: true }, { name: "Duration", value: `${degree.totalSemesters} Semesters`, inline: true })
            .setColor("#F1C40F")
            .setFooter({ text: `${branding_1.Mascot.Name} • Education` });
        const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
        if (thumbUrl)
            embed.setThumbnail(thumbUrl);
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`enroll_confirm_${degree.id}`)
            .setLabel("Confirm Payment")
            .setStyle(discord_js_1.ButtonStyle.Success)
            .setEmoji(branding_1.Mascot.Emotes.Success));
        message.reply({ embeds: [embed], components: [row] }); // Note: Attachment handling for footer icon needs thought, or just remove attachment ref if not attaching.
        // For now, let's stick to simple embeds without dynamic attachments per command to avoid complexity, 
        // OR add the file if we want the footer icon to work. 
        // The implementation plan didn't strictly mandate checking the attachment logic in every command, but to be safe:
        // message.reply({ embeds: [embed], components: [row], files: [Mascot.Images.Main] })
    }
    catch (err) {
        message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", err.message)] });
    }
}
async function handleExam(message) {
    if (!message.guild)
        return;
    const userId = message.author.id;
    const guildId = message.guild.id;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const prefix = config?.prefix || "!";
    // Logic: Pass if Intelligence >= 6. Graduate.
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } }, wallet: true }
    });
    if (!user || !user.currentEducation) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Enrolled", "You are not currently enrolled/studying anywhere.")] });
    }
    const edu = user.currentEducation;
    const deg = edu.degree;
    const PASS_REQ = 6.0;
    if (edu.currentGpa < PASS_REQ) {
        const embed = (0, embed_1.errorEmbed)(message.author, "Exam Failed", `Your intelligence (**${edu.currentGpa.toFixed(1)}**) is too low. You need **${PASS_REQ.toFixed(1)}** to pass.\nGo \`${prefix}study\` to increase it!`);
        const sadUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.TeacherSad);
        if (sadUrl)
            embed.setThumbnail(sadUrl);
        return message.reply({ embeds: [embed] });
    }
    // Passed - GRADUATE!
    await prisma_1.default.$transaction([
        prisma_1.default.userEducation.delete({ where: { id: edu.id } }),
        prisma_1.default.userDegree.create({
            data: {
                userId: user.id,
                degreeId: deg.id,
                finalGpa: edu.currentGpa
            }
        })
    ]);
    return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "🎓 GRADUATED!", `You have completed your **${deg.name}** with Final Intelligence Score: **${edu.currentGpa.toFixed(1)}**!`)] });
}
//# sourceMappingURL=enroll.js.map