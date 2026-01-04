"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReward = handleReward;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const guildConfigService_1 = require("../../services/guildConfigService");
const walletService_1 = require("../../services/walletService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const REWARD_CONFIG = {
    daily: {
        amountField: "dailyAmount",
        lastField: "lastDaily",
        interval: 86400000,
        name: "Daily",
    },
    weekly: {
        amountField: "weeklyAmount",
        lastField: "lastWeekly",
        interval: 7 * 86400000,
        name: "Weekly",
    },
    monthly: {
        amountField: "monthlyAmount",
        lastField: "lastMonthly",
        interval: 30 * 86400000,
        name: "Monthly",
    },
};
async function handleReward(message, type) {
    const { author, guildId } = message;
    if (!guildId)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const rewardConfig = REWARD_CONFIG[type];
    const user = await (0, walletService_1.ensureUserAndWallet)(author.id, guildId, author.username);
    const lastClaim = user[rewardConfig.lastField];
    const now = Date.now();
    if (lastClaim && now - lastClaim.getTime() < rewardConfig.interval) {
        const timeLeft = rewardConfig.interval - (now - lastClaim.getTime());
        const timeString = (0, format_1.formatDuration)(timeLeft);
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(author, "Cooldown", `You have already claimed your ${rewardConfig.name} reward.\nCome back in **${timeString}**.`)]
        });
    }
    const amount = config[rewardConfig.amountField];
    let retries = 3;
    while (retries > 0) {
        try {
            await prisma_1.default.$transaction([
                prisma_1.default.user.update({
                    where: { id: user.id },
                    data: { [rewardConfig.lastField]: new Date() },
                }),
                prisma_1.default.wallet.update({
                    where: { id: user.wallet.id },
                    data: { balance: { increment: amount } },
                }),
                prisma_1.default.transaction.create({
                    data: {
                        walletId: user.wallet.id,
                        amount: amount,
                        type: `${type}_reward`,
                        meta: { source: "system" },
                        isEarned: true
                    }
                })
            ]);
            break; // Success
        }
        catch (error) {
            if (error.code === 'P2034' && retries > 1) {
                retries--;
                await new Promise(r => setTimeout(r, 200)); // Wait 200ms before retry
                continue;
            }
            throw error; // associated with other errors or out of retries
        }
    }
    return message.reply({
        embeds: [(0, embed_1.successEmbed)(author, `${rewardConfig.name} Reward Claimed!`, `You claimed your ${rewardConfig.name} reward of **${(0, format_1.fmtCurrency)(amount, config.currencyEmoji)}**!`)]
    });
}
//# sourceMappingURL=rewards.js.map