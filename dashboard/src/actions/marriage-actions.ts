"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";

export async function getMarriageConfig(guildId: string) {
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId },
            select: {
                marriageEnabled: true,
                marriageCost: true,
                divorceCost: true,
                marriageCooldown: true,
                currencyEmoji: true // For display
            }
        });

        return config || {
            marriageEnabled: true,
            marriageCost: 0,
            divorceCost: 0,
            marriageCooldown: 0,
            currencyEmoji: "🪙"
        };
    } catch (error) {
        console.error("Failed to fetch marriage config:", error);
        throw new Error("Failed to fetch marriage configuration");
    }
}

export async function updateMarriageConfig(guildId: string, data: {
    marriageEnabled: boolean;
    marriageCost: number;
    divorceCost: number;
    marriageCooldown: number;
}) {
    try {
        if (data.marriageCost < 0) throw new Error("Marriage cost cannot be negative");
        if (data.divorceCost < 0) throw new Error("Divorce cost cannot be negative");
        if (data.marriageCooldown < 0) throw new Error("Cooldown cannot be negative");

        await prisma.guildConfig.upsert({
            where: { guildId },
            update: {
                marriageEnabled: data.marriageEnabled,
                marriageCost: data.marriageCost,
                divorceCost: data.divorceCost,
                marriageCooldown: data.marriageCooldown
            },
            create: {
                guildId,
                marriageEnabled: data.marriageEnabled,
                marriageCost: data.marriageCost,
                divorceCost: data.divorceCost,
                marriageCooldown: data.marriageCooldown
            }
        });

        // Invalidate Bot Cache
        try {
            await redis.del(`guild_config:${guildId}`);
        } catch (e) {
            console.warn("Failed to invalidate redis cache:", e);
        }

        revalidatePath(`/dashboard/${guildId}/marriage`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update marriage config:", error);
        return { success: false, error: "Failed to update settings" };
    }
}
