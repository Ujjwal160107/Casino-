"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getEducationSettings(guildId: string) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    let degrees = await prisma.degree.findMany({
        where: { guildId },
        orderBy: { minIntelligence: "asc" }
    });

    if (degrees.length === 0) {
        await seedDefaultDegrees(guildId);
        degrees = await prisma.degree.findMany({
            where: { guildId },
            orderBy: { minIntelligence: "asc" }
        });
    }

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

async function seedDefaultDegrees(guildId: string) {
    // 1. High School (Foundation)
    let hs = await prisma.degree.findFirst({ where: { guildId, name: "High School Diploma" } });

    if (hs) {
        // Enforce the new scale on existing record
        hs = await prisma.degree.update({
            where: { id: hs.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, type: "HS", totalSemesters: 1 }
        });
    } else {
        hs = await prisma.degree.create({
            data: { guildId, name: "High School Diploma", type: "HS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 0, intelligenceBoost: 1 }
        });
    }

    // 2. Community College
    let trade = await prisma.degree.findFirst({ where: { guildId, name: "Trade License (Plumbing)" } });
    if (trade) {
        await prisma.degree.update({
            where: { id: trade.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, minIntelligence: 2, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "Trade License (Plumbing)", type: "TRADE", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 500, intelligenceBoost: 1, incomeMulti: 0.2, minIntelligence: 2, requiredDegreeId: hs!.id }
        });
    }

    // 3. Bachelors (CS)
    let bsCS = await prisma.degree.findFirst({ where: { guildId, name: "BS Computer Science" } });
    if (bsCS) {
        bsCS = await prisma.degree.update({
            where: { id: bsCS.id },
            data: { passGpa: 6.0, intelligenceBoost: 2, minIntelligence: 5, totalSemesters: 1 }
        });
    } else {
        bsCS = await prisma.degree.create({
            data: { guildId, name: "BS Computer Science", type: "BACHELORS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 5000, intelligenceBoost: 2, incomeMulti: 0.5, minIntelligence: 5, requiredDegreeId: hs!.id }
        });
    }

    // Bachelors (Arts)
    let baArts = await prisma.degree.findFirst({ where: { guildId, name: "BA Fine Arts" } });
    if (baArts) {
        await prisma.degree.update({
            where: { id: baArts.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, minIntelligence: 4, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "BA Fine Arts", type: "BACHELORS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 4000, intelligenceBoost: 1, incomeMulti: 0.3, minIntelligence: 4, requiredDegreeId: hs!.id }
        });
    }

    // 5. MBBS (New)
    let mbbs = await prisma.degree.findFirst({ where: { guildId, name: "MBBS" } });
    if (mbbs) {
        mbbs = await prisma.degree.update({
            where: { id: mbbs.id },
            data: { passGpa: 6.0, intelligenceBoost: 3, minIntelligence: 6, incomeMulti: 1.5, totalSemesters: 1 }
        });
    } else {
        mbbs = await prisma.degree.create({
            data: { guildId, name: "MBBS", type: "MBBS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 8000, intelligenceBoost: 3, incomeMulti: 1.5, minIntelligence: 6, requiredDegreeId: hs!.id }
        });
    }

    // 6. Med School (MD)
    const md = await prisma.degree.findFirst({ where: { guildId, name: "Doctor of Medicine (MD)" } });
    if (md) {
        await prisma.degree.update({
            where: { id: md.id },
            data: { passGpa: 6.0, intelligenceBoost: 5, minIntelligence: 8, requiredDegreeId: mbbs.id, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "Doctor of Medicine (MD)", type: "MD", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 15000, intelligenceBoost: 5, incomeMulti: 2.5, minIntelligence: 8, requiredDegreeId: mbbs.id }
        });
    }

    // 7. Law (LLB)
    let llb = await prisma.degree.findFirst({ where: { guildId, name: "Bachelor of Laws (LLB)" } });
    if (llb) {
        llb = await prisma.degree.update({
            where: { id: llb.id },
            data: { passGpa: 6.0, intelligenceBoost: 3, minIntelligence: 6, incomeMulti: 1.5, totalSemesters: 1 }
        });
    } else {
        llb = await prisma.degree.create({
            data: { guildId, name: "Bachelor of Laws (LLB)", type: "LLB", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 8000, intelligenceBoost: 3, incomeMulti: 1.5, minIntelligence: 6, requiredDegreeId: hs!.id }
        });
    }

    // 8. Law (LLM)
    const llm = await prisma.degree.findFirst({ where: { guildId, name: "Master of Laws (LLM)" } });
    if (llm) {
        await prisma.degree.update({
            where: { id: llm.id },
            data: { passGpa: 6.0, intelligenceBoost: 5, minIntelligence: 8, requiredDegreeId: llb.id, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "Master of Laws (LLM)", type: "LLM", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 15000, intelligenceBoost: 5, incomeMulti: 2.5, minIntelligence: 8, requiredDegreeId: llb.id }
        });
    }
}
