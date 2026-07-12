import { Mascot } from "../config/branding";
import { DEFAULT_JOB_PAYS } from "../utils/economyConfig";

import prisma from "../utils/prisma";

export interface JobDefinition {
    id: string;
    title: string;
    sector: "tech" | "medical" | "business" | "legal" | "service" | "trade" | "freelance";
    emoji: string;
    pay: number;
    reqDegrees: string[]; // List of degree names required
    reqJobId?: string; // ID of prerequisite job (e.g., must be Resident before Surgeon)
    reqShifts?: number; // Min lifetime shiftsWorked required to hold/promote to this job
    level: "Intern" | "Junior" | "Senior" | "Lead" | "Executive" | "Freelance";
    careerTier: number;
}

export interface WorkEvent {
    id: string;
    sector: JobDefinition['sector'] | "all";
    title: string;
    description: string;
    choices: {
        label: string;
        style: "success" | "danger" | "primary" | "secondary";
        successChance: number; // 0-100
        successMsg: string;
        failMsg: string;
        outcome: {
            money?: number; // Multiplier of base pay
            stress: number;
        };
        critical?: boolean; // Emergency Pager can intercept failure on critical choices
    }[];
}

export interface JobAction {
    id: string;
    sector: JobDefinition['sector'];
    label: string;
    description: string;
    emoji: string;
    cooldown: number; // Seconds
}

export { WORK_EVENTS } from "../data/workEvents";
import { WORK_EVENTS as _WORK_EVENTS } from "../data/workEvents";

export const JOB_ACTIONS: JobAction[] = [
    { id: "tech_hack", sector: "tech", label: "Hack Server", description: "Attempt to steal small crypto.", emoji: "💻", cooldown: 86400 },
    { id: "med_heal", sector: "medical", label: "Self Heal", description: "Treat your own stress.", emoji: "🩺", cooldown: 43200 },
    { id: "biz_invest", sector: "business", label: "Insider Trade", description: "Boost next shift pay.", emoji: "📈", cooldown: 86400 },
    { id: "law_consult", sector: "legal", label: "Legal Consult", description: "Quick cash job.", emoji: "⚖️", cooldown: 21600 }
];

export function getWorkEvent(sector: string, recentIds: string[] = []): WorkEvent | null {
    const matching = _WORK_EVENTS.filter(e => e.sector === sector || e.sector === "all");
    if (matching.length === 0) return null;
    const fresh = matching.filter((e: WorkEvent) => !recentIds.includes(e.id));
    const pool = fresh.length > 0 ? fresh : matching;
    return pool[Math.floor(Math.random() * pool.length)];
}

export function getJobAction(sector: string): JobAction | null {
    return JOB_ACTIONS.find(a => a.sector === sector) || null;
}

// Grouped by Sector for easiest display
export const JOBS: JobDefinition[] = [
    // --- TECH (Computer Science) ---
    { id: "tech_intern", title: "IT Intern", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: DEFAULT_JOB_PAYS.itIntern, reqDegrees: ["High School Diploma"], level: "Intern", reqShifts: 0, careerTier: 1 },
    { id: "tech_junior", title: "Junior Developer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: DEFAULT_JOB_PAYS.juniorDeveloper, reqDegrees: ["BS Computer Science"], level: "Junior", reqShifts: 10, careerTier: 2 },
    { id: "tech_senior", title: "Senior Developer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: DEFAULT_JOB_PAYS.seniorDeveloper, reqDegrees: ["BS Computer Science"], reqJobId: "tech_junior", level: "Senior", reqShifts: 30, careerTier: 3 },
    { id: "tech_lead", title: "Lead Engineer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: DEFAULT_JOB_PAYS.leadEngineer, reqDegrees: ["BS Computer Science"], reqJobId: "tech_senior", level: "Lead", reqShifts: 60, careerTier: 4 },

    // --- MEDICAL (Medicine) ---
    { id: "med_resident", title: "Medical Resident", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: DEFAULT_JOB_PAYS.medicalResident, reqDegrees: ["MBBS"], level: "Intern", reqShifts: 0, careerTier: 2 },
    { id: "med_general", title: "General Practitioner", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: DEFAULT_JOB_PAYS.generalPractitioner, reqDegrees: ["MBBS"], reqJobId: "med_resident", level: "Junior", reqShifts: 10, careerTier: 3 },
    { id: "med_surgeon", title: "Surgeon", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: DEFAULT_JOB_PAYS.surgeon, reqDegrees: ["MBBS", "Doctor of Medicine (MD) / Ph.D."], reqJobId: "med_general", level: "Senior", reqShifts: 30, careerTier: 3 },
    { id: "med_chief", title: "Chief of Medicine", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: DEFAULT_JOB_PAYS.chiefOfMedicine, reqDegrees: ["MBBS", "Doctor of Medicine (MD) / Ph.D."], reqJobId: "med_surgeon", level: "Executive", reqShifts: 100, careerTier: 4 },

    // --- BUSINESS (Business/Finance) ---
    { id: "biz_intern", title: "Sales Intern", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: DEFAULT_JOB_PAYS.salesIntern, reqDegrees: ["High School Diploma"], level: "Intern", reqShifts: 0, careerTier: 1 },
    { id: "biz_analyst", title: "Financial Analyst", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: DEFAULT_JOB_PAYS.financialAnalyst, reqDegrees: ["BA Fine Arts"], level: "Junior", reqShifts: 10, careerTier: 2 },
    { id: "biz_manager", title: "Sales Manager", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: DEFAULT_JOB_PAYS.salesManager, reqDegrees: ["BA Fine Arts"], reqJobId: "biz_analyst", level: "Senior", reqShifts: 30, careerTier: 3 },

    // --- LEGAL (Law) ---
    { id: "law_paralegal", title: "Paralegal", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: DEFAULT_JOB_PAYS.paralegal, reqDegrees: ["Bachelor of Laws (LLB)"], level: "Junior", reqShifts: 5, careerTier: 2 },
    { id: "law_associate", title: "Associate Attorney", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: DEFAULT_JOB_PAYS.associateAttorney, reqDegrees: ["Bachelor of Laws (LLB)"], reqJobId: "law_paralegal", level: "Senior", reqShifts: 30, careerTier: 3 },
    { id: "law_partner", title: "Partner", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: DEFAULT_JOB_PAYS.partner, reqDegrees: ["Master of Laws (LLM)"], reqJobId: "law_associate", level: "Executive", reqShifts: 100, careerTier: 4 },

    // --- SERVICE (No Degree / Hospitality) ---
    { id: "srv_waiter", title: "Waiter", sector: "service", emoji: Mascot.Emotes.JobService, pay: DEFAULT_JOB_PAYS.waiter, reqDegrees: [], level: "Junior", reqShifts: 0, careerTier: 0 },
    { id: "srv_chef", title: "Sous Chef", sector: "service", emoji: Mascot.Emotes.JobService, pay: DEFAULT_JOB_PAYS.sousChef, reqDegrees: [], reqJobId: "srv_waiter", level: "Senior", reqShifts: 20, careerTier: 0 },

    // --- TRADE (Trade School) ---
    { id: "trd_apprentice", title: "Apprentice Mechanic", sector: "trade", emoji: Mascot.Emotes.JobTrade, pay: DEFAULT_JOB_PAYS.apprenticeMechanic, reqDegrees: ["Trade License (Plumbing)"], level: "Intern", reqShifts: 0, careerTier: 1 },
    { id: "trd_mechanic", title: "Master Mechanic", sector: "trade", emoji: Mascot.Emotes.JobTrade, pay: DEFAULT_JOB_PAYS.masterMechanic, reqDegrees: ["Trade License (Plumbing)"], reqJobId: "trd_apprentice", level: "Senior", reqShifts: 30, careerTier: 2 },

    // --- FREELANCE (No Degree) ---
    { id: "freelance_writer", title: "Freelance Writer", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: DEFAULT_JOB_PAYS.freelanceWriter, reqDegrees: [], level: "Freelance", reqShifts: 0, careerTier: 0 },
    { id: "freelance_uber", title: "Delivery Driver", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: DEFAULT_JOB_PAYS.deliveryDriver, reqDegrees: [], level: "Freelance", reqShifts: 0, careerTier: 0 },
    { id: "freelance_streamer", title: "Streamer", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: DEFAULT_JOB_PAYS.streamer, reqDegrees: [], level: "Freelance", reqShifts: 0, careerTier: 0 }
];

export function getJobsBySector(sector: JobDefinition['sector']) {
    return JOBS.filter(j => j.sector === sector);
}

export function getJob(id: string) {
    return JOBS.find(j => j.id === id);
}

export const JOB_GEAR_REQUIREMENTS: Record<string, string> = {
    tech:      "work_laptop",
    medical:   "medical_kit",
    business:  "business_briefcase",
    legal:     "legal_case_file",
    service:   "service_uniform",
    trade:     "mechanic_toolkit",
    freelance: "freelance_starter_pack",
};

export function getRequiredGearKey(sector: string): string | null {
    return JOB_GEAR_REQUIREMENTS[sector] ?? null;
}

function normalizeJobLookup(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getJobByName(query: string) {
    const normalized = normalizeJobLookup(query);
    if (!normalized) return undefined;

    return JOBS.find((job) => normalizeJobLookup(job.title) === normalized)
        ?? JOBS.find((job) => normalizeJobLookup(job.title).includes(normalized));
}

export function getJobApplicationStatus(
    user: { jobId?: string | null; shiftsWorked?: number; degrees?: { degree: { name: string } }[] },
    job: JobDefinition
) {
    const missing: string[] = [];
    const ownedDegrees = new Set((user.degrees ?? []).map((item) => item.degree.name));

    if (user.jobId === job.id) {
        return { canApply: false, label: "Current Job", missing: ["Already employed here"] };
    }

    if (user.jobId && !job.reqJobId) {
        return { canApply: false, label: "Locked", missing: ["Resign before changing fields"] };
    }

    for (const degree of job.reqDegrees) {
        if (!ownedDegrees.has(degree)) missing.push(`Need ${degree}`);
    }

    if (job.reqJobId && user.jobId !== job.reqJobId) {
        const previousJob = getJob(job.reqJobId);
        missing.push(`Need job: ${previousJob?.title ?? job.reqJobId}`);
    }

    const requiredShifts = job.reqShifts ?? 0;
    if (requiredShifts > 0 && (user.shiftsWorked ?? 0) < requiredShifts) {
        missing.push(`Need ${requiredShifts} lifetime shifts (you have ${user.shiftsWorked ?? 0})`);
    }

    return {
        canApply: missing.length === 0,
        label: missing.length === 0 ? "Apply" : "Locked",
        missing
    };
}

export function getUserCareerTier(user: { jobId?: string | null }, currentJob?: JobDefinition | null): number {
    const job = currentJob ?? (user.jobId ? getJob(user.jobId) : null);
    return job?.careerTier ?? 0;
}
// Default Multipliers to use when a Sectore Base Pay is set
export const DEFAULT_LEVEL_MULTIPLIERS: Record<string, number> = {
    "Intern": 1.0,
    "Freelance": 1.0,
    "Junior": 2.0,
    "Senior": 3.6, // Approx 5500/1500 ~ 3.66
    "Lead": 5.3,   // Approx 8000/1500 ~ 5.33
    "Executive": 8.0 // Approx 12000/1500 = 8
};

import { applyRelaxOption } from "./relaxService";
export function getJobPaySync(job: JobDefinition): number {
    return job.pay;
}

/**
 * Async wrapper kept for call-site compatibility.
 */
export async function getJobPay(job: JobDefinition, _guildId: string): Promise<number> {
    return getJobPaySync(job);
}

/**
 * Checks if a user is eligible for a promotion based on lifetime shifts worked.
 */
export async function checkPromotion(user: any, _guildId?: string): Promise<{ eligible: boolean; nextJob: JobDefinition | null; missingShifts: number }> {
    if (!user.jobId) return { eligible: false, nextJob: null, missingShifts: 0 };

    // Find a job that requires this current job as a prereq
    const nextJob = JOBS.find(j => j.reqJobId === user.jobId);
    if (!nextJob) return { eligible: false, nextJob: null, missingShifts: 0 };

    const reqShifts = nextJob.reqShifts ?? 0;
    const missingShifts = Math.max(0, reqShifts - (user.shiftsWorked || 0));

    return { eligible: missingShifts === 0, nextJob, missingShifts };
}

/**
 * Returns the next job in the progression chain for a given jobId, or null if at the top.
 */
export function getNextJob(currentJobId: string): JobDefinition | null {
    return JOBS.find(j => j.reqJobId === currentJobId) ?? null;
}

/**
 * Returns checkPromotion result plus a human-readable progressText string.
 */
export async function getPromotionProgress(
    user: { jobId?: string | null; shiftsWorked: number },
    guildId?: string
): Promise<{ eligible: boolean; nextJob: JobDefinition | null; missingShifts: number; progressText: string }> {
    const result = await checkPromotion(user, guildId);
    let progressText = "";
    if (!result.nextJob) {
        progressText = "At the top of your career path.";
    } else if (result.eligible) {
        progressText = `Ready for **${result.nextJob.title}**!`;
    } else {
        progressText = `Need: ${result.missingShifts} more shifts → ${result.nextJob.title}`;
    }
    return { ...result, progressText };
}

/**
 * Checks if a user should be demoted due to consecutive shift failures.
 * Demotion happens after 3 consecutive failures, only for higher-level jobs.
 * Intern / entry-level jobs (no reqJobId) are immune to demotion.
 */
export async function checkDemotion(user: any): Promise<{ demoted: boolean; prevJob: JobDefinition | null; msg: string; failStreak: number }> {
    if (!user.jobId) return { demoted: false, prevJob: null, msg: "", failStreak: 0 };

    const currentJob = JOBS.find(j => j.id === user.jobId);
    if (!currentJob) return { demoted: false, prevJob: null, msg: "", failStreak: 0 };

    // Increment the consecutive fail streak
    const newFailStreak = (user.jobFailStreak || 0) + 1;

    // Update fail streak in DB
    await prisma.user.update({
        where: { discordId: user.discordId },
        data: { jobFailStreak: newFailStreak }
    });

    // Only demote from higher posts (jobs that have a prerequisite job)
    if (!currentJob.reqJobId) {
        // Entry-level / Intern — no demotion, just track streak
        return { demoted: false, prevJob: null, msg: `⚠️ Failed shift streak: **${newFailStreak}/3**`, failStreak: newFailStreak };
    }

    // Demote after 3 consecutive failures
    if (newFailStreak >= 3) {
        const prevJob = JOBS.find(j => j.id === currentJob.reqJobId);
        if (prevJob) {
            // Perform Demotion & reset fail streak
            await prisma.user.update({
                where: { discordId: user.discordId },
                data: { jobId: prevJob.id, jobFailStreak: 0 }
            });
            return { demoted: true, prevJob, msg: `You have been **demoted** to **${prevJob.title}** after **3 consecutive failures**.`, failStreak: 0 };
        }
    }

    return { demoted: false, prevJob: null, msg: `⚠️ Failed shift streak: **${newFailStreak}/3** — one more and you'll be demoted!`, failStreak: newFailStreak };
}

export async function reduceJobStress(userId: string, guildId: string, activity: "gym" | "sports" | "meditation") {
    const user = await prisma.user.findUnique({ where: { discordId: userId } });
    if (!user) throw new Error("User not found.");

    const optionByLegacyActivity = {
        gym: "gym_session",
        sports: "quick_break",
        meditation: "meditation_retreat",
    } as const;
    const result = await applyRelaxOption(userId, user.username, optionByLegacyActivity[activity]);

    return {
        newStress: result.jobStress,
        cost: result.cost,
        reduction: result.previousJobStress - result.jobStress
    };
}
