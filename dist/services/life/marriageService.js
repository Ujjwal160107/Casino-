"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarriage = getMarriage;
exports.isMarried = isMarried;
exports.marry = marry;
exports.divorce = divorce;
exports.checkHasRing = checkHasRing;
exports.consumeRing = consumeRing;
exports.depositToJoint = depositToJoint;
exports.withdrawFromJoint = withdrawFromJoint;
const walletService_1 = require("../../services/walletService");
const prisma_1 = __importDefault(require("../../utils/prisma"));
// Helper to resolve or create user
async function resolveUser(discordId, guildId, username = "Unknown User") {
    return await (0, walletService_1.ensureUserAndWallet)(discordId, guildId, username);
}
// NOTE: We update the signature to accept optional username, but for backward compatibility primarily use resolveUser wrapper
async function getMarriage(discordId, guildId) {
    // For getMarriage, we just want to find. If they don't exist, they aren't married.
    // So distinct logic: only READ.
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } }
    });
    if (!user)
        return null;
    // Check if user is spouse1 or spouse2
    const marriage = await prisma_1.default.marriage.findFirst({
        where: {
            OR: [
                { spouse1Id: user.id },
                { spouse2Id: user.id }
            ]
        },
        include: {
            spouse1: true,
            spouse2: true
        }
    });
    return marriage;
}
async function isMarried(discordId, guildId) {
    const marriage = await getMarriage(discordId, guildId);
    return !!marriage;
}
async function marry(discordId1, username1, discordId2, username2, guildId) {
    const user1 = await resolveUser(discordId1, guildId, username1);
    const user2 = await resolveUser(discordId2, guildId, username2);
    if (!user1 || !user2)
        throw new Error("One or both users not found.");
    // Double check if either is married using INTERNAL IDs
    // We can reuse getMarriage with internal ID logic if we refactor, but here we can just query directly or call isMarried with discordIds (which repeats resolution). 
    // Optimization: query directly since we have user1.id and user2.id
    // Check spouse 1
    const m1 = await prisma_1.default.marriage.findFirst({
        where: { OR: [{ spouse1Id: user1.id }, { spouse2Id: user1.id }] }
    });
    if (m1)
        throw new Error("You are already married!");
    // Check spouse 2
    const m2 = await prisma_1.default.marriage.findFirst({
        where: { OR: [{ spouse1Id: user2.id }, { spouse2Id: user2.id }] }
    });
    if (m2)
        throw new Error("Partner is already married!");
    // Create marriage
    return await prisma_1.default.marriage.create({
        data: {
            spouse1Id: user1.id,
            spouse2Id: user2.id,
        }
    });
}
async function divorce(discordId, guildId) {
    const marriage = await getMarriage(discordId, guildId);
    if (!marriage) {
        throw new Error("You are not married!");
    }
    return await prisma_1.default.marriage.delete({
        where: { id: marriage.id }
    });
}
async function checkHasRing(discordId, guildId) {
    const user = await resolveUser(discordId, guildId);
    if (!user)
        return false;
    const inventoryItem = await prisma_1.default.inventory.findFirst({
        where: {
            userId: user.id,
            shopItem: {
                name: {
                    equals: "Ring",
                    mode: "insensitive"
                }
            },
            amount: { gt: 0 }
        }
    });
    return !!inventoryItem;
}
async function consumeRing(discordId, guildId) {
    const user = await resolveUser(discordId, guildId);
    if (!user)
        return false;
    const inventoryItem = await prisma_1.default.inventory.findFirst({
        where: {
            userId: user.id,
            shopItem: {
                name: {
                    equals: "Ring",
                    mode: "insensitive"
                }
            },
            amount: { gt: 0 }
        }
    });
    if (!inventoryItem)
        return false;
    if (inventoryItem.amount > 1) {
        await prisma_1.default.inventory.update({
            where: { id: inventoryItem.id },
            data: { amount: { decrement: 1 } }
        });
    }
    else {
        await prisma_1.default.inventory.delete({
            where: { id: inventoryItem.id }
        });
    }
    return true;
}
async function depositToJoint(discordId, guildId, amount) {
    const user = await resolveUser(discordId, guildId);
    if (!user)
        throw new Error("User not found.");
    const marriage = await getMarriage(discordId, guildId);
    if (!marriage)
        throw new Error("You are not married!");
    const wallet = await prisma_1.default.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || wallet.balance < amount)
        throw new Error("Insufficient funds in your wallet.");
    return await prisma_1.default.$transaction(async (tx) => {
        // Deduct from wallet
        await tx.wallet.update({
            where: { userId: user.id },
            data: { balance: { decrement: amount } }
        });
        // Add to joint account
        const updatedMarriage = await tx.marriage.update({
            where: { id: marriage.id },
            data: { jointBalance: { increment: amount } }
        });
        return updatedMarriage.jointBalance;
    }, {
        maxWait: 5000, // default: 2000
        timeout: 10000 // default: 5000
    });
}
async function withdrawFromJoint(discordId, guildId, amount) {
    const user = await resolveUser(discordId, guildId);
    if (!user)
        throw new Error("User not found.");
    const marriage = await getMarriage(discordId, guildId);
    if (!marriage)
        throw new Error("You are not married!");
    if (marriage.jointBalance < amount)
        throw new Error("Insufficient funds in joint account.");
    return await prisma_1.default.$transaction(async (tx) => {
        // Deduct from joint account
        await tx.marriage.update({
            where: { id: marriage.id },
            data: { jointBalance: { decrement: amount } }
        });
        // Add to wallet
        await tx.wallet.update({
            where: { userId: user.id },
            data: { balance: { increment: amount } }
        });
        return marriage.jointBalance - amount;
    }, {
        maxWait: 5000, // default: 2000
        timeout: 10000 // default: 5000
    });
}
//# sourceMappingURL=marriageService.js.map