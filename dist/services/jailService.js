"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jailUser = jailUser;
exports.releaseUser = releaseUser;
exports.checkJailStatus = checkJailStatus;
exports.payBail = payBail;
const prisma_1 = __importDefault(require("../utils/prisma"));
const guildConfigService_1 = require("./guildConfigService");
async function jailUser(userId, guildId, durationSeconds) {
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const time = durationSeconds ?? config.jailTime; // Default from config
    const releaseTime = new Date(Date.now() + time * 1000);
    await prisma_1.default.user.update({
        where: { id: userId },
        data: {
            isJailed: true,
            jailReleaseTime: releaseTime
        }
    });
    return releaseTime;
}
async function releaseUser(userId) {
    await prisma_1.default.user.update({
        where: { id: userId },
        data: {
            isJailed: false,
            jailReleaseTime: null
        }
    });
}
async function checkJailStatus(userId) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isJailed: true, jailReleaseTime: true }
    });
    if (!user || !user.isJailed) {
        return { isJailed: false, releaseTime: null };
    }
    // Check if time expired
    if (user.jailReleaseTime && new Date() > user.jailReleaseTime) {
        await releaseUser(userId);
        return { isJailed: false, releaseTime: null };
    }
    return { isJailed: true, releaseTime: user.jailReleaseTime };
}
async function payBail(userId, guildId) {
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const fine = config.jailFine;
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
    });
    if (!user || !user.wallet) {
        return { success: false, message: "User or wallet not found." };
    }
    if (user.wallet.balance < fine) {
        return { success: false, message: `You need **${fine}** coins to post bail.` };
    }
    // Deduct money and release
    // Deduct money and release
    let retries = 3;
    while (retries > 0) {
        try {
            await prisma_1.default.$transaction([
                prisma_1.default.wallet.update({
                    where: { id: user.wallet.id },
                    data: { balance: { decrement: fine } }
                }),
                prisma_1.default.transaction.create({
                    data: {
                        walletId: user.wallet.id,
                        amount: -fine,
                        type: "jail_bail",
                        meta: { fine }
                    }
                }),
                prisma_1.default.user.update({
                    where: { id: userId },
                    data: { isJailed: false, jailReleaseTime: null }
                })
            ]);
            break; // Success
        }
        catch (error) {
            if (error.code === 'P2034' && retries > 1) {
                retries--;
                await new Promise(res => setTimeout(res, 200)); // Backoff
                continue;
            }
            throw error; // Re-throw other errors or if retries exhausted
        }
    }
    return { success: true, message: `You paid **${fine}** coins and have been released from jail.` };
}
//# sourceMappingURL=jailService.js.map