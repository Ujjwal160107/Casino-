"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetPrefix = handleSetPrefix;
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
async function handleSetPrefix(message, args) {
    try {
        if (!message.guild)
            return;
        if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "No Permission", "Admins or Bot Commanders only.")]
            });
        }
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
        const currentPrefix = config.prefix || "!";
        const newPrefix = args[0];
        if (!newPrefix || newPrefix.length > 3) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Prefix", `Usage: \`${currentPrefix}setprefix <symbol>\` (max 3 chars)`)]
            });
        }
        await (0, guildConfigService_1.updateGuildConfig)(message.guildId, { prefix: newPrefix });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Prefix Updated", `New prefix set to **${newPrefix}**`)]
        });
    }
    catch (err) {
        console.error("handleSetPrefix error:", err);
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Internal Error", "Failed to set prefix.")]
        });
    }
}
//# sourceMappingURL=setPrefix.js.map