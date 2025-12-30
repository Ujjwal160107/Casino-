"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetGameCooldown = handleSetGameCooldown;
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const permissionUtils_1 = require("../../utils/permissionUtils");
async function handleSetGameCooldown(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const game = args[0]?.toLowerCase();
    const timeInput = args.slice(1).join(" ");
    if (!game || !timeInput) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Usage", `\`${config.prefix}set-game-cooldown <game> <time|off>\`\nExample: \`${config.prefix}game-cd slots 30s\` or \`${config.prefix}game-cd slots off\``)]
        });
    }
    const isOff = timeInput.toLowerCase() === "off" || timeInput === "0";
    const seconds = isOff ? 0 : (0, format_1.parseDuration)(timeInput);
    if (seconds === null || seconds < 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Time", "Please provide a valid duration (e.g. `30s`, `1m`, `1h`) or `off`.")] });
    }
    let cooldowns = config.gameCooldowns || {};
    if (typeof cooldowns !== "object")
        cooldowns = {};
    cooldowns[game] = seconds;
    await (0, guildConfigService_1.updateGuildConfig)(message.guildId, {
        gameCooldowns: cooldowns
    });
    const status = seconds === 0 ? "disabled" : `set to **${(0, format_1.formatDuration)(seconds * 1000)}**`;
    return message.reply({
        embeds: [(0, embed_1.successEmbed)(message.author, "Configuration Updated", `🕐 **${game.toUpperCase()}** cooldown ${status}.`)]
    });
}
//# sourceMappingURL=setGameCooldown.js.map