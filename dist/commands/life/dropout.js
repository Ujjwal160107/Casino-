"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDropout = handleDropout;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../../services/educationService");
const embed_1 = require("../../utils/embed");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
async function handleDropout(message) {
    if (!message.guild)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const prefix = config?.prefix || "!";
    try {
        const res = await (0, educationService_1.dropout)(message.author.id, message.guild.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Shocked} Dropped Out`)
            .setDescription(`You have dropped out of **${res.degreeName}**.\n\nYour tuition fees are non-refundable. You are now free to enroll in another program.`)
            .setColor("#E74C3C")
            .setFooter({ text: `Use ${prefix}enroll to join a new degree.` });
        message.reply({ embeds: [embed] });
    }
    catch (err) {
        message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Dropout Failed", err.message)] });
    }
}
//# sourceMappingURL=dropout.js.map