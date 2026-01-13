"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetIncome = handleSetIncome;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const permissionUtils_1 = require("../../utils/permissionUtils");
const SUPPORTED = ["work", "beg", "crime", "slut", "rob"]; // Added rob
async function handleSetIncome(message, args) {
    try {
        if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Permission", "Admins or Bot Commanders only.")] });
        }
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        const cmd = (args[0] ?? "").toLowerCase();
        const field = (args[1] ?? "").toLowerCase();
        const raw = args[2];
        if (!cmd || !field || raw === undefined || !SUPPORTED.includes(cmd)) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}setincome < work | beg | crime | slut > <min|max|cooldown|success|penalty> <value>\``)]
            });
        }
        const val = (0, format_1.parseSmartAmount)(raw);
        if (isNaN(val)) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Value", "Value must be a number (e.g. 50, 1k).")] });
        }
        const updates = {};
        if (field === "min") {
            if (!Number.isInteger(val) || val < 0)
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid min", "Must be non-negative integer")] });
            updates.minPay = Math.floor(val);
        }
        else if (field === "max") {
            if (!Number.isInteger(val) || val <= 0)
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid max", "Must be positive integer")] });
            updates.maxPay = Math.floor(val);
        }
        else if (field === "cooldown") {
            if (!Number.isInteger(val) || val < 0)
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid cooldown", "Must be non-negative integer seconds")] });
            updates.cooldown = Math.floor(val);
        }
        else if (field === "success") {
            if (!Number.isFinite(val) || val < 0 || val > 100)
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid success%", "Must be between 0 and 100")] });
            updates.successPct = Math.floor(val);
        }
        else if (field === "penalty") {
            if (!Number.isFinite(val) || val < 0 || val > 100)
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid penalty%", "Must be between 0 and 100")] });
            updates.failPenaltyPct = Math.floor(val);
        }
        else {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid field", "Allowed: min, max, cooldown, success, penalty")] });
        }
        const guildId = message.guildId;
        const commandKey = cmd;
        // Special handling for ROB (stored in GuildConfig, not IncomeConfig)
        if (commandKey === "rob") {
            const guildUpdates = {};
            if (field === "cooldown") {
                guildUpdates.robCooldown = updates.cooldown;
            }
            else if (field === "success") {
                guildUpdates.robSuccessPct = updates.successPct;
            }
            else if (field === "penalty") {
                guildUpdates.robFinePct = updates.failPenaltyPct;
            }
            else {
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Supported", "For 'rob', you can only set: cooldown, success, penalty.")] });
            }
            await (0, guildConfigService_1.updateGuildConfig)(guildId, guildUpdates);
            const formatted = Object.entries(guildUpdates).map(([k, v]) => `${k}=${v}`).join(", ");
            return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Rob Config Updated", `Updated **rob**: ${formatted}`)] });
        }
        await prisma_1.default.incomeConfig.upsert({
            where: { guildId_commandKey: { guildId, commandKey } },
            create: {
                guildId,
                commandKey,
                minPay: (updates.minPay ?? (commandKey === "beg" ? 10 : 50)),
                maxPay: (updates.maxPay ?? 150),
                cooldown: (updates.cooldown ?? 60),
                successPct: (updates.successPct ?? 100),
                failPenaltyPct: (updates.failPenaltyPct ?? 50)
            },
            update: updates
        });
        const emoji = config.currencyEmoji;
        const formattedUpdates = Object.entries(updates).map(([k, v]) => {
            if (k === "minPay" || k === "maxPay")
                return `${k}=${(0, format_1.fmtCurrency)(v, emoji)}`;
            return `${k}=${v}`;
        }).join(", ");
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Income Config Updated", `**${commandKey}** updated: ${formattedUpdates || "no changes?"}`)]
        });
    }
    catch (err) {
        console.error("handleSetIncome error:", err);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Internal Error", "Failed to update income config.")] });
    }
}
//# sourceMappingURL=setIncome.js.map