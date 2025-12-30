"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetGlobalGameCooldown = handleSetGlobalGameCooldown;
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const permissionUtils_1 = require("../../utils/permissionUtils");
const GAMES = ["roulette", "blackjack", "coinflip", "slots", "cockfight"];
async function handleSetGlobalGameCooldown(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const timeInput = args.join(" ");
    if (!timeInput) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Usage", `\`${config.prefix}set-global-game-cooldown <time|off>\`\nExample: \`${config.prefix}set-global-game-cooldown 10s\` or \`${config.prefix}set-global-game-cooldown off\``)]
        });
    }
    let seconds = 0;
    if (timeInput.toLowerCase() === "off" || timeInput === "0") {
        seconds = 0;
    }
    else {
        const parsed = (0, format_1.parseDuration)(timeInput);
        if (parsed === null || parsed < 0) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Time", "Please provide a valid duration (e.g. `10s`, `1m`) or `off`.")] });
        }
        seconds = parsed;
    }
    let cooldowns = config.gameCooldowns || {};
    if (typeof cooldowns !== "object")
        cooldowns = {};
    // Update for all games
    for (const game of GAMES) {
        cooldowns[game] = seconds;
    }
    await (0, guildConfigService_1.updateGuildConfig)(message.guildId, {
        gameCooldowns: cooldowns
    });
    const status = seconds === 0 ? "disabled" : `set to **${(0, format_1.formatDuration)(seconds * 1000)}**`;
    return message.reply({
        embeds: [(0, embed_1.successEmbed)(message.author, "Global Cooldown Updated", `🕐 Cooldown for ALL games has been ${status}.`)]
    });
}
//# sourceMappingURL=setGlobalGameCooldown.js.map