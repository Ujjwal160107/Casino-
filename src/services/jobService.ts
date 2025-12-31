import { Mascot } from "../config/branding";

import prisma from "../utils/prisma";

export interface JobDefinition {
    id: string;
    title: string;
    sector: "tech" | "medical" | "business" | "legal" | "service" | "trade" | "freelance";
    emoji: string;
    pay: number;
    reqDegrees: string[]; // List of degree names required
    reqJobId?: string; // ID of prerequisite job (e.g., must be Resident before Surgeon)
    reqXp?: number; // Min jobXp required to hold/promote to this job
    level: "Intern" | "Junior" | "Senior" | "Lead" | "Executive" | "Freelance";
}

// Grouped by Sector for easiest display
export const JOBS: JobDefinition[] = [
    // --- TECH (Computer Science) ---
    { id: "tech_intern", title: "IT Intern", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 1500, reqDegrees: ["High School Diploma"], level: "Intern", reqXp: 0 },
    { id: "tech_junior", title: "Junior Developer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 3000, reqDegrees: ["BS Computer Science"], level: "Junior", reqXp: 50 },
    { id: "tech_senior", title: "Senior Developer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 5500, reqDegrees: ["BS Computer Science"], reqJobId: "tech_junior", level: "Senior", reqXp: 150 },
    { id: "tech_lead", title: "Lead Engineer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 8000, reqDegrees: ["BS Computer Science"], reqJobId: "tech_senior", level: "Lead", reqXp: 300 },

    // --- MEDICAL (Medicine) ---
    { id: "med_resident", title: "Medical Resident", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 2000, reqDegrees: ["MBBS"], level: "Intern", reqXp: 0 },
    { id: "med_general", title: "General Practitioner", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 4500, reqDegrees: ["MBBS"], reqJobId: "med_resident", level: "Junior", reqXp: 50 },
    { id: "med_surgeon", title: "Surgeon", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 7500, reqDegrees: ["MBBS", "Doctor of Medicine (MD)"], reqJobId: "med_general", level: "Senior", reqXp: 150 },
    { id: "med_chief", title: "Chief of Medicine", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 12000, reqDegrees: ["MBBS", "Doctor of Medicine (MD)"], reqJobId: "med_surgeon", level: "Executive", reqXp: 500 },

    // --- BUSINESS (Business/Finance) ---
    { id: "biz_intern", title: "Sales Intern", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: 1200, reqDegrees: ["High School Diploma"], level: "Intern", reqXp: 0 },
    { id: "biz_analyst", title: "Financial Analyst", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: 3500, reqDegrees: ["BA Fine Arts"], level: "Junior", reqXp: 50 }, // Placeholder degree
    { id: "biz_manager", title: "Sales Manager", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: 6000, reqDegrees: ["BA Fine Arts"], reqJobId: "biz_analyst", level: "Senior", reqXp: 150 },

    // --- LEGAL (Law) ---
    { id: "law_paralegal", title: "Paralegal", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: 2500, reqDegrees: ["High School Diploma"], level: "Junior", reqXp: 20 },
    { id: "law_associate", title: "Associate Attorney", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: 5000, reqDegrees: ["Bachelor of Laws (LLB)"], reqJobId: "law_paralegal", level: "Senior", reqXp: 150 },
    { id: "law_partner", title: "Partner", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: 10000, reqDegrees: ["Master of Laws (LLM)"], reqJobId: "law_associate", level: "Executive", reqXp: 500 },

    // --- SERVICE (No Degree / Hospitality) ---
    { id: "srv_waiter", title: "Waiter", sector: "service", emoji: Mascot.Emotes.JobService, pay: 1000, reqDegrees: [], level: "Junior", reqXp: 0 },
    { id: "srv_chef", title: "Sous Chef", sector: "service", emoji: Mascot.Emotes.JobService, pay: 2800, reqDegrees: ["High School Diploma"], reqJobId: "srv_waiter", level: "Senior", reqXp: 100 },

    // --- TRADE (Trade School) ---
    { id: "trd_apprentice", title: "Apprentice Mechanic", sector: "trade", emoji: Mascot.Emotes.JobTrade, pay: 1800, reqDegrees: ["High School Diploma"], level: "Intern", reqXp: 0 },
    { id: "trd_mechanic", title: "Master Mechanic", sector: "trade", emoji: Mascot.Emotes.JobTrade, pay: 4000, reqDegrees: ["Trade License (Plumbing)"], reqJobId: "trd_apprentice", level: "Senior", reqXp: 150 },

    // --- FREELANCE (No Degree) ---
    { id: "freelance_writer", title: "Freelance Writer", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: 800, reqDegrees: [], level: "Freelance", reqXp: 0 },
    { id: "freelance_uber", title: "Delivery Driver", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: 900, reqDegrees: [], level: "Freelance", reqXp: 0 },
    { id: "freelance_streamer", title: "Streamer", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: 1200, reqDegrees: [], level: "Freelance", reqXp: 0 }
];

export function getJobsBySector(sector: JobDefinition['sector']) {
    return JOBS.filter(j => j.sector === sector);
}

export function getJob(id: string) {
    return JOBS.find(j => j.id === id);
}

// --- Dynamic Pay Implementation ---

import { getGuildConfig } from "./guildConfigService";
import { GuildConfig } from "@prisma/client";

/**
 * Calculates the dynamic pay for a job based on guild configuration.
 * Uses:
 * 1. Sector Base Pay (overrides job.pay if set)
 * 2. Level Multiplier (scales the base)
 */
export function getJobPaySync(job: JobDefinition, config: GuildConfig | null): number {
    if (!config) return job.pay;

    // 1. Determine Base Pay (Sector Config > Default Job Pay)
    let basePay = job.pay;
    if (config.jobSectorBasePay) {
        const sectorPay = (config.jobSectorBasePay as Record<string, number>)[job.sector];
        if (sectorPay && sectorPay > 0) {
            basePay = sectorPay;
        }
    }

    // 2. Determine Level Multiplier (Level Config > Default 1.0)
    let levelMult = 1.0;
    if (config.jobLevelMultipliers) {
        const levels = config.jobLevelMultipliers as Record<string, number>;
        if (levels[job.level]) {
            levelMult = levels[job.level];
        }
    }

    // Final Calculation
    const finalPay = Math.round(basePay * levelMult);
    return finalPay;
}

/**
 * Async wrapper to fetch config and calculate pay.
 * Use this when you don't already have the guild config.
 */
export async function getJobPay(job: JobDefinition, guildId: string): Promise<number> {
    const config = await getGuildConfig(guildId);
    return getJobPaySync(job, config);
}

/**
 * Checks if a user is eligible for a promotion based on XP.
 */
export async function checkPromotion(user: any): Promise<{ eligible: boolean; nextJob: JobDefinition | null; missingXp: number }> {
    if (!user.jobId) return { eligible: false, nextJob: null, missingXp: 0 };

    // Find a job that requires this current job as a prereq
    const nextJob = JOBS.find(j => j.reqJobId === user.jobId);
    if (!nextJob) return { eligible: false, nextJob: null, missingXp: 0 };

    const reqXp = nextJob.reqXp || 0;
    const missingXp = Math.max(0, reqXp - user.jobXp);

    if (missingXp === 0) {
        return { eligible: true, nextJob, missingXp: 0 };
    }

    return { eligible: false, nextJob, missingXp };
}

/**
 * Checks if a user should be demoted due to low XP.
 * Triggered on shift failure.
 */
export async function checkDemotion(user: any): Promise<{ demoted: boolean; prevJob: JobDefinition | null; msg: string }> {
    if (!user.jobId) return { demoted: false, prevJob: null, msg: "" };

    const currentJob = JOBS.find(j => j.id === user.jobId);
    if (!currentJob) return { demoted: false, prevJob: null, msg: "" };

    const reqXp = currentJob.reqXp || 0;

    // Buffer: You only get demoted if you drop 10 XP *below* the requirement.
    // e.g. Req 50. If you have 49, warning. If you have 40, demotion.
    if (user.jobXp < reqXp - 10) {
        // Demote!
        if (currentJob.reqJobId) {
            const prevJob = JOBS.find(j => j.id === currentJob.reqJobId);
            if (prevJob) {
                // Perform Demotion
                await prisma.user.update({
                    where: { id: user.id },
                    data: { jobId: prevJob.id }
                });
                return { demoted: true, prevJob, msg: `You have been **demoted** to **${prevJob.title}** due to poor performance.` };
            }
        } else {
            // Fired? Or just stay at lowest level?
            // If no prev job (Intern), maybe fired? Let's just keep them as intern but reset XP to 0 or something.
            // For now, no demotion from Intern.
        }
    }

    return { demoted: false, prevJob: null, msg: "" };
}

export async function reduceJobStress(userId: string, guildId: string, activity: "gym" | "sports" | "meditation") {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { wallet: true }
    });

    if (!user) throw new Error("User not found.");

    let cost = 500;
    let reduction = 20;

    if (activity === "sports") { cost = 800; reduction = 30; }
    if (activity === "meditation") { cost = 300; reduction = 15; }

    if (user.wallet!.balance < cost) {
        throw new Error(`You need **${cost}** coins to go to the ${activity}.`);
    }

    const newStress = Math.max(0, user.jobStress - reduction);

    await prisma.$transaction([
        prisma.wallet.update({
            where: { id: user.wallet!.id },
            data: { balance: { decrement: cost } }
        }),
        prisma.user.update({
            where: { id: user.id },
            data: { jobStress: newStress }
        })
    ]);

    return { newStress, cost, reduction };
}
