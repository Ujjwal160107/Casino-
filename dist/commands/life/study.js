"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStudy = handleStudy;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../../services/educationService");
const embed_1 = require("../../utils/embed");
const branding_1 = require("../../config/branding");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const prisma_1 = __importDefault(require("../../utils/prisma")); // Added prisma import
const minigameService_1 = require("../../services/minigameService");
async function handleStudy(message) {
    if (!message.guild)
        return;
    // Check Enrollment First
    // Check Enrollment First
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const prefix = config.prefix || "!";
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
        include: { currentEducation: true }
    });
    if (!user || !user.currentEducation) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Enrolled", `You are not enrolled in any degree. Use \`${prefix}enroll\` to start your education!`)] });
    }
    // DB-Based Cooldown (Dynamic)
    const cooldownSeconds = config?.studyCooldown ?? 300;
    const cooldownMs = cooldownSeconds * 1000;
    const lastStudyTime = user.currentEducation.lastStudy ? new Date(user.currentEducation.lastStudy).getTime() : 0;
    const now = Date.now();
    if (now - lastStudyTime < cooldownMs) {
        const remainingMs = cooldownMs - (now - lastStudyTime);
        const expiresAt = Math.floor((now + remainingMs) / 1000);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Cooldown`)
            .setDescription(`You are tired of studying! Try again <t:${expiresAt}:R>.`)
            .setColor("#E74C3C"); // Red
        const angryUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.TeacherAngry);
        if (angryUrl)
            embed.setThumbnail(angryUrl);
        return message.reply({ embeds: [embed] });
    }
    // 2. Pick Game
    const game = (0, minigameService_1.getStudyGame)();
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🧠 Quick Study Session")
        .setDescription(game.description)
        .setColor(branding_1.Mascot.Colors.Base)
        .setFooter({ text: `You have ${game.time} seconds!` });
    const thinkUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
    if (thinkUrl)
        embed.setThumbnail(thinkUrl);
    let isWin = false;
    let reply = null;
    // --- PREVIEW PHASE ---
    if (game.previewTime) {
        const previewEmbed = new discord_js_1.EmbedBuilder()
            .setTitle(game.title)
            .setDescription(game.previewText || "Get ready...")
            .setColor(branding_1.Mascot.Colors.Base)
            .setFooter({ text: `Memorize for ${game.previewTime}s...` });
        reply = await message.reply({ embeds: [previewEmbed] });
        await new Promise(r => setTimeout(r, game.previewTime * 1000));
        // Show Real Question
        embed.setDescription(`${game.description}\n\nYou have **${game.time}** seconds!`);
        await reply.edit({ embeds: [embed] });
    }
    else {
        embed.setDescription(`${game.description}\n\nYou have **${game.time}** seconds!`);
    }
    // --- BUTTON GAME ---
    if (game.type === "button") {
        const row = new discord_js_1.ActionRowBuilder().addComponents(game.options.map((opt, i) => new discord_js_1.ButtonBuilder()
            .setCustomId(`study_${i}_${opt}`)
            .setLabel(opt)
            .setStyle(discord_js_1.ButtonStyle.Secondary)));
        if (!reply) {
            reply = await message.reply({ embeds: [embed], components: [row] });
        }
        else {
            await reply.edit({ components: [row] });
        }
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
    // --- TYPING GAME ---
    else {
        if (!reply) {
            reply = await message.reply({ embeds: [embed] });
        }
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
            }
        }
        catch (e) {
            isWin = false; // Timeout
        }
    }
    // Disable buttons on game message
    if (reply)
        await reply.edit({ components: [] }).catch(() => { });
    // Result Handling
    if (!isWin) {
        const failEmbed = new discord_js_1.EmbedBuilder()
            .setTitle("📖 Study Session Failed")
            .setDescription(`${branding_1.Mascot.Emotes.Confused} You failed the test!\n\n**Correct Answer:** ${game.answer}`)
            .setColor("#E74C3C"); // Red
        // NEW: Reply to USER MESSAGE with result
        await message.reply({ embeds: [failEmbed] });
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
        // NEW: Reply to USER MESSAGE with result
        await message.reply({ embeds: [resultEmbed], components: comps });
    }
    catch (err) {
        await message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Study Error", err.message)] });
    }
}
//# sourceMappingURL=study.js.map