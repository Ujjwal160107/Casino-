"use server";


import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { invalidateGuildConfig } from "@/lib/cache";

export async function getAdminData(guildId: string) {
    try {
        const [config, permissions, stocks, casinoAdmins] = await Promise.all([
            prisma.guildConfig.findUnique({ where: { guildId } }),
            prisma.commandPermission.findMany({ where: { guildId }, orderBy: { id: 'desc' } }),
            prisma.stock.findMany({ where: { guildId } }),
            prisma.user.findMany({ where: { guildId, isCasinoAdmin: true }, select: { discordId: true, username: true } })
        ]);

        return {
            config: config || { disabledCommands: [], casinoChannels: [], stockRefreshRate: 600, maxBet: 100000, minBet: 100 },
            permissions,
            stocks,
            casinoAdmins
        };
    } catch (error) {
        console.error("Failed to fetch admin data:", error);
        throw new Error("Failed to fetch admin data");
    }
}

export async function updateDisabledCommands(guildId: string, disabledCommands: string[]) {
    try {
        await prisma.guildConfig.upsert({
            where: { guildId },
            update: { disabledCommands },
            create: { guildId, disabledCommands }
        });
        await invalidateGuildConfig(guildId);
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update disabled commands" };
    }
}

export async function updateCasinoChannels(guildId: string, casinoChannels: string[]) {
    try {
        await prisma.guildConfig.upsert({
            where: { guildId },
            update: { casinoChannels },
            create: { guildId, casinoChannels }
        });
        await invalidateGuildConfig(guildId);
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update casino channels" };
    }
}

export async function addPermission(guildId: string, command: string, targetType: string, targetId: string, action: string) {
    try {
        await prisma.commandPermission.upsert({
            where: { guildId_command_targetType_targetId: { guildId, command, targetType, targetId } },
            update: { action },
            create: { guildId, command, targetType, targetId, action }
        });
        // Permissions are checked live against DB usually, but some caching might exist.
        // If permissionService uses guildConfig (it does for disabledCommands/channels), we invalidate that.
        // Ideally permissions themselves might need invalidation if cached.
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to add permission" };
    }
}

export async function removePermission(permissionId: string) {
    try {
        await prisma.commandPermission.delete({ where: { id: permissionId } });
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to remove permission" };
    }
}

export async function createStock(guildId: string, symbol: string, name: string, price: number, volatility: number) {
    try {
        await prisma.stock.create({
            data: {
                guildId,
                symbol: symbol.toUpperCase(),
                name,
                currentPrice: price,
                basePrice: price,
                volatility
            }
        });
        // Stocks are fetched via DB in stockService currently, or bulk updated.
        // If we add stock caching later, we need to invalidate here.
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to create stock" };
    }
}

export async function updateStock(guildId: string, stockId: string, price: number, volatility: number) {
    try {
        await prisma.stock.update({
            where: { id: stockId },
            data: { currentPrice: price, volatility }
        });
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update stock" };
    }
}

export async function deleteStock(guildId: string, stockId: string) {
    try {
        await prisma.stock.delete({ where: { id: stockId } });
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to delete stock" };
    }
}

export async function updateStockRefreshRate(guildId: string, seconds: number) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: { stockRefreshRate: seconds }
        });
        await invalidateGuildConfig(guildId);
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update refresh rate" };
    }
}

export async function updateChatMoneyConfig(guildId: string, data: {
    min: number;
    max: number;
    interval: number;
    channels: string[];
}) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: {
                chatMoneyMin: data.min,
                chatMoneyMax: data.max,
                chatMoneyInterval: data.interval,
                chatMoneyChannels: data.channels,
            }
        });
        await invalidateGuildConfig(guildId);
        revalidatePath(`/dashboard/${guildId}/general-economy/config`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update chat money config:", error);
        return { success: false, error: "Failed to update chat money settings" };
    }
}

export async function factoryResetGuild(guildId: string) {
    const { performFactoryReset } = await import("@/lib/cleanup");
    const result = await performFactoryReset(guildId);

    if (result.success) {
        revalidatePath(`/dashboard/${guildId}`);
    }

    return result;
}

export async function getCasinoAdmins(guildId: string) {
    try {
        const admins = await prisma.user.findMany({
            where: { guildId, isCasinoAdmin: true },
            select: { discordId: true, username: true }
        });
        return { success: true, admins };
    } catch (error) {
        return { success: false, error: "Failed to fetch casino admins" };
    }
}

export async function addCasinoAdmin(guildId: string, discordId: string) {
    try {
        // Ensure user exists first
        await prisma.user.upsert({
            where: { discordId_guildId: { discordId, guildId } },
            update: { isCasinoAdmin: true },
            create: {
                discordId,
                guildId,
                username: "Unknown", // Will be updated on first interaction or we rely on ID
                isCasinoAdmin: true,
                wallet: { create: {} },
                bank: { create: {} }
            }
        });
        revalidatePath(`/dashboard/${guildId}/moderation`);
        return { success: true };
    } catch (error) {
        console.error(error);
        return { success: false, error: "Failed to add casino admin" };
    }
}

export async function removeCasinoAdmin(guildId: string, discordId: string) {
    try {
        await prisma.user.update({
            where: { discordId_guildId: { discordId, guildId } },
            data: { isCasinoAdmin: false }
        });
        revalidatePath(`/dashboard/${guildId}/moderation`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to remove casino admin" };
    }
}
