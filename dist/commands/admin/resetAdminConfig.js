"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleResetAdminSettings = handleResetAdminSettings;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const branding_1 = require("../../config/branding");
async function handleResetAdminSettings(message) {
    if (!message.member?.permissions.has("Administrator") && message.author.id !== message.guild?.ownerId) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Only Administrators/Owner can use this command.")] });
    }
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("confirm_reset_admin")
        .setLabel("CONFIRM RESET")
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setEmoji(branding_1.Mascot.Emotes.Alert), new discord_js_1.ButtonBuilder()
        .setCustomId("cancel_reset_admin")
        .setLabel("Cancel")
        .setStyle(discord_js_1.ButtonStyle.Secondary));
    const reply = await message.reply({
        content: `**${branding_1.Mascot.Emotes.Alert} DANGER ZONE**\nAre you sure you want to reset **ALL Admin Access Settings**?\n\n**This will:**\n- Enable all disabled commands.\n- Remove all Granular Permission overrides.\n- Clear Casino Channel whitelist.\n\n**This will NOT affect:**\n- Currency, Economy Configs, Taxes, or Cooldowns.`,
        components: [row]
    });
    const collector = reply.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        filter: (i) => i.user.id === message.author.id,
        time: 15000
    });
    collector.on("collect", async (interaction) => {
        if (interaction.customId === "cancel_reset_admin") {
            await interaction.update({ content: "Reset cancelled.", components: [] });
            return;
        }
        if (interaction.customId === "confirm_reset_admin") {
            const guildId = message.guildId;
            await prisma_1.default.guildConfig.update({
                where: { guildId },
                data: {
                    disabledCommands: [],
                    casinoChannels: []
                }
            });
            await prisma_1.default.commandPermission.deleteMany({
                where: { guildId }
            });
            await interaction.update({
                embeds: [(0, embed_1.successEmbed)(message.author, "Settings Reset", `${branding_1.Mascot.Emotes.Accept} All admin access settings, permissions, and restrictions have been reset to default.`)],
                components: []
            });
        }
    });
    collector.on("end", (_, reason) => {
        if (reason === "time") {
            reply.edit({ components: [] }).catch(() => { });
        }
    });
}
//# sourceMappingURL=resetAdminConfig.js.map