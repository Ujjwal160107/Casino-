"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDropout = handleDropout;
const discord_js_1 = require("discord.js");
const embed_1 = require("../../utils/embed");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
const prisma_1 = __importDefault(require("../../utils/prisma")); // Added prisma import
async function handleDropout(message) {
    if (!message.guild)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const prefix = config?.prefix || "!";
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
            include: { currentEducation: { include: { degree: true } } }
        });
        if (!user?.currentEducation) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Enrolled", "You are not currently enrolled in any degree.")] });
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`⚠️ Confirm Dropout`)
            .setDescription(`Are you sure you want to drop out of **${user.currentEducation.degree.name}**?\n\n**Warning:**\n• You will lose all progress in this degree.\n• Tuition fees are non-refundable.\n• You will have to pay again to re-enroll.`)
            .setColor("#E74C3C")
            .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Alert));
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("dropout_confirm")
            .setLabel("I want to Dropout")
            .setStyle(discord_js_1.ButtonStyle.Danger)
            .setEmoji(branding_1.Mascot.Emotes.Fail), // Skull or Sad or Fail
        new discord_js_1.ButtonBuilder()
            .setCustomId("dropout_cancel")
            .setLabel("Cancel")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setEmoji(branding_1.Mascot.Emotes.Decline));
        message.reply({ embeds: [embed], components: [row] });
    }
    catch (err) {
        message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", err.message)] });
    }
}
//# sourceMappingURL=dropout.js.map