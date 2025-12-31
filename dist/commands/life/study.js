"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStudy = handleStudy;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../../services/educationService");
const embed_1 = require("../../utils/embed");
const cooldown_1 = require("../../utils/cooldown");
const branding_1 = require("../../config/branding");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const prisma_1 = __importDefault(require("../../utils/prisma")); // Added prisma import
const studyMinigames_1 = require("./studyMinigames");
async function handleStudy(message) {
    if (!message.guild)
        return;
    // Check Enrollment First
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
        include: { currentEducation: true }
    });
    if (!user || !user.currentEducation) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Enrolled", "You are not enrolled in any degree. Use `!enroll` to start your education!")] });
    }
    // Cooldown
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const cooldownTime = config?.studyCooldown ?? 300;
    const cooldownKey = `study:${message.author.id}`;
    const cd = (0, cooldown_1.checkCooldown)(cooldownKey, cooldownTime);
    if (cd > 0) {
        const expiresAt = (0, cooldown_1.getCooldownExpiry)(cooldownKey);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Cooldown`)
            .setDescription(`You are tired of studying! Try again <t:${Math.floor(expiresAt / 1000)}:R>.`)
            .setColor("#E74C3C"); // Red
        const angryUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.TeacherAngry);
        if (angryUrl)
            embed.setThumbnail(angryUrl);
        return message.reply({ embeds: [embed] });
    }
    // 2. Pick Game
    const game = (0, studyMinigames_1.getStudyGame)();
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🧠 Quick Study Session")
        .setDescription(game.question)
        .setColor(branding_1.Mascot.Colors.Base)
        .setFooter({ text: `You have ${game.time} seconds!` });
    const thinkUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
    if (thinkUrl)
        embed.setThumbnail(thinkUrl);
    let isWin = false;
    let reply = null;
    // Handle Button Game
    if (game.type === "button") {
        const row = new discord_js_1.ActionRowBuilder().addComponents(game.options.map((opt, i) => new discord_js_1.ButtonBuilder()
            .setCustomId(`study_${i}_${opt}`)
            .setLabel(opt)
            .setStyle(discord_js_1.ButtonStyle.Secondary)));
        reply = await message.reply({ embeds: [embed], components: [row] });
        try {
            const i = await reply.awaitMessageComponent({
                componentType: discord_js_1.ComponentType.Button,
                time: game.time * 1000,
                filter: (i) => i.user.id === message.author.id
            });
            const selected = i.customId.split('_').slice(2).join('_');
            isWin = selected === game.answer;
            await i.deferUpdate();
        }
        catch (e) {
            isWin = false; // Timeout
        }
    }
    // Handle Typing Game
    else {
        reply = await message.reply({ embeds: [embed] });
        try {
            const channel = message.channel;
            const collected = await channel.awaitMessages({
                filter: (m) => m.author.id === message.author.id,
                max: 1,
                time: game.time * 1000,
                errors: ['time']
            });
            const userMsg = collected.first();
            if (userMsg) {
                isWin = userMsg.content.trim() === game.answer;
                // Optional: Delete user message to keep chat clean? maybe not.
            }
        }
        catch (e) {
            isWin = false; // Timeout
        }
    }
    // Result Handling
    if (!isWin) {
        const failEmbed = new discord_js_1.EmbedBuilder()
            .setTitle("📖 Study Session Failed")
            .setDescription(`${branding_1.Mascot.Emotes.Confused} You failed the test!\n\n**Correct Answer:** ${game.answer}`)
            .setColor("#E74C3C"); // Red
        if (reply)
            await reply.edit({ embeds: [failEmbed], components: [] });
        return;
    }
    // Success - Execute Study
    try {
        const bonus = 0.5;
        const res = await (0, educationService_1.study)(message.author.id, message.guild.id, bonus);
        const resultEmbed = new discord_js_1.EmbedBuilder()
            .setTitle("📚 Study Successful!")
            .setDescription(res.msg)
            .setColor(res.newStress > 80 ? "#E74C3C" : "#2ECC71")
            .setFooter({ text: "Perfect! +0.5 Bonus Int!" });
        const comps = [];
        if (res.scholarship) {
            resultEmbed.addFields({
                name: "🎉 Scholarship Unlocked!",
                value: `You reached GPA **${res.scholarship.milestone}.0**!\nReward: **${(0, format_1.fmtCurrency)(res.scholarship.amount, config?.currencyEmoji || "$")}**`
            });
            const claimRow = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`claim_scholarship_${res.scholarship.milestone}`)
                .setLabel("Claim Scholarship")
                .setStyle(discord_js_1.ButtonStyle.Success)
                .setEmoji(branding_1.Mascot.Emotes.MoneyBag));
            comps.push(claimRow);
        }
        const thumb = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Teacher);
        if (thumb)
            resultEmbed.setThumbnail(thumb);
        if (reply)
            await reply.edit({ embeds: [resultEmbed], components: comps });
    }
    catch (err) {
        if (reply)
            await reply.edit({ embeds: [(0, embed_1.errorEmbed)(message.author, "Study Error", err.message)], components: [] });
    }
}
//# sourceMappingURL=study.js.map