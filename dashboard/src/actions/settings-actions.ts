"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getGeneralSettings(guildId: string) {
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId },
            select: {
                prefix: true,
                startMoney: true,
                currencyName: true,
                currencyEmoji: true,
            }
        });

        // Default values if not found (though getGuildConfig usually creates one)
        return config || {
            prefix: "!",
            startMoney: 1000,
            currencyName: "Coins",
            currencyEmoji: "🪙"
        };
    } catch (error) {
        console.error("Failed to fetch general settings:", error);
        throw new Error("Failed to fetch settings");
    }
}

export async function updateGeneralSettings(guildId: string, data: {
    prefix: string;
    startMoney: number;
    currencyName: string;
    currencyEmoji: string;
}) {
    try {
        // Basic validation
        if (data.prefix.length > 5) throw new Error("Prefix too long");
        if (data.startMoney < 0) throw new Error("Starting money cannot be negative");
        if (data.currencyName.length > 32) throw new Error("Currency name too long");

        await prisma.guildConfig.upsert({
            where: { guildId },
            update: {
                prefix: data.prefix,
                startMoney: data.startMoney,
                currencyName: data.currencyName,
                currencyEmoji: data.currencyEmoji,
            },
            create: {
                guildId,
                prefix: data.prefix,
                startMoney: data.startMoney,
                currencyName: data.currencyName,
                currencyEmoji: data.currencyEmoji,
            }
        });

        revalidatePath(`/dashboard/${guildId}`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update general settings:", error);
        return { success: false, error: "Failed to update settings" };
    }
}
