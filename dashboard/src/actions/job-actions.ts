"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";

export interface JobSettingsData {
    jobCooldown: number;
    jobSectorBasePay: Record<string, number>;
    jobRelaxControllers: Record<string, number>;
    jobXpReqs: Record<string, number>;
    jobShiftReqs: Record<string, number>;
    defaultSectorPay: Record<string, number>; // New field for UI defaults
}

// Hardcoded defaults from jobService to avoid direct import issues if any
// Ideally we share a constants file, but for now this is safe
const DEFAULT_SECTOR_PAY: Record<string, number> = {
    "tech": 1500,
    "medical": 2000,
    "business": 1800,
    "legal": 2200,
    "service": 1200,
    "trade": 1600,
    "freelance": 1000
};

export async function getJobSettings(guildId: string) {
    try {
        const config = await prisma.guildConfig.findUnique({
            where: { guildId },
            select: {
                jobCooldown: true,
                jobSectorBasePay: true,
                jobRelaxControllers: true,
                jobXpReqs: true,
                jobShiftReqs: true,
            }
        });

        if (!config) return null;

        // Ensure JSON objects are returned as expected types (Prisma returns basic types)
        return {
            jobCooldown: config.jobCooldown ?? 3600,
            jobSectorBasePay: (config.jobSectorBasePay as Record<string, number>) || {},
            jobRelaxControllers: (config.jobRelaxControllers as Record<string, number>) || {},
            jobXpReqs: (config.jobXpReqs as Record<string, number>) || {},
            jobShiftReqs: (config.jobShiftReqs as Record<string, number>) || {},
            defaultSectorPay: DEFAULT_SECTOR_PAY
        };
    } catch (error) {
        console.error("Failed to fetch job settings:", error);
        throw new Error("Failed to fetch job settings");
    }
}

export async function updateJobSettings(guildId: string, data: JobSettingsData) {
    try {
        // Validation
        if (data.jobCooldown < 0) throw new Error("Cooldown cannot be negative");

        // Ensure values are numbers
        const cleanBasePay: Record<string, number> = {};
        for (const [k, v] of Object.entries(data.jobSectorBasePay)) {
            const num = parseInt(String(v));
            if (!isNaN(num) && num >= 0) cleanBasePay[k] = num;
        }

        const cleanRelax: Record<string, number> = {};
        for (const [k, v] of Object.entries(data.jobRelaxControllers)) {
            const num = parseInt(String(v));
            if (!isNaN(num) && num >= 0) cleanRelax[k] = num;
        }

        const cleanXp: Record<string, number> = {};
        for (const [k, v] of Object.entries(data.jobXpReqs)) {
            const num = parseInt(String(v));
            if (!isNaN(num) && num >= 0) cleanXp[k] = num;
        }

        const cleanShifts: Record<string, number> = {};
        for (const [k, v] of Object.entries(data.jobShiftReqs)) {
            const num = parseInt(String(v));
            if (!isNaN(num) && num >= 0) cleanShifts[k] = num;
        }

        await prisma.guildConfig.upsert({
            where: { guildId },
            create: {
                guildId,
                jobCooldown: parseInt(String(data.jobCooldown)),
                jobSectorBasePay: cleanBasePay,
                jobRelaxControllers: cleanRelax,
                jobXpReqs: cleanXp,
                jobShiftReqs: cleanShifts
            },
            update: {
                jobCooldown: parseInt(String(data.jobCooldown)),
                jobSectorBasePay: cleanBasePay,
                jobRelaxControllers: cleanRelax,
                jobXpReqs: cleanXp,
                jobShiftReqs: cleanShifts
            }
        });

        // Invalidate Bot Cache
        console.log(`[Dashboard] Invalidating cache for guild: ${guildId}`);
        await redis.del(`guild_config:${guildId}`);
        console.log(`[Dashboard] Cache invalidated.`);

        revalidatePath(`/dashboard/${guildId}/life-economy/job`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to update job settings:", error);
        return { success: false, error: error.message || "Failed to update settings" };
    }
}
