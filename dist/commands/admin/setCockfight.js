"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetCockfight = handleSetCockfight;
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
async function handleSetCockfight(message, args) {
    // Usage: !setcockfight timer <time>
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Admins or Bot Commanders only.")] });
    }
    const sub = args[0]?.toLowerCase();
    if (sub === "training") {
        const baseCostStr = args[1];
        const multStr = args[2];
        if (!baseCostStr || !multStr) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Missing Arguments", "Usage: `!setcockfight training <base_cost> <multiplier>`\nExample: `!setcockfight training 1000 0.5`")] });
        }
        const baseCost = parseInt(baseCostStr);
        const mult = parseFloat(multStr);
        if (isNaN(baseCost) || baseCost < 0) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Base Cost", "Base cost must be a positive number.")] });
        }
        if (isNaN(mult) || mult < 0) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Multiplier", "Multiplier must be a positive number (e.g. 0.5 for 50%).")] });
        }
        await (0, guildConfigService_1.updateGuildConfig)(message.guildId, {
            chickenTrainBaseCost: baseCost,
            chickenTrainMultiplier: mult
        });
        return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Configuration Updated", `Training Cost updated:\nBase: **${baseCost}**\nMultiplier: **${mult}**`)] });
    }
    if (sub === "heal") {
        const costStr = args[1];
        if (!costStr)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Missing Argument", "Usage: `!setcockfight heal <cost>`")] });
        const cost = parseInt(costStr);
        if (isNaN(cost) || cost < 0)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Cost", "Cost must be a positive number.")] });
        await (0, guildConfigService_1.updateGuildConfig)(message.guildId, { chickenHealCost: cost });
        return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Configuration Updated", `Chicken heal cost set to **${cost}** coins.`)] });
    }
    if (sub !== "timer") {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", "Usage:\n`!setcockfight timer <duration>`\n`!setcockfight training <base> <mult>`\n`!setcockfight heal <cost>`")] });
    }
    const durationStr = args[1]?.toLowerCase();
    if (!durationStr) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Missing Argument", "Please provide a duration (e.g., `30s`, `1m`).")] });
    }
    // Parse Duration
    let seconds = 0;
    if (durationStr.endsWith("s")) {
        seconds = parseInt(durationStr.replace("s", ""));
    }
    else if (durationStr.endsWith("m")) {
        seconds = parseInt(durationStr.replace("m", "")) * 60;
    }
    else {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Format", "Use `s` for seconds or `m` for minutes. (e.g. `60s`, `2m`)")] });
    }
    if (isNaN(seconds) || seconds < 10 || seconds > 300) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Value", "Timer must be between **10s** and **5m**.")] });
    }
    await (0, guildConfigService_1.updateGuildConfig)(message.guildId, { cockfightBetTime: seconds });
    return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Configuration Updated", `Cockfight betting time set to **${seconds} seconds**.`)] });
}
//# sourceMappingURL=setCockfight.js.map