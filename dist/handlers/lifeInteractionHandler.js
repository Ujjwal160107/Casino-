"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLifeInteraction = handleLifeInteraction;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../services/educationService");
const guildConfigService_1 = require("../services/guildConfigService");
const format_1 = require("../utils/format");
const branding_1 = require("../config/branding");
const prisma_1 = __importDefault(require("../utils/prisma"));
async function handleLifeInteraction(interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
}
async function handleButton(interaction) {
    const { customId, user, guild } = interaction;
    if (!guild)
        return;
    if (customId.startsWith("enroll_confirm_")) {
        const degreeId = customId.replace("enroll_confirm_", "");
        await interaction.deferReply({ ephemeral: true });
        try {
            const result = await (0, educationService_1.enroll)(user.id, guild.id, degreeId);
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Accept} Enrollment Successful`)
                .setDescription(`You have successfully enrolled in **${result.degree.name}**!`)
                .addFields({ name: "Tuition Paid", value: (0, format_1.fmtCurrency)(result.degree.tuitionPerSem, config.currencyEmoji) })
                .setColor("#2ECC71");
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Enrollment Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("claim_scholarship_")) {
        const milestone = parseInt(customId.replace("claim_scholarship_", ""));
        await interaction.deferReply({ ephemeral: true });
        try {
            const amount = await (0, educationService_1.claimScholarship)(user.id, guild.id, milestone);
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("💰 Scholarship Claimed!")
                .setDescription(`You have successfully claimed your scholarship of **${(0, format_1.fmtCurrency)(amount, config.currencyEmoji)}** for reaching GPA **${milestone}.0**!`)
                .setColor("#F1C40F");
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Claim Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("stress_")) {
        const activity = customId.replace("stress_", "");
        // Check if stress is already 0
        const userData = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
            include: { currentEducation: true }
        });
        if (userData?.currentEducation && userData.currentEducation.stress <= 0) {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Think} No Stress Detected`)
                .setDescription("You are currently stress free! Why not try studying instead?")
                .setColor("#2ECC71");
            const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
            if (thumbUrl)
                embed.setThumbnail(thumbUrl);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const cost = await (0, educationService_1.getStressCost)(user.id, guild.id);
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`Confirm ${activity.charAt(0).toUpperCase() + activity.slice(1)}`)
                .setDescription(`Do you want to spend **${(0, format_1.fmtCurrency)(cost, config.currencyEmoji)}** to reduce stress?`)
                .setColor("#3498DB");
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`confirm_stress_${activity}`).setLabel("Confirm").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(branding_1.Mascot.Emotes.Accept), new discord_js_1.ButtonBuilder().setCustomId("cancel_stress").setLabel("Cancel").setStyle(discord_js_1.ButtonStyle.Danger).setEmoji(branding_1.Mascot.Emotes.Decline));
            await interaction.editReply({ embeds: [embed], components: [row] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Error**: ${err.message}` });
        }
    }
    else if (customId.startsWith("confirm_stress_")) {
        const activity = customId.replace("confirm_stress_", "");
        // Defer update to replace the confirmation message
        await interaction.deferUpdate();
        try {
            const res = await (0, educationService_1.reduceStress)(user.id, guild.id, activity);
            let thumb = "";
            switch (activity) {
                case "sports":
                    thumb = branding_1.Mascot.Emotes.Sports;
                    break;
                case "gym":
                    thumb = branding_1.Mascot.Emotes.Gym;
                    break;
                case "meditation":
                    thumb = branding_1.Mascot.Emotes.Meditation;
                    break;
            }
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("Stress Relieved")
                .setDescription(res.msg)
                .setColor("#2ECC71");
            const thumbUrl = (0, branding_1.getEmoteUrl)(thumb);
            if (thumbUrl)
                embed.setThumbnail(thumbUrl);
            await interaction.editReply({ embeds: [embed], components: [] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Activity Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "cancel_stress") {
        await interaction.update({ content: `${branding_1.Mascot.Emotes.Decline} Activity cancelled.`, embeds: [], components: [] });
    }
}
//# sourceMappingURL=lifeInteractionHandler.js.map