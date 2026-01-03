"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetShop = resetShop;
exports.getShopItems = getShopItems;
exports.getShopItemByName = getShopItemByName;
exports.createShopItem = createShopItem;
exports.updateShopItem = updateShopItem;
exports.deleteShopItem = deleteShopItem;
exports.buyItem = buyItem;
exports.useItem = useItem;
exports.getUserInventory = getUserInventory;
const prisma_1 = __importDefault(require("../utils/prisma"));
const effectService_1 = require("./effectService");
const discordLogger_1 = require("../utils/discordLogger");
const discord_js_1 = require("discord.js");
async function resetShop(guildId, category = "GENERAL") {
    return prisma_1.default.shopItem.deleteMany({
        where: { guildId, category }
    });
}
async function getShopItems(guildId, category = "GENERAL") {
    return prisma_1.default.shopItem.findMany({ where: { guildId, category } });
}
async function getShopItemByName(guildId, name) {
    return prisma_1.default.shopItem.findFirst({
        where: {
            guildId,
            name: { equals: name, mode: "insensitive" }
        }
    });
}
async function createShopItem(guildId, name, price, description, roleId, itemType, effects, consumable, category = "GENERAL") {
    return prisma_1.default.shopItem.create({
        data: {
            guildId,
            name,
            price,
            description: description || "No description",
            roleId,
            stock: -1,
            itemType: itemType || "COLLECTIBLE",
            effects: effects ? effects : undefined,
            consumable: consumable || false,
            category
        }
    });
}
async function updateShopItem(guildId, itemId, data) {
    const updateData = { ...data };
    if (data.effects) {
        updateData.effects = data.effects;
    }
    return prisma_1.default.shopItem.update({
        where: { id: itemId },
        data: updateData
    });
}
async function deleteShopItem(itemId) {
    return prisma_1.default.shopItem.delete({ where: { id: itemId } });
}
async function buyItem(guildId, userId, itemName, member) {
    const item = await prisma_1.default.shopItem.findFirst({
        where: {
            guildId,
            name: { equals: itemName, mode: "insensitive" }
        }
    });
    if (!item)
        throw new Error("Item not found.");
    if (item.stock !== -1 && item.stock <= 0)
        throw new Error("Out of stock.");
    return prisma_1.default.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { discordId_guildId: { discordId: userId, guildId } },
            include: { wallet: true }
        });
        if (!user || !user.wallet || user.wallet.balance < item.price) {
            throw new Error(`You need ${item.price} coins to buy this.`);
        }
        let metaData = {};
        // CHECK: Limit "Chicken" to 1 per person & Generate Trait
        if (item.name.toLowerCase() === "chicken") {
            const existingInfo = await tx.inventory.findUnique({
                where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } }
            });
            if (existingInfo && existingInfo.amount >= 1) {
                throw new Error("You can only hold 1 Chicken at a time!");
            }
            const TRAITS = ["Aggressive", "Tank", "Speedster", "Balanced", "Fierce"];
            const trait = TRAITS[Math.floor(Math.random() * TRAITS.length)];
            metaData = {
                name: `${user.username}'s Chicken`,
                level: 0,
                xp: 0,
                wins: 0,
                strength: 0,
                agility: 0,
                defense: 0,
                trait: trait
            };
        }
        await tx.wallet.update({
            where: { id: user.wallet.id },
            data: { balance: { decrement: item.price } }
        });
        if (item.stock !== -1) {
            await tx.shopItem.update({
                where: { id: item.id },
                data: { stock: { decrement: 1 } }
            });
        }
        // Always add to inventory
        await tx.inventory.upsert({
            where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
            create: {
                guildId,
                userId: user.id,
                shopItemId: item.id,
                amount: 1,
                meta: metaData
            },
            update: { amount: { increment: 1 } }
        });
        await tx.transaction.create({
            data: {
                walletId: user.wallet.id,
                amount: -item.price,
                type: "shop_buy",
                meta: { itemName: item.name },
                isEarned: false
            }
        });
        return item;
    });
}
async function useItem(userId, guildId, itemName, member) {
    const item = await getShopItemByName(guildId, itemName);
    if (!item)
        throw new Error("Item not found.");
    if (!item.consumable && !item.effects) {
        throw new Error("This item cannot be used.");
    }
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } }
    });
    if (!user)
        throw new Error("User not found.");
    const inventoryItem = await prisma_1.default.inventory.findUnique({
        where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
        include: { shopItem: true }
    });
    if (!inventoryItem || inventoryItem.amount <= 0) {
        throw new Error("You don't own this item.");
    }
    if (member && member.client) {
        const guild = await member.client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
            await (0, discordLogger_1.logToChannel)(member.client, {
                guild,
                type: "ECONOMY",
                title: "Item Used",
                description: `<@${userId}> used **${item.name}**`,
                color: discord_js_1.Colors.Blue,
                thumbnail: member.user.displayAvatarURL()
            });
        }
    }
    // Apply effects
    const effects = item.effects || [];
    const results = await (0, effectService_1.applyItemEffects)(userId, guildId, effects, member);
    // Decrease or remove from inventory if consumable
    if (item.consumable) {
        if (inventoryItem.amount === 1) {
            await prisma_1.default.inventory.delete({
                where: { id: inventoryItem.id }
            });
        }
        else {
            await prisma_1.default.inventory.update({
                where: { id: inventoryItem.id },
                data: { amount: { decrement: 1 } }
            });
        }
    }
    return { item, results };
}
async function getUserInventory(discordId, guildId) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } }
    });
    if (!user)
        return [];
    return prisma_1.default.inventory.findMany({
        where: {
            guildId,
            userId: user.id
        },
        include: { shopItem: true }
    });
}
//# sourceMappingURL=shopService.js.map