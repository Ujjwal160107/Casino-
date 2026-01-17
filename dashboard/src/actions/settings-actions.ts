"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

import { redis } from "@/lib/redis";

export async function getGeneralSettings(guildId: string) {
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId },
            select: {
                prefix: true,
                startMoney: true,
                currencyName: true,
                currencyEmoji: true,
                chatMoneyEnabled: true,
                walletLimit: true,
                bankLimit: true,
                dropExpiration: true,
            }
        });

        // Default values if not found (though getGuildConfig usually creates one)
        return config || {
            prefix: "!",
            startMoney: 1000,
            currencyName: "Coins",
            currencyEmoji: "🪙",
            chatMoneyEnabled: false,
            walletLimit: null,
            bankLimit: null,
            dropExpiration: 60
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
    chatMoneyEnabled: boolean;
    walletLimit: number | null;
    bankLimit: number | null;
    dropExpiration?: number;
}) {
    try {
        // Basic validation
        if (data.prefix.length > 5) throw new Error("Prefix too long");
        if (data.startMoney < 0) throw new Error("Starting money cannot be negative");
        if (data.currencyName.length > 32) throw new Error("Currency name too long");

        console.log(`[Dashboard] Updating settings for ${guildId}. New Prefix: "${data.prefix}"`); // DEBUG LOG

        await prisma.guildConfig.upsert({
            where: { guildId },
            update: {
                prefix: data.prefix,
                startMoney: data.startMoney,
                currencyName: data.currencyName,
                currencyEmoji: data.currencyEmoji,
                chatMoneyEnabled: data.chatMoneyEnabled,
                walletLimit: data.walletLimit,
                bankLimit: data.bankLimit,
                dropExpiration: data.dropExpiration,
            },
            create: {
                guildId,
                prefix: data.prefix,
                startMoney: data.startMoney,
                currencyName: data.currencyName,
                currencyEmoji: data.currencyEmoji,
                chatMoneyEnabled: data.chatMoneyEnabled,
                walletLimit: data.walletLimit,
                bankLimit: data.bankLimit,
                dropExpiration: data.dropExpiration ?? 60,
            }
        });

        // Invalidate Bot Cache
        console.log(`[Dashboard] Invalidating cache for guild: ${guildId}`);
        await redis.del(`guild_config:${guildId}`);
        console.log(`[Dashboard] Cache invalidated.`);

        revalidatePath(`/dashboard/${guildId}`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update general settings:", error);
        return { success: false, error: "Failed to update settings" };
    }


}


export async function resetEconomy(guildId: string) {
    try {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        const startMoney = config?.startMoney ?? 1000;

        await prisma.$transaction([
            // Delete related data first
            prisma.inventory.deleteMany({ where: { guildId } }),
            prisma.transaction.deleteMany({ where: { wallet: { user: { guildId } } } }),
            prisma.bank.deleteMany({ where: { user: { guildId } } }),
            prisma.loan.deleteMany({ where: { user: { guildId } } }),
            prisma.investment.deleteMany({ where: { user: { guildId } } }),
            prisma.marketListing.deleteMany({ where: { guildId } }),
            prisma.ownedProperty.deleteMany({ where: { user: { guildId } } }),
            prisma.portfolio.deleteMany({ where: { user: { guildId } } }),
            prisma.bet.deleteMany({ where: { user: { guildId } } }),
            prisma.workLog.deleteMany({ where: { guildId } }),
            prisma.dailyQuest.deleteMany({ where: { guildId } }),
            prisma.activeEffect.deleteMany({ where: { guildId } }),

            // Reset Wallets
            prisma.wallet.updateMany({
                where: { user: { guildId } },
                data: { balance: startMoney }
            }),

            // Reset User Stats
            prisma.user.updateMany({
                where: { guildId },
                data: {
                    xp: 0,
                    level: 0,
                    creditScore: 500,
                    jobId: null,
                    jobXp: 0,
                    jobStress: 0,
                    shiftsWorked: 0
                }
            })
        ]);

        return { success: true };
    } catch (error) {
        console.error("Failed to reset economy:", error);
        return { success: false, error: "Failed to reset economy system." };
    }
}
