
import prisma from "../utils/prisma";
import { GuildConfig, MarketListing, ShopItem, User, Property } from "@prisma/client";
import { getGuildConfig } from "./guildConfigService";
import { ensureBankForUser } from "./bankService";

// List an ITEM
export async function listItemOnMarket(discordId: string, guildId: string, shopItemId: string, amount: number, totalPrice: number) {
    if (amount <= 0 || totalPrice <= 0) throw new Error("Invalid amount or price.");
    const user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user) throw new Error("User not found.");

    const inventoryItem = await prisma.inventory.findUnique({
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

    await prisma.$transaction(async (tx) => {
        if (inventoryItem.amount === amount) {
            await tx.inventory.delete({ where: { id: inventoryItem.id } });
        } else {
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
export async function listPropertyOnMarket(discordId: string, guildId: string, propertyId: string, totalPrice: number) {
    if (totalPrice <= 0) throw new Error("Invalid price.");
    const user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user) throw new Error("User not found.");

    const owned = await prisma.ownedProperty.findUnique({
        where: { userId_propertyId: { userId: user.id, propertyId } }
    });

    if (!owned) throw new Error("You do not own this property.");

    await prisma.$transaction(async (tx) => {
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

export async function buyItemFromMarket(buyerDiscordId: string, listingId: string) {
    if (!listingId.match(/^[0-9a-fA-F]{24}$/)) throw new Error("Invalid Listing ID format.");
    const listing = await prisma.marketListing.findUnique({
        where: { id: listingId },
        include: { seller: true, shopItem: true, property: true }
    });

    if (!listing) throw new Error("Listing not found or already sold.");
    const buyer = await prisma.user.findUnique({ where: { discordId_guildId: { discordId: buyerDiscordId, guildId: listing.guildId } } });
    if (!buyer) throw new Error("Buyer not found.");
    if (buyer.id === listing.sellerId) throw new Error("You cannot buy your own listing.");

    const buyerBank = await ensureBankForUser(buyerDiscordId, listing.guildId);
    if (buyerBank.balance < listing.totalPrice) throw new Error(`Insufficient funds. Price: ${listing.totalPrice}`);

    const config = await getGuildConfig(listing.guildId);
    const taxRate = config.marketTax || 5;
    const taxAmount = Math.floor(listing.totalPrice * (taxRate / 100));
    const sellerPayout = listing.totalPrice - taxAmount;

    let purchasedName = "Unknown Item";

    await prisma.$transaction(async (tx) => {
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
        } else {
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
            } else {
                await tx.inventory.create({
                    data: {
                        userId: buyer.id,
                        guildId: listing.guildId,
                        shopItemId: listing.shopItemId,
                        amount: listing.amount
                    }
                });
            }
        } else if (listing.propertyId && listing.property) {
            purchasedName = listing.property.name;
            const existingProp = await tx.ownedProperty.findUnique({
                where: { userId_propertyId: { userId: buyer.id, propertyId: listing.propertyId } }
            });
            if (existingProp) throw new Error("You already own this property.");

            await tx.ownedProperty.create({
                data: {
                    userId: buyer.id,
                    propertyId: listing.propertyId,
                    purchasedPrice: listing.totalPrice,
                    lastCollected: new Date()
                }
            });

        } else {
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

export async function getMarketListings(guildId: string, page: number = 1, pageSize: number = 5) {
    const skip = (page - 1) * pageSize;
    const [listings, total] = await prisma.$transaction([
        prisma.marketListing.findMany({
            where: { guildId },
            include: { shopItem: true, seller: true, property: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize
        }),
        prisma.marketListing.count({ where: { guildId } })
    ]);
    return { listings, total, totalPages: Math.ceil(total / pageSize) };
}

export async function getUserListings(discordId: string, guildId: string) {
    const user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user) return [];
    return prisma.marketListing.findMany({
        where: { sellerId: user.id },
        include: { shopItem: true, property: true }
    });
}

export async function cancelListing(discordId: string, listingId: string) {
    if (!listingId.match(/^[0-9a-fA-F]{24}$/)) throw new Error("Invalid Listing ID.");
    const listing = await prisma.marketListing.findUnique({ where: { id: listingId }, include: { shopItem: true, property: true } });
    if (!listing) throw new Error("Listing not found.");

    const user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId: listing.guildId } } });
    if (!user || user.id !== listing.sellerId) throw new Error("You do not own this listing.");

    await prisma.$transaction(async (tx) => {
        if (listing.shopItemId) {
            const existingInv = await tx.inventory.findUnique({
                where: { userId_shopItemId: { userId: user.id, shopItemId: listing.shopItemId } }
            });
            if (existingInv) {
                await tx.inventory.update({
                    where: { id: existingInv.id },
                    data: { amount: { increment: listing.amount } }
                });
            } else {
                await tx.inventory.create({
                    data: {
                        userId: user.id,
                        guildId: listing.guildId,
                        shopItemId: listing.shopItemId!,
                        amount: listing.amount
                    }
                });
            }
        } else if (listing.propertyId) {
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