"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOBS = exports.JOB_ACTIONS = exports.WORK_EVENTS = void 0;
exports.getWorkEvent = getWorkEvent;
exports.getJobAction = getJobAction;
exports.getJobsBySector = getJobsBySector;
exports.getJob = getJob;
exports.getJobPaySync = getJobPaySync;
exports.getJobPay = getJobPay;
exports.checkPromotion = checkPromotion;
exports.checkDemotion = checkDemotion;
exports.reduceJobStress = reduceJobStress;
const branding_1 = require("../config/branding");
const prisma_1 = __importDefault(require("../utils/prisma"));
exports.WORK_EVENTS = [
    // TECH
    {
        id: "tech_crash", sector: "tech", title: "Server Crash!", description: "Production database is down! What do you do?",
        choices: [
            { label: "Hotfix in Prod", style: "danger", successChance: 40, successMsg: "You saved the day! Bonus!", failMsg: "You made it worse. Much worse.", outcome: { xp: 50, money: 2.0, stress: 20 } },
            { label: "Follow Protocol", style: "primary", successChance: 90, successMsg: "Service restored safely.", failMsg: "It took too long.", outcome: { xp: 10, money: 1.0, stress: 5 } }
        ]
    },
    {
        id: "tech_bug", sector: "tech", title: "Critical Bug", description: "A user found a critical bug in your code.",
        choices: [
            { label: "Blame the User", style: "secondary", successChance: 10, successMsg: "They believed you!", failMsg: "HR wants a word.", outcome: { xp: 0, money: 0.5, stress: 30 } },
            { label: "Fix it now", style: "success", successChance: 80, successMsg: "Bug squashed.", failMsg: "You introduced 3 new bugs.", outcome: { xp: 20, money: 1.1, stress: 10 } }
        ]
    },
    // MEDICAL
    {
        id: "med_emergency", sector: "medical", title: "Emergency!", description: "A patient is crashing in the ER!",
        choices: [
            { label: "CPR", style: "danger", successChance: 60, successMsg: "Patient stabilized!", failMsg: "It was too late...", outcome: { xp: 100, money: 1.5, stress: 25 } },
            { label: "Call Attending", style: "primary", successChance: 100, successMsg: "The senior doctor took over.", failMsg: "N/A", outcome: { xp: 5, money: 0.8, stress: 0 } }
        ]
    },
    // BUSINESS
    {
        id: "biz_deal", sector: "business", title: "The Big Deal", description: "A client wants to close a risky deal.",
        choices: [
            { label: "Sign it!", style: "success", successChance: 50, successMsg: "Huge commission!", failMsg: "The company lost millions.", outcome: { xp: 50, money: 3.0, stress: 40 } },
            { label: "Review first", style: "secondary", successChance: 90, successMsg: "Smart move. Safe deal.", failMsg: "Client walked away.", outcome: { xp: 15, money: 1.0, stress: 5 } }
        ]
    }
];
exports.JOB_ACTIONS = [
    { id: "tech_hack", sector: "tech", label: "Hack Server", description: "Attempt to steal small crypto.", emoji: "💻", cooldown: 86400 },
    { id: "med_heal", sector: "medical", label: "Self Heal", description: "Treat your own stress.", emoji: "🩺", cooldown: 43200 },
    { id: "biz_invest", sector: "business", label: "Insider Trade", description: "Boost next shift pay.", emoji: "📈", cooldown: 86400 },
    { id: "law_consult", sector: "legal", label: "Legal Consult", description: "Quick cash job.", emoji: "⚖️", cooldown: 21600 }
];
function getWorkEvent(sector) {
    const events = exports.WORK_EVENTS.filter(e => e.sector === sector || e.sector === "all");
    if (events.length === 0)
        return null;
    return events[Math.floor(Math.random() * events.length)];
}
function getJobAction(sector) {
    return exports.JOB_ACTIONS.find(a => a.sector === sector) || null;
}
// Grouped by Sector for easiest display
exports.JOBS = [
    // --- TECH (Computer Science) ---
    { id: "tech_intern", title: "IT Intern", sector: "tech", emoji: branding_1.Mascot.Emotes.JobTech, pay: 1500, reqDegrees: ["High School Diploma"], level: "Intern", reqXp: 0 },
    { id: "tech_junior", title: "Junior Developer", sector: "tech", emoji: branding_1.Mascot.Emotes.JobTech, pay: 3000, reqDegrees: ["BS Computer Science"], level: "Junior", reqXp: 50 },
    { id: "tech_senior", title: "Senior Developer", sector: "tech", emoji: branding_1.Mascot.Emotes.JobTech, pay: 5500, reqDegrees: ["BS Computer Science"], reqJobId: "tech_junior", level: "Senior", reqXp: 150 },
    { id: "tech_lead", title: "Lead Engineer", sector: "tech", emoji: branding_1.Mascot.Emotes.JobTech, pay: 8000, reqDegrees: ["BS Computer Science"], reqJobId: "tech_senior", level: "Lead", reqXp: 300 },
    // --- MEDICAL (Medicine) ---
    { id: "med_resident", title: "Medical Resident", sector: "medical", emoji: branding_1.Mascot.Emotes.JobMedical, pay: 2000, reqDegrees: ["MBBS"], level: "Intern", reqXp: 0 },
    { id: "med_general", title: "General Practitioner", sector: "medical", emoji: branding_1.Mascot.Emotes.JobMedical, pay: 4500, reqDegrees: ["MBBS"], reqJobId: "med_resident", level: "Junior", reqXp: 50 },
    { id: "med_surgeon", title: "Surgeon", sector: "medical", emoji: branding_1.Mascot.Emotes.JobMedical, pay: 7500, reqDegrees: ["MBBS", "Doctor of Medicine (MD)"], reqJobId: "med_general", level: "Senior", reqXp: 150 },
    { id: "med_chief", title: "Chief of Medicine", sector: "medical", emoji: branding_1.Mascot.Emotes.JobMedical, pay: 12000, reqDegrees: ["MBBS", "Doctor of Medicine (MD)"], reqJobId: "med_surgeon", level: "Executive", reqXp: 500 },
    // --- BUSINESS (Business/Finance) ---
    { id: "biz_intern", title: "Sales Intern", sector: "business", emoji: branding_1.Mascot.Emotes.JobBusiness, pay: 1200, reqDegrees: ["High School Diploma"], level: "Intern", reqXp: 0 },
    { id: "biz_analyst", title: "Financial Analyst", sector: "business", emoji: branding_1.Mascot.Emotes.JobBusiness, pay: 3500, reqDegrees: ["BA Fine Arts"], level: "Junior", reqXp: 50 }, // Placeholder degree
    { id: "biz_manager", title: "Sales Manager", sector: "business", emoji: branding_1.Mascot.Emotes.JobBusiness, pay: 6000, reqDegrees: ["BA Fine Arts"], reqJobId: "biz_analyst", level: "Senior", reqXp: 150 },
    // --- LEGAL (Law) ---
    { id: "law_paralegal", title: "Paralegal", sector: "legal", emoji: branding_1.Mascot.Emotes.JobLegal, pay: 2500, reqDegrees: ["High School Diploma"], level: "Junior", reqXp: 20 },
    { id: "law_associate", title: "Associate Attorney", sector: "legal", emoji: branding_1.Mascot.Emotes.JobLegal, pay: 5000, reqDegrees: ["Bachelor of Laws (LLB)"], reqJobId: "law_paralegal", level: "Senior", reqXp: 150 },
    { id: "law_partner", title: "Partner", sector: "legal", emoji: branding_1.Mascot.Emotes.JobLegal, pay: 10000, reqDegrees: ["Master of Laws (LLM)"], reqJobId: "law_associate", level: "Executive", reqXp: 500 },
    // --- SERVICE (No Degree / Hospitality) ---
    { id: "srv_waiter", title: "Waiter", sector: "service", emoji: branding_1.Mascot.Emotes.JobService, pay: 1000, reqDegrees: [], level: "Junior", reqXp: 0 },
    { id: "srv_chef", title: "Sous Chef", sector: "service", emoji: branding_1.Mascot.Emotes.JobService, pay: 2800, reqDegrees: ["High School Diploma"], reqJobId: "srv_waiter", level: "Senior", reqXp: 100 },
    // --- TRADE (Trade School) ---
    { id: "trd_apprentice", title: "Apprentice Mechanic", sector: "trade", emoji: branding_1.Mascot.Emotes.JobTrade, pay: 1800, reqDegrees: ["High School Diploma"], level: "Intern", reqXp: 0 },
    { id: "trd_mechanic", title: "Master Mechanic", sector: "trade", emoji: branding_1.Mascot.Emotes.JobTrade, pay: 4000, reqDegrees: ["Trade License (Plumbing)"], reqJobId: "trd_apprentice", level: "Senior", reqXp: 150 },
    // --- FREELANCE (No Degree) ---
    { id: "freelance_writer", title: "Freelance Writer", sector: "freelance", emoji: branding_1.Mascot.Emotes.JobWorking, pay: 800, reqDegrees: [], level: "Freelance", reqXp: 0 },
    { id: "freelance_uber", title: "Delivery Driver", sector: "freelance", emoji: branding_1.Mascot.Emotes.JobWorking, pay: 900, reqDegrees: [], level: "Freelance", reqXp: 0 },
    { id: "freelance_streamer", title: "Streamer", sector: "freelance", emoji: branding_1.Mascot.Emotes.JobWorking, pay: 1200, reqDegrees: [], level: "Freelance", reqXp: 0 }
];
function getJobsBySector(sector) {
    return exports.JOBS.filter(j => j.sector === sector);
}
function getJob(id) {
    return exports.JOBS.find(j => j.id === id);
}
// --- Dynamic Pay Implementation ---
const guildConfigService_1 = require("./guildConfigService");
/**
 * Calculates the dynamic pay for a job based on guild configuration.
 * Uses:
 * 1. Sector Base Pay (overrides job.pay if set)
 * 2. Level Multiplier (scales the base)
 */
function getJobPaySync(job, config) {
    if (!config)
        return job.pay;
    // 1. Determine Base Pay (Sector Config > Default Job Pay)
    let basePay = job.pay;
    if (config.jobSectorBasePay) {
        const sectorPay = config.jobSectorBasePay[job.sector];
        if (sectorPay && sectorPay > 0) {
            basePay = sectorPay;
        }
    }
    // 2. Determine Level Multiplier (Level Config > Default 1.0)
    let levelMult = 1.0;
    if (config.jobLevelMultipliers) {
        const levels = config.jobLevelMultipliers;
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
async function getJobPay(job, guildId) {
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    return getJobPaySync(job, config);
}
/**
 * Checks if a user is eligible for a promotion based on XP.
 */
async function checkPromotion(user) {
    if (!user.jobId)
        return { eligible: false, nextJob: null, missingXp: 0 };
    // Find a job that requires this current job as a prereq
    const nextJob = exports.JOBS.find(j => j.reqJobId === user.jobId);
    if (!nextJob)
        return { eligible: false, nextJob: null, missingXp: 0 };
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
async function checkDemotion(user) {
    if (!user.jobId)
        return { demoted: false, prevJob: null, msg: "" };
    const currentJob = exports.JOBS.find(j => j.id === user.jobId);
    if (!currentJob)
        return { demoted: false, prevJob: null, msg: "" };
    const reqXp = currentJob.reqXp || 0;
    // Buffer: You only get demoted if you drop 10 XP *below* the requirement.
    // e.g. Req 50. If you have 49, warning. If you have 40, demotion.
    if (user.jobXp < reqXp - 10) {
        // Demote!
        if (currentJob.reqJobId) {
            const prevJob = exports.JOBS.find(j => j.id === currentJob.reqJobId);
            if (prevJob) {
                // Perform Demotion
                await prisma_1.default.user.update({
                    where: { id: user.id },
                    data: { jobId: prevJob.id }
                });
                return { demoted: true, prevJob, msg: `You have been **demoted** to **${prevJob.title}** due to poor performance.` };
            }
        }
        else {
            // Fired? Or just stay at lowest level?
            // If no prev job (Intern), maybe fired? Let's just keep them as intern but reset XP to 0 or something.
            // For now, no demotion from Intern.
        }
    }
    return { demoted: false, prevJob: null, msg: "" };
}
async function reduceJobStress(userId, guildId, activity) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { wallet: true }
    });
    if (!user)
        throw new Error("User not found.");
    // Calculate Dynamic Cost
    let basePay = 1000; // Default if unemployed
    if (user.jobId) {
        const job = getJob(user.jobId);
        if (job) {
            basePay = await getJobPay(job, guildId);
        }
    }
    let multiplier = 0.5;
    let reduction = 20;
    if (activity === "gym") {
        multiplier = 0.75;
        reduction = 30;
    }
    else if (activity === "sports") {
        multiplier = 0.5;
        reduction = 20;
    }
    else if (activity === "meditation") {
        multiplier = 0.25;
        reduction = 15;
    }
    const cost = Math.floor(basePay * multiplier);
    if (user.wallet.balance < cost) {
        throw new Error(`You need **${cost}** coins to go to the ${activity}.`);
    }
    const newStress = Math.max(0, user.jobStress - reduction);
    await prisma_1.default.$transaction([
        prisma_1.default.wallet.update({
            where: { id: user.wallet.id },
            data: { balance: { decrement: cost } }
        }),
        prisma_1.default.user.update({
            where: { id: user.id },
            data: { jobStress: newStress }
        })
    ]);
    return { newStress, cost, reduction };
}
//# sourceMappingURL=jobService.js.map