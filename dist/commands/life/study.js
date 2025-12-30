"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStudy = handleStudy;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../../services/educationService");
const embed_1 = require("../../utils/embed");
const cooldown_1 = require("../../utils/cooldown");
const branding_1 = require("../../config/branding");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
async function handleStudy(message) {
    if (!message.guild)
        return;
    // Cooldown: Configurable
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const cooldownTime = config?.studyCooldown ?? 300;
    // Cooldown Key
    const cooldownKey = `study:${message.author.id}`;
    const cd = (0, cooldown_1.checkCooldown)(cooldownKey, cooldownTime);
    if (cd > 0) {
        const expiresAt = (0, cooldown_1.getCooldownExpiry)(cooldownKey);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Cooldown`)
            .setDescription(`You are tired of studying! Try again <t:${Math.floor(expiresAt / 1000)}:R>.`)
            .setColor("#E74C3C");
        const angryUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.TeacherAngry);
        if (angryUrl)
            embed.setThumbnail(angryUrl);
        return message.reply({ embeds: [embed] });
    }
    try {
        const res = await (0, educationService_1.study)(message.author.id, message.guild.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`Study Session`)
            .setDescription(res.msg)
            .setColor(res.newStress > 80 ? "#E74C3C" : "#2ECC71");
        const components = []; // Explicit any to avoid complexity with builders
        if (res.scholarship) {
            embed.setColor("#F1C40F"); // Gold
            embed.addFields({
                name: "🎉 Scholarship Unlocked!",
                value: `You reached GPA **${res.scholarship.milestone}.0**!\nReward: **${(0, format_1.fmtCurrency)(res.scholarship.amount, config?.currencyEmoji || "$")}**`
            });
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`claim_scholarship_${res.scholarship.milestone}`)
                .setLabel("Claim Scholarship")
                .setStyle(discord_js_1.ButtonStyle.Success)
                .setEmoji(branding_1.Mascot.Emotes.MoneyBag));
            components.push(row);
        }
        const thinkUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Teacher);
        if (thinkUrl)
            embed.setThumbnail(thinkUrl);
        message.reply({ embeds: [embed], components });
    }
    catch (err) {
        message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Study Failed", err.message)] });
    }
}
//# sourceMappingURL=study.js.map