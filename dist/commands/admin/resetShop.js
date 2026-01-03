"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleResetShop = handleResetShop;
const discord_js_1 = require("discord.js");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const shopService_1 = require("../../services/shopService");
const branding_1 = require("../../config/branding");
async function handleResetShop(message, args) {
    // Permission check
    if (!(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Admins only.")] });
    }
    // Count items
    const items = await (0, shopService_1.getShopItems)(message.guildId, "GENERAL");
    if (items.length === 0) {
        return message.reply("The general shop is already empty.");
    }
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("confirm_reset_shop").setLabel("Confirm Reset").setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId("cancel_reset_shop").setLabel("Cancel").setStyle(discord_js_1.ButtonStyle.Secondary));
    const msg = await message.reply({
        content: `Are you sure you want to delete ALL **${items.length}** items from the **General Store**?\nThis cannot be undone.`,
        components: [row]
    });
    const collector = msg.createMessageComponentCollector({ componentType: discord_js_1.ComponentType.Button, time: 30000 });
    collector.on("collect", async (i) => {
        if (i.user.id !== message.author.id) {
            return i.reply({ content: "Not your command.", ephemeral: true });
        }
        if (i.customId === "cancel_reset_shop") {
            await i.update({ content: "Reset cancelled.", components: [] });
            collector.stop();
            return;
        }
        if (i.customId === "confirm_reset_shop") {
            await (0, shopService_1.resetShop)(message.guildId, "GENERAL");
            await i.update({ content: `${branding_1.Mascot.Emotes.Success} **General Store** completely reset.`, components: [] });
            collector.stop();
        }
    });
    collector.on("end", async (collected, reason) => {
        if (reason === "time") {
            msg.edit({ components: [] }).catch(() => { });
        }
    });
}
//# sourceMappingURL=resetShop.js.map