"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getEducationSettings(guildId: string) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const degrees = await prisma.degree.findMany({
        where: { guildId },
        orderBy: { minIntelligence: "asc" }
    });

    return {
        config: {
            studyCooldown: config?.studyCooldown ?? 300,

            // Job Stress Costs (Legacy support, maybe display them?)
            gymCost: config?.gymCost ?? 500,
            meditationCost: config?.meditationCost ?? 250,
            sportsCost: config?.sportsCost ?? 750,

            // Education Stress Costs (New)
            eduGymCost: config?.eduGymCost ?? 50,
            eduMeditationCost: config?.eduMeditationCost ?? 25,
            eduSportsCost: config?.eduSportsCost ?? 75
        },
        degrees: degrees.map(d => ({
            id: d.id,
            name: d.name,
            tuitionPerSem: d.tuitionPerSem
        }))
    };
}

export async function updateEducationConfig(guildId: string, data: {
    studyCooldown: number;
    gymCost: number;
    meditationCost: number;
    sportsCost: number;
    eduGymCost: number;
    eduMeditationCost: number;
    eduSportsCost: number;
}) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: {
                studyCooldown: data.studyCooldown,
                // Job Costs
                gymCost: data.gymCost,
                meditationCost: data.meditationCost,
                sportsCost: data.sportsCost,
                // Edu Costs
                eduGymCost: data.eduGymCost,
                eduMeditationCost: data.eduMeditationCost,
                eduSportsCost: data.eduSportsCost
            }
        });

        // Invalidate Bot Cache
        try {
            const { redis } = require("@/lib/redis");
            await redis.del(`guild_config:${guildId}`);
        } catch (e) {
            console.warn("Failed to invalidate redis cache:", e);
        }

        revalidatePath(`/dashboard/${guildId}/education`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update education config:", error);
        return { success: false, error: "Failed to update settings" };
    }
}

export async function updateDegreeTuition(guildId: string, degreeId: string, tuition: number) {
    try {
        await prisma.degree.update({
            where: { id: degreeId },
            data: { tuitionPerSem: tuition }
        });
        revalidatePath(`/dashboard/${guildId}/education`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update degree tuition:", error);
        return { success: false, error: "Failed to update degree tuition" };
    }
}
