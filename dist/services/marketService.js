"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listItemOnMarket = listItemOnMarket;
exports.listPropertyOnMarket = listPropertyOnMarket;
exports.buyItemFromMarket = buyItemFromMarket;
exports.getMarketListings = getMarketListings;
exports.getUserListings = getUserListings;
exports.cancelListing = cancelListing;
const prisma_1 = __importDefault(require("../utils/prisma"));
const guildConfigService_1 = require("./guildConfigService");
const bankService_1 = require("./bankService");
// List an ITEM
async function listItemOnMarket(discordId, guildId, shopItemId, amount, totalPrice) {
    if (amount <= 0 || totalPrice <= 0)
        throw new Error("Invalid amount or price.");
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        throw new Error("User not found.");
    const inventoryItem = await prisma_1.default.inventory.findUnique({
        where: {
            userId_shopItemId: {
                userId: user.id,
                shopItemId
            }
        }
    });
    if (!inventoryItem || inventoryItem.amount < amount) {
        throw new Error("You do not have enough of this item to sell.");
    }
    await prisma_1.default.$transaction(async (tx) => {
        if (inventoryItem.amount === amount) {
            await tx.inventory.delete({ where: { id: inventoryItem.id } });
        }
        else {
            await tx.inventory.update({
                where: { id: inventoryItem.id },
                data: { amount: { decrement: amount } }
            });
        }
        await tx.marketListing.create({
            data: {
                guildId,
                sellerId: user.id,
                shopItemId,
                amount,
                totalPrice
            }
        });
    });
    return { success: true };
}
// List a PROPERTY
async function listPropertyOnMarket(discordId, guildId, propertyId, totalPrice) {
    if (totalPrice <= 0)
        throw new Error("Invalid price.");
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        throw new Error("User not found.");
    const owned = await prisma_1.default.ownedProperty.findUnique({
        where: { userId_propertyId: { userId: user.id, propertyId } }
    });
    if (!owned)
        throw new Error("You do not own this property.");
    await prisma_1.default.$transaction(async (tx) => {
        // Technically we delete the OwnedProperty record so they can't collect rent or use it while listed.
        // Upon cancellation or buying, a new record is created.
        await tx.ownedProperty.delete({ where: { id: owned.id } });
        await tx.marketListing.create({
            data: {
                guildId,
                sellerId: user.id,
                propertyId,
                amount: 1, // Properties are always 1
                totalPrice
            }
        });
    });
    return { success: true };
}
async function buyItemFromMarket(buyerDiscordId, listingId) {
    if (!listingId.match(/^[0-9a-fA-F]{24}$/))
        throw new Error("Invalid Listing ID format.");
    const listing = await prisma_1.default.marketListing.findUnique({
        where: { id: listingId },
        include: { seller: true, shopItem: true, property: true }
    });
    if (!listing)
        throw new Error("Listing not found or already sold.");
    const buyer = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: buyerDiscordId, guildId: listing.guildId } } });
    if (!buyer)
        throw new Error("Buyer not found.");
    if (buyer.id === listing.sellerId)
        throw new Error("You cannot buy your own listing.");
    const buyerBank = await (0, bankService_1.ensureBankForUser)(buyerDiscordId, listing.guildId);
    if (buyerBank.balance < listing.totalPrice)
        throw new Error(`Insufficient funds. Price: ${listing.totalPrice}`);
    const config = await (0, guildConfigService_1.getGuildConfig)(listing.guildId);
    const taxRate = config.marketTax || 5;
    const taxAmount = Math.floor(listing.totalPrice * (taxRate / 100));
    const sellerPayout = listing.totalPrice - taxAmount;
    let purchasedName = "Unknown Item";
    await prisma_1.default.$transaction(async (tx) => {
        // Transfer Money
        await tx.bank.update({
            where: { id: buyerBank.id },
            data: { balance: { decrement: listing.totalPrice } }
        });
        const sellerBank = await tx.bank.findUnique({ where: { userId: listing.sellerId } });
        if (sellerBank) {
            await tx.bank.update({
                where: { id: sellerBank.id },
                data: { balance: { increment: sellerPayout } }
            });
        }
        else {
            // Should exist, but fail safe
            await tx.bank.create({ data: { userId: listing.sellerId, balance: sellerPayout } });
        }
        // Transfer Asset
        if (listing.shopItemId && listing.shopItem) {
            purchasedName = listing.shopItem.name;
            const existingInv = await tx.inventory.findUnique({
                where: {
                    userId_shopItemId: {
                        userId: buyer.id,
                        shopItemId: listing.shopItemId
                    }
                }
            });
            if (existingInv) {
                await tx.inventory.update({
                    where: { id: existingInv.id },
                    data: { amount: { increment: listing.amount } }
                });
            }
            else {
                await tx.inventory.create({
                    data: {
                        userId: buyer.id,
                        guildId: listing.guildId,
                        shopItemId: listing.shopItemId,
                        amount: listing.amount
                    }
                });
            }
        }
        else if (listing.propertyId && listing.property) {
            purchasedName = listing.property.name;
            const existingProp = await tx.ownedProperty.findUnique({
                where: { userId_propertyId: { userId: buyer.id, propertyId: listing.propertyId } }
            });
            if (existingProp)
                throw new Error("You already own this property.");
            await tx.ownedProperty.create({
                data: {
                    userId: buyer.id,
                    propertyId: listing.propertyId,
                    purchasedPrice: listing.totalPrice,
                    lastCollected: new Date()
                }
            });
        }
        else {
            throw new Error("Invalid listing type.");
        }
        await tx.marketListing.delete({ where: { id: listingId } });
    });
    return {
        success: true,
        item: purchasedName,
        amount: listing.amount,
        price: listing.totalPrice,
        tax: taxAmount
    };
}
async function getMarketListings(guildId, page = 1, pageSize = 5) {
    const skip = (page - 1) * pageSize;
    const [listings, total] = await prisma_1.default.$transaction([
        prisma_1.default.marketListing.findMany({
            where: { guildId },
            include: { shopItem: true, seller: true, property: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize
        }),
        prisma_1.default.marketListing.count({ where: { guildId } })
    ]);
    return { listings, total, totalPages: Math.ceil(total / pageSize) };
}
async function getUserListings(discordId, guildId) {
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        return [];
    return prisma_1.default.marketListing.findMany({
        where: { sellerId: user.id },
        include: { shopItem: true, property: true }
    });
}
async function cancelListing(discordId, listingId) {
    if (!listingId.match(/^[0-9a-fA-F]{24}$/))
        throw new Error("Invalid Listing ID.");
    const listing = await prisma_1.default.marketListing.findUnique({ where: { id: listingId }, include: { shopItem: true, property: true } });
    if (!listing)
        throw new Error("Listing not found.");
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId: listing.guildId } } });
    if (!user || user.id !== listing.sellerId)
        throw new Error("You do not own this listing.");
    await prisma_1.default.$transaction(async (tx) => {
        if (listing.shopItemId) {
            const existingInv = await tx.inventory.findUnique({
                where: { userId_shopItemId: { userId: user.id, shopItemId: listing.shopItemId } }
            });
            if (existingInv) {
                await tx.inventory.update({
                    where: { id: existingInv.id },
                    data: { amount: { increment: listing.amount } }
                });
            }
            else {
                await tx.inventory.create({
                    data: {
                        userId: user.id,
                        guildId: listing.guildId,
                        shopItemId: listing.shopItemId,
                        amount: listing.amount
                    }
                });
            }
        }
        else if (listing.propertyId) {
            await tx.ownedProperty.create({
                data: {
                    userId: user.id,
                    propertyId: listing.propertyId,
                    purchasedPrice: 0,
                    lastCollected: new Date()
                }
            });
        }
        await tx.marketListing.delete({ where: { id: listingId } });
    });
    return { success: true };
}
//# sourceMappingURL=marketService.js.map