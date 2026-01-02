"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRelax = handleRelax;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const branding_1 = require("../../config/branding");
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
async function handleRelax(message) {
    if (!message.guild)
        return;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } }
    });
    if (!user)
        return;
    // Check existing stress
    if (user.jobStress <= 0) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Think} No Stress Detected`)
            .setDescription("You are totally chill! **0/100 Stress**. No need to relax right now.\nGet back to work!")
            .setColor("#2ECC71");
        return message.reply({ embeds: [embed] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    // Calculate Dynamic Prices
    const { getJob, getJobPay } = require("../../services/jobService"); // Dynamic import
    let basePay = 1000;
    if (user.jobId) {
        const job = getJob(user.jobId);
        if (job)
            basePay = await getJobPay(job, message.guild.id);
    }
    const costs = {
        gym: Math.floor(basePay * 0.75),
        sports: Math.floor(basePay * 0.50),
        meditation: Math.floor(basePay * 0.25)
    };
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`Relax & Recover`)
        .setDescription(`Your current stress level is **${user.jobStress}/100**.\nHigh stress increases the chance of **Burnout** during work shifts!\n\nChoose an activity to reduce stress:`)
        .addFields({ name: `${branding_1.Mascot.Emotes.Gym} Gym`, value: `**${(0, format_1.fmtCurrency)(costs.gym, config.currencyEmoji)}**\n-30 Stress`, inline: true }, { name: `${branding_1.Mascot.Emotes.Sports} Sports`, value: `**${(0, format_1.fmtCurrency)(costs.sports, config.currencyEmoji)}**\n-20 Stress`, inline: true }, { name: `${branding_1.Mascot.Emotes.Meditation} Meditate`, value: `**${(0, format_1.fmtCurrency)(costs.meditation, config.currencyEmoji)}**\n-15 Stress`, inline: true })
        .setColor(branding_1.Mascot.Colors.Base)
        .setFooter({ text: "Costs are deducted from your wallet." });
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("confirm_stress_gym").setLabel("Gym").setStyle(discord_js_1.ButtonStyle.Primary).setEmoji(branding_1.Mascot.Emotes.Gym), new discord_js_1.ButtonBuilder().setCustomId("confirm_stress_sports").setLabel("Sports").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(branding_1.Mascot.Emotes.Sports), new discord_js_1.ButtonBuilder().setCustomId("confirm_stress_meditation").setLabel("Meditate").setStyle(discord_js_1.ButtonStyle.Secondary).setEmoji(branding_1.Mascot.Emotes.Meditation));
    await message.reply({ embeds: [embed], components: [row] });
}
//# sourceMappingURL=relax.js.map