import { ensureUserAndWallet } from "../../services/walletService";
import prisma from "../../utils/prisma";

// Helper to resolve or create user
async function resolveUser(discordId: string, guildId: string, username: string = "Unknown User") {
    return await ensureUserAndWallet(discordId, guildId, username);
}

// NOTE: We update the signature to accept optional username, but for backward compatibility primarily use resolveUser wrapper
export async function getMarriage(discordId: string, guildId: string) {
    // For getMarriage, we just want to find. If they don't exist, they aren't married.
    // So distinct logic: only READ.
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } }
    });
    if (!user) return null;

    // Check if user is spouse1 or spouse2
    const marriage = await prisma.marriage.findFirst({
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

export async function isMarried(discordId: string, guildId: string): Promise<boolean> {
    const marriage = await getMarriage(discordId, guildId);
    return !!marriage;
}

export async function marry(discordId1: string, username1: string, discordId2: string, username2: string, guildId: string) {
    const user1 = await resolveUser(discordId1, guildId, username1);
    const user2 = await resolveUser(discordId2, guildId, username2);

    if (!user1 || !user2) throw new Error("One or both users not found.");

    // Double check if either is married using INTERNAL IDs
    // We can reuse getMarriage with internal ID logic if we refactor, but here we can just query directly or call isMarried with discordIds (which repeats resolution). 
    // Optimization: query directly since we have user1.id and user2.id

    // Check spouse 1
    const m1 = await prisma.marriage.findFirst({
        where: { OR: [{ spouse1Id: user1.id }, { spouse2Id: user1.id }] }
    });
    if (m1) throw new Error("You are already married!");

    // Check spouse 2
    const m2 = await prisma.marriage.findFirst({
        where: { OR: [{ spouse1Id: user2.id }, { spouse2Id: user2.id }] }
    });
    if (m2) throw new Error("Partner is already married!");

    // Create marriage
    return await prisma.marriage.create({
        data: {
            spouse1Id: user1.id,
            spouse2Id: user2.id,
        }
    });
}

export async function divorce(discordId: string, guildId: string) {
    const marriage = await getMarriage(discordId, guildId);
    if (!marriage) {
        throw new Error("You are not married!");
    }

    return await prisma.marriage.delete({
        where: { id: marriage.id }
    });
}

export async function checkHasRing(discordId: string, guildId: string): Promise<boolean> {
    const user = await resolveUser(discordId, guildId);
    if (!user) return false;

    const inventoryItem = await prisma.inventory.findFirst({
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

export async function consumeRing(discordId: string, guildId: string) {
    const user = await resolveUser(discordId, guildId);
    if (!user) return false;

    const inventoryItem = await prisma.inventory.findFirst({
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

    if (!inventoryItem) return false;

    if (inventoryItem.amount > 1) {
        await prisma.inventory.update({
            where: { id: inventoryItem.id },
            data: { amount: { decrement: 1 } }
        });
    } else {
        await prisma.inventory.delete({
            where: { id: inventoryItem.id }
        });
    }
    return true;
}
