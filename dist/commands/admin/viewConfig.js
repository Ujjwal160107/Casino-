"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminViewConfig = handleAdminViewConfig;
const discord_js_1 = require("discord.js");
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const branding_1 = require("../../config/branding");
const duration_1 = require("../../utils/duration");
const prisma_1 = __importDefault(require("../../utils/prisma"));
async function handleAdminViewConfig(message, args) {
    try {
        if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Permission", "Admins or Bot Commanders only.")] });
        }
        const cfg = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        // Formatting Helpers
        const formatPct = (val) => `${val ?? 0}%`;
        const formatLimit = (val) => val ? val.toLocaleString() : "Unlimited";
        const formatMoney = (val) => `${cfg.currencyEmoji} ${val.toLocaleString()}`;
        // Job Formatters
        const sectors = cfg.jobSectorBasePay || {};
        const levels = cfg.jobLevelMultipliers || {};
        const sectorText = Object.keys(sectors).length > 0
            ? Object.entries(sectors).map(([k, v]) => `• **${k.charAt(0).toUpperCase() + k.slice(1)}**: ${formatMoney(v)}`).join("\n")
            : "Using Defaults";
        const levelText = Object.keys(levels).length > 0
            ? Object.entries(levels).map(([k, v]) => `• **${k}**: ${v}x`).join("\n")
            : "Using Defaults";
        // Cooldowns
        const gameCds = cfg.gameCooldowns || {};
        const globalGameCd = gameCds["global"] || 0;
        const specificGameCds = Object.entries(gameCds)
            .filter(([k]) => k !== "global")
            .map(([k, v]) => `• **${k.charAt(0).toUpperCase() + k.slice(1)}**: ${(0, duration_1.formatDuration)(v)}`)
            .join("\n");
        // Income Configs
        const incomeCfgs = await prisma_1.default.incomeConfig.findMany({ where: { guildId: message.guildId } });
        const incomeMap = new Map(incomeCfgs.map(i => [i.commandKey, i]));
        const formatIncome = (cmd) => {
            const c = incomeMap.get(cmd);
            if (!c)
                return `Default`;
            return `${(0, duration_1.formatDuration)(c.cooldown)} | ${cfg.currencyEmoji}${c.minPay}-${c.maxPay}`;
        };
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Think} Server Configuration`)
            .setDescription(`Current settings for **${message.guild.name}**`)
            .addFields({
            name: `${branding_1.Mascot.Emotes.MoneyBag} Economy`,
            value: `**Currency:** ${cfg.currencyEmoji} ${cfg.currencyName}
**Start Money:** ${formatMoney(cfg.startMoney)}
**Tax (Transfer/Income):** ${formatPct(cfg.transferTax)} / ${formatPct(cfg.incomeTax)}
**Market Tax:** ${formatPct(cfg.marketTax)}
**Bank Limit:** ${formatLimit(cfg.bankLimit)}
**Wallet Limit:** ${formatLimit(cfg.walletLimit)}
**Interest (Loan/FD/RD):** ${formatPct(cfg.loanInterestRate)} / ${formatPct(cfg.fdInterestRate)} / ${formatPct(cfg.rdInterestRate)}`,
            inline: true
        }, {
            name: `${branding_1.Mascot.Emotes.Alert} Crime`,
            value: `**Rob Success:** ${formatPct(cfg.robSuccessPct)}
**Rob Fine:** ${formatPct(cfg.robFinePct)}
**Rob Cooldown:** ${(0, duration_1.formatDuration)(cfg.robCooldown)}`,
            inline: true
        }, {
            name: `${branding_1.Mascot.Emotes.MoneyBag} Income Settings`,
            value: `**Work:** ${formatIncome("work")}
**Crime:** ${formatIncome("crime")}
**Beg:** ${formatIncome("beg")}
**Slut:** ${formatIncome("slut")}`,
            inline: true
        }, {
            name: `${branding_1.Mascot.Emotes.Money} Gambling`,
            value: `**Min Bet:** ${formatMoney(cfg.minBet)}
**Max Bet:** ${formatLimit(cfg.maxBet)}
**Global Cooldown:** ${(0, duration_1.formatDuration)(globalGameCd)}
${specificGameCds}`,
            inline: true
        }, {
            name: `${branding_1.Mascot.Emotes.JobWorking} Jobs`,
            value: `**Base Salaries:**
${sectorText}

**Level Multipliers:**
${levelText}`,
            inline: false
        }, {
            name: `${branding_1.Mascot.Emotes.Teacher} Education`,
            value: `**Study Cooldown:** ${(0, duration_1.formatDuration)(cfg.studyCooldown)}`,
            inline: true
        }, {
            name: `${branding_1.Mascot.Emotes.Graph} Credit System`,
            value: `**Max Score:** ${cfg.maxCreditScore}
**Score Reward:** +${cfg.creditScoreReward}
**Score Penalty:** -${cfg.creditScorePenalty}
**Max Active Loans:** ${cfg.maxActiveLoans}`,
            inline: false
        })
            .setColor(branding_1.Mascot.Colors.Base)
            .setFooter({ text: "Use !setup to change these settings" });
        return message.reply({ embeds: [embed] });
    }
    catch (err) {
        console.error("handleAdminViewConfig error:", err);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Internal Error", "Failed to fetch config.")] });
    }
}
//# sourceMappingURL=viewConfig.js.map