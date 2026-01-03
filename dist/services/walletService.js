"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserAndWallet = ensureUserAndWallet;
exports.getWalletByDiscord = getWalletByDiscord;
exports.getWalletById = getWalletById;
exports.depositToWallet = depositToWallet;
exports.removeMoneyFromWallet = removeMoneyFromWallet;
exports.transferMoney = transferMoney;
const prisma_1 = __importDefault(require("../utils/prisma"));
const guildConfigService_1 = require("./guildConfigService");
const userIdCache = new Map();
async function ensureUserAndWallet(discordId, guildId, username) {
    const cacheKey = `${discordId}-${guildId}`;
    if (userIdCache.has(cacheKey)) {
        const user = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId, guildId } },
            include: { wallet: true }
        });
        if (user && user.wallet)
            return user;
    }
    // Fetch config for start money
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const user = await prisma_1.default.user.upsert({
        where: { discordId_guildId: { discordId, guildId } },
        update: { username },
        create: {
            discordId,
            guildId,
            username,
            wallet: { create: { balance: config.startMoney } }
        },
        include: { wallet: true }
    });
    userIdCache.set(cacheKey, user.id);
    return user;
}
async function getWalletByDiscord(discordId, guildId) { const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } }, include: { wallet: true } }); return user?.wallet ?? null; }
async function getWalletById(walletId) { return prisma_1.default.wallet.findUnique({ where: { id: walletId } }); }
async function depositToWallet(walletId, amount, meta = {}, earned = false, guildId) { if (guildId) {
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    if (config.walletLimit) {
        const wallet = await prisma_1.default.wallet.findUnique({ where: { id: walletId } });
        if (wallet && wallet.balance + amount > config.walletLimit) {
            throw new Error(`Wallet limit of ${config.walletLimit} reached.`);
        }
    }
} await prisma_1.default.$transaction([prisma_1.default.transaction.create({ data: { walletId, amount, type: "deposit", meta, isEarned: earned } }), prisma_1.default.wallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } })]); }
async function removeMoneyFromWallet(walletId, amount) {
    const wallet = await prisma_1.default.wallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.balance < amount)
        throw new Error("Insufficient wallet funds.");
    await prisma_1.default.$transaction([prisma_1.default.transaction.create({
            data: {
                walletId,
                amount: -amount,
                type: "admin_remove",
                meta: { by: "admin" }
            }
        }),
        prisma_1.default.wallet.update({
            where: { id: walletId },
            data: { balance: { decrement: amount } }
        })
    ]);
    return wallet.balance - amount;
}
async function transferMoney(fromDiscordId, toDiscordId, amount, guildId) { if (amount <= 0)
    throw new Error("Amount must be positive."); if (fromDiscordId === toDiscordId)
    throw new Error("Cannot transfer to self."); const fromUser = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: fromDiscordId, guildId } }, include: { wallet: true } }); if (!fromUser || !fromUser.wallet)
    throw new Error("Sender has no wallet."); if (fromUser.wallet.balance < amount)
    throw new Error("Insufficient funds."); const toUser = await ensureUserAndWallet(toDiscordId, guildId, "UnknownUser"); const config = await (0, guildConfigService_1.getGuildConfig)(guildId); if (config.walletLimit) {
    if (toUser.wallet.balance + amount > config.walletLimit) {
        throw new Error(`Recipient's wallet is full (Max: ${config.walletLimit}).`);
    }
} await prisma_1.default.$transaction([prisma_1.default.wallet.update({ where: { id: fromUser.wallet.id }, data: { balance: { decrement: amount } } }), prisma_1.default.transaction.create({ data: { walletId: fromUser.wallet.id, amount: -amount, type: "transfer_sent", meta: { to: toDiscordId } } }), prisma_1.default.wallet.update({ where: { id: toUser.wallet.id }, data: { balance: { increment: amount } } }), prisma_1.default.transaction.create({ data: { walletId: toUser.wallet.id, amount: amount, type: "transfer_recv", meta: { from: fromDiscordId } } })]); }
//# sourceMappingURL=walletService.js.map