"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface PropertyData {
    id?: string;
    key: string;
    name: string;
    description: string;
    basePrice: number;
    incomePerCycle: number;
    incomeCycleHours: number;
    maxPerUser: number;
    isPublic: boolean;
    imageUrl?: string | null;
}

export async function getProperties(guildId: string) {
    try {
        const properties = await prisma.property.findMany({
            where: { guildId },
            orderBy: { basePrice: 'asc' }
        });

        return properties.map(p => ({
            id: p.id,
            key: p.key,
            name: p.name,
            description: p.description,
            basePrice: p.basePrice,
            incomePerCycle: p.incomePerCycle,
            incomeCycleHours: p.incomeCycleHours,
            maxPerUser: p.maxPerUser,
            isPublic: p.isPublic,
            imageUrl: p.imageUrl
        }));
    } catch (error) {
        console.error("Failed to fetch properties:", error);
        return [];
    }
}

export async function upsertProperty(guildId: string, data: PropertyData) {
    try {
        if (!data.key || !data.name || data.basePrice < 0) {
            return { success: false, error: "Invalid data. Name, Key, and positive Price are required." };
        }

        // Auto-generate key from name if not provided (though UI should force it or auto-slugify)
        const key = data.key || data.name.toLowerCase().replace(/[^a-z0-9]/g, "_");

        if (data.id) {
            // Update
            await prisma.property.update({
                where: { id: data.id },
                data: {
                    name: data.name,
                    description: data.description,
                    basePrice: data.basePrice,
                    price: data.basePrice, // Reset current price to base on edit? Or keep it? Usually base change implies reset.
                    incomePerCycle: data.incomePerCycle,
                    incomeCycleHours: data.incomeCycleHours,
                    maxPerUser: data.maxPerUser,
                    isPublic: data.isPublic,
                    imageUrl: data.imageUrl || null
                }
            });
        } else {
            // Create
            // Check for duplicate key in guild
            const existing = await prisma.property.findUnique({
                where: { guildId_key: { guildId, key } }
            });

            if (existing) {
                return { success: false, error: "A property with this ID (key) already exists." };
            }

            await prisma.property.create({
                data: {
                    guildId,
                    key,
                    name: data.name,
                    description: data.description || "No description",
                    basePrice: data.basePrice,
                    price: data.basePrice,
                    incomePerCycle: data.incomePerCycle,
                    incomeCycleHours: data.incomeCycleHours,
                    maxPerUser: data.maxPerUser,
                    isPublic: data.isPublic,
                    imageUrl: data.imageUrl || null
                }
            });
        }

        revalidatePath(`/dashboard/${guildId}/life-economy/property`);
        return { success: true };
    } catch (error) {
        console.error("Failed to upsert property:", error);
        return { success: false, error: "Database error occurred." };
    }
}

export async function deleteProperty(guildId: string, propertyId: string) {
    try {
        // We probably need to check for owners first?
        // Cascading deletes on OwnedProperties might happen if configured, but let's check schema.
        // Schema doesn't specify cascade on OwnedProperty relation.
        // We should manually clean up or rely on global cleanup.
        // For now, let's delete owned records first to be safe.

        await prisma.ownedProperty.deleteMany({
            where: { propertyId }
        });

        await prisma.marketListing.deleteMany({
            where: { propertyId }
        });

        await prisma.property.delete({
            where: { id: propertyId }
        });

        revalidatePath(`/dashboard/${guildId}/life-economy/property`);
        return { success: true };
    } catch (error) {
        console.error("Failed to delete property:", error);
        return { success: false, error: "Failed to delete property." };
    }
}
