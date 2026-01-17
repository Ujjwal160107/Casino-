"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface GameSettings {
    minBet: number;
    maxBet: number;
    cooldown: number; // Seconds
    // Specifics
    rouletteSpinTime?: number;
    cockfightBetTime?: number;
}

export async function getGameSettings(guildId: string, gameKey: string) {
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId },
            select: {
                gameBetLimits: true,
                gameCooldowns: true,
                minBet: true, // Globals as fallback/reference
                maxBet: true,
                rouletteSpinTime: true,
                cockfightBetTime: true
            }
        });

        if (!config) return null;

        const limits = (config.gameBetLimits as any) || {};
        const cooldowns = (config.gameCooldowns as any) || {};

        // Default or specific
        let settings: GameSettings = {
            minBet: limits[gameKey]?.min ?? config.minBet,
            maxBet: limits[gameKey]?.max ?? config.maxBet ?? 100000,
            cooldown: cooldowns[gameKey] ?? 0,
            rouletteSpinTime: gameKey === "roulette" ? config.rouletteSpinTime : undefined,
            cockfightBetTime: gameKey === "cockfight" ? config.cockfightBetTime : undefined
        };

        return { settings, globalmax: config.maxBet, globalmin: config.minBet };
    } catch (error) {
        console.error("Error fetching game settings:", error);
        return null;
    }
}

export async function updateGameSettings(guildId: string, gameKey: string, settings: GameSettings) {
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId },
            select: { gameBetLimits: true, gameCooldowns: true }
        });

        if (!config) return { success: false, error: "Config not found" };

        const currentLimits = (config.gameBetLimits as any) || {};
        const currentCooldowns = (config.gameCooldowns as any) || {};

        // Update specific game
        currentLimits[gameKey] = {
            min: settings.minBet,
            max: settings.maxBet
        };

        currentCooldowns[gameKey] = settings.cooldown;

        const updateData: any = {
            gameBetLimits: currentLimits,
            gameCooldowns: currentCooldowns
        };

        if (gameKey === "roulette" && settings.rouletteSpinTime !== undefined) {
            updateData.rouletteSpinTime = settings.rouletteSpinTime;
        }

        if (gameKey === "cockfight" && settings.cockfightBetTime !== undefined) {
            updateData.cockfightBetTime = settings.cockfightBetTime;
        }

        await prisma.guildConfig.update({
            where: { guildId },
            data: updateData
        });

        revalidatePath(`/dashboard/${guildId}/games/${gameKey}`);
        return { success: true };
    } catch (error) {
        console.error("Error updating game settings:", error);
        return { success: false, error: "Failed to update settings" };
    }
}
