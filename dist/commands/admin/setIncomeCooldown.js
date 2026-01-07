"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetIncomeCooldown = handleSetIncomeCooldown;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const permissionUtils_1 = require("../../utils/permissionUtils");
const guildConfigService_1 = require("../../services/guildConfigService");
const SUPPORTED = ["work", "beg", "crime", "slut", "rob"];
async function handleSetIncomeCooldown(message, args) {
    try {
        if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Permission", "Admins or Bot Commanders only.")] });
        }
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        const cmd = (args[0] ?? "").toLowerCase();
        const timeStr = args.slice(1).join(" ");
        let seconds = 0;
        if (timeStr.toLowerCase() === "off") {
            seconds = 0;
        }
        else {
            seconds = (0, format_1.parseDuration)(timeStr);
        }
        if (!SUPPORTED.includes(cmd) || seconds === null || seconds < 0) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}setincomecooldown <work|beg|crime|slut|rob> <duration|off>\`\nExample: \`${config.prefix}setincomecooldown work 1h 30m\` or \`... work off\``)]
            });
        }
        if (cmd === "rob") {
            await (0, guildConfigService_1.updateGuildConfig)(message.guildId, { robCooldown: seconds });
        }
        else {
            await prisma_1.default.incomeConfig.upsert({
                where: { guildId_commandKey: { guildId: message.guildId, commandKey: cmd } },
                create: { guildId: message.guildId, commandKey: cmd, minPay: 10, maxPay: 50, cooldown: seconds, successPct: 100 },
                update: { cooldown: seconds }
            });
        }
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Cooldown Updated", `Set **${cmd}** cooldown to **${(0, format_1.formatDuration)(seconds)}**`)]
        });
    }
    catch (err) {
        console.error("handleSetIncomeCooldown error:", err);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Internal Error", "Failed to set cooldown.")] });
    }
}
//# sourceMappingURL=setIncomeCooldown.js.map