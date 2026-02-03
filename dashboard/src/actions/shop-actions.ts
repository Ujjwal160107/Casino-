"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getShopItems(guildId: string) {
    try {
        const items = await prisma.shopItem.findMany({
            where: {
                guildId,
                category: { notIn: ["JOBS", "EDUCATION"] }
            },
            orderBy: { createdAt: "desc" }
        });
        return items;
    } catch (error) {
        console.error("Failed to fetch shop items:", error);
        return [];
    }
}

export async function upsertShopItem(guildId: string, data: any) {
    try {
        // Validate basic fields
        if (!data.name || !data.price) {
            return { success: false, error: "Name and Price are required." };
        }

        const payload = {
            guildId,
            name: data.name.trim(),
            description: data.description || "No description",
            price: data.price,
            stock: data.stock ?? -1,
            image: data.image || null,
            emoji: data.emoji || null,
            expiresIn: data.expiresIn || null,
            usable: data.usable ?? false,
            consumable: data.usable ?? false, // Sync consumable with usable for now as per user request to ensure deletion
            showInInventory: data.showInInventory ?? true,
            requirements: data.requirements || {},
            onBuyActions: data.onBuyActions || [],
            // Defaults or mappings for legacy fields if needed
            itemType: data.itemType || "COLLECTIBLE",
            category: data.category || "GENERAL",
            effects: data.effects || [],
        };

        let actionType = "CREATE_SHOP_ITEM";
        if (data.id && data.id !== "new") {
            actionType = "UPDATE_SHOP_ITEM";
            await prisma.shopItem.update({
                where: { id: data.id },
                data: payload
            });
        } else {
            // Check limit (35 items)
            const count = await prisma.shopItem.count({ where: { guildId } });
            if (count >= 35) {
                return { success: false, error: "Shop item limit reached (35 items)." };
            }

            await prisma.shopItem.create({
                data: payload
            });
        }

        const session = await getServerSession(authOptions);
        if (session?.user?.id) {
            await createAuditLog(guildId, session.user.id, actionType, {
                itemId: data.id !== "new" ? data.id : null,
                name: payload.name,
                price: payload.price
            });
        }

        revalidatePath(`/dashboard/${guildId}/shop-misc/shop`);
        return { success: true };
    } catch (error) {
        console.error("Failed to upsert shop item:", error);
        return { success: false, error: "Failed to save item." };
    }
}

export async function deleteShopItem(id: string, guildId: string) {
    try {
        await prisma.shopItem.delete({
            where: { id, guildId } // Ensure guildId matches for security
        });

        const session = await getServerSession(authOptions);
        if (session?.user?.id) {
            await createAuditLog(guildId, session.user.id, "DELETE_SHOP_ITEM", {
                itemId: id
            });
        }
        revalidatePath(`/dashboard/${guildId}/shop-misc/shop`);
        return { success: true };
    } catch (error) {
        console.error("Failed to delete shop item:", error);
        return { success: false, error: "Failed to delete item." };
    }
}
