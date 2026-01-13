"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIncomeConfigOrDefault = getIncomeConfigOrDefault;
exports.runIncomeCommand = runIncomeCommand;
const prisma_1 = __importDefault(require("../utils/prisma"));
const cooldown_1 = require("../utils/cooldown");
const guildConfigService_1 = require("./guildConfigService");
const walletService_1 = require("./walletService");
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
async function getIncomeConfigOrDefault(guildId, commandKey) {
    if (!guildId) {
        return { minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50 };
    }
    const cfg = await prisma_1.default.incomeConfig.findUnique({
        where: { guildId_commandKey: { guildId, commandKey } }
    });
    if (cfg) {
        return {
            minPay: cfg.minPay,
            maxPay: cfg.maxPay,
            cooldown: cfg.cooldown,
            successPct: cfg.successPct ?? 100,
            failPenaltyPct: cfg.failPenaltyPct ?? 50,
            successMessages: cfg.successMessages || [],
            failMessages: cfg.failMessages || []
        };
    }
    return { minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50 };
}
const executeTx = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        }
        catch (error) {
            const msg = error?.message?.toLowerCase() || "";
            if (i < retries - 1 && (msg.includes("deadlock") || msg.includes("write conflict") || msg.includes("busy"))) {
                await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Transaction failed max retries");
};
async function runIncomeCommand({ commandKey, discordId, guildId, userId, walletId }) {
    const cfg = await getIncomeConfigOrDefault(guildId, commandKey);
    const cooldownKey = `income:${guildId}:${discordId}:${commandKey}`;
    const cd = (0, cooldown_1.checkDynamicCooldown)(cooldownKey, cfg.cooldown);
    if (cd > 0) {
        const timestamp = Math.floor((Date.now() / 1000) + cd);
        throw new Error(`Cooldown active. Try again <t:${timestamp}:R>.`);
    }
    const amount = rand(cfg.minPay, cfg.maxPay);
    const successPct = cfg.successPct ?? 100;
    const success = Math.random() * 100 < successPct;
    if (!success) {
        const penaltyPct = cfg.failPenaltyPct ?? 50;
        const penalty = Math.max(1, Math.floor((amount * penaltyPct) / 100));
        await executeTx(async () => {
            await prisma_1.default.$transaction([
                prisma_1.default.transaction.create({
                    data: {
                        walletId,
                        amount: -penalty,
                        type: `${commandKey}_fail`,
                        meta: { penalty, attempted: amount, penaltyPct }
                    }
                }),
                prisma_1.default.wallet.update({
                    where: { id: walletId },
                    data: { balance: { decrement: penalty } }
                })
            ]);
        });
        return {
            success: false,
            amount: -penalty,
            penalty,
            attempted: amount,
            messages: { success: cfg.successMessages, fail: cfg.failMessages }
        };
    }
    if (guildId) {
        const guildConfig = await (0, guildConfigService_1.getGuildConfig)(guildId);
        if (guildConfig.walletLimit) {
            const wallet = await (0, walletService_1.getWalletById)(walletId);
            if (wallet && wallet.balance + amount > guildConfig.walletLimit) {
                throw new Error(`Wallet limit of ${guildConfig.walletLimit} reached. Cannot earn more.`);
            }
        }
    }
    await executeTx(async () => {
        await prisma_1.default.$transaction([
            prisma_1.default.transaction.create({
                data: {
                    walletId,
                    amount,
                    type: `${commandKey}_income`,
                    meta: { commandKey },
                    isEarned: true
                }
            }),
            prisma_1.default.wallet.update({
                where: { id: walletId },
                data: { balance: { increment: amount } }
            })
        ]);
    });
    return {
        success: true,
        amount,
        messages: { success: cfg.successMessages, fail: cfg.failMessages }
    };
}
//# sourceMappingURL=incomeService.js.map