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
            gymCost: config?.gymCost ?? 500,
            meditationCost: config?.meditationCost ?? 250,
            sportsCost: config?.sportsCost ?? 750
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
}) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: { ...data }
        });
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
