"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUse = handleUse;
const discord_js_1 = require("discord.js");
const shopService_1 = require("../../services/shopService");
const embed_1 = require("../../utils/embed");
const guildConfigService_1 = require("../../services/guildConfigService");
async function handleUse(message, args) {
    if (!message.guild || !message.member)
        return;
    const itemName = args.join(" ");
    if (!itemName) {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}use <item_name>\``)]
        });
    }
    try {
        const { item, results } = await (0, shopService_1.useItem)(message.author.id, message.guildId, itemName, message.member);
        const customMessages = results
            .filter(r => r.type === "CUSTOM_MESSAGE")
            .map(r => r.message);
        const otherEffects = results
            .filter(r => r.type !== "CUSTOM_MESSAGE")
            .map(r => r.message);
        // If only custom messages (passive items), show them in a clean embed and return
        if (customMessages.length > 0 && otherEffects.length === 0) {
            const embed = new discord_js_1.EmbedBuilder()
                .setColor("#3498DB") // Blue for info
                .setDescription(customMessages.join("\n"));
            return message.reply({ embeds: [embed] });
        }
        // If mixed or just effects
        if (customMessages.length > 0) {
            await message.channel.send(customMessages.join("\n"));
        }
        const embed = (0, embed_1.successEmbed)(message.author, `Used: ${item.name}`, otherEffects.length > 0 ? otherEffects.join("\n") : "✨ Item used successfully!");
        return message.reply({ embeds: [embed] });
    }
    catch (err) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Error", err.message || "Failed to use item.")]
        });
    }
}
//# sourceMappingURL=use.js.map