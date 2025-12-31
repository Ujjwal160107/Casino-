import { Mascot } from "../config/branding";

export interface JobDefinition {
    id: string;
    title: string;
    sector: "tech" | "medical" | "business" | "legal" | "service" | "trade" | "freelance";
    emoji: string;
    pay: number;
    reqDegrees: string[]; // List of degree names required
    reqJobId?: string; // ID of prerequisite job (e.g., must be Resident before Surgeon)
    level: "Intern" | "Junior" | "Senior" | "Lead" | "Executive" | "Freelance";
}

// Grouped by Sector for easiest display
export const JOBS: JobDefinition[] = [
    // --- TECH (Computer Science) ---
    { id: "tech_intern", title: "IT Intern", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 1500, reqDegrees: ["High School Diploma"], level: "Intern" },
    { id: "tech_junior", title: "Junior Developer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 3000, reqDegrees: ["BS Computer Science"], level: "Junior" },
    { id: "tech_senior", title: "Senior Developer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 5500, reqDegrees: ["BS Computer Science"], reqJobId: "tech_junior", level: "Senior" },
    { id: "tech_lead", title: "Lead Engineer", sector: "tech", emoji: Mascot.Emotes.JobTech, pay: 8000, reqDegrees: ["BS Computer Science"], reqJobId: "tech_senior", level: "Lead" },

    // --- MEDICAL (Medicine) ---
    { id: "med_resident", title: "Medical Resident", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 2000, reqDegrees: ["MBBS"], level: "Intern" },
    { id: "med_general", title: "General Practitioner", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 4500, reqDegrees: ["MBBS"], reqJobId: "med_resident", level: "Junior" },
    { id: "med_surgeon", title: "Surgeon", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 7500, reqDegrees: ["MBBS", "Doctor of Medicine (MD)"], reqJobId: "med_general", level: "Senior" },
    { id: "med_chief", title: "Chief of Medicine", sector: "medical", emoji: Mascot.Emotes.JobMedical, pay: 12000, reqDegrees: ["MBBS", "Doctor of Medicine (MD)"], reqJobId: "med_surgeon", level: "Executive" },

    // --- BUSINESS (Business/Finance) ---
    { id: "biz_intern", title: "Sales Intern", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: 1200, reqDegrees: ["High School Diploma"], level: "Intern" },
    { id: "biz_analyst", title: "Financial Analyst", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: 3500, reqDegrees: ["BA Fine Arts"], level: "Junior" }, // Placeholder degree
    { id: "biz_manager", title: "Sales Manager", sector: "business", emoji: Mascot.Emotes.JobBusiness, pay: 6000, reqDegrees: ["BA Fine Arts"], reqJobId: "biz_analyst", level: "Senior" },

    // --- LEGAL (Law) ---
    { id: "law_paralegal", title: "Paralegal", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: 2500, reqDegrees: ["High School Diploma"], level: "Junior" },
    { id: "law_associate", title: "Associate Attorney", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: 5000, reqDegrees: ["Bachelor of Laws (LLB)"], reqJobId: "law_paralegal", level: "Senior" },
    { id: "law_partner", title: "Partner", sector: "legal", emoji: Mascot.Emotes.JobLegal, pay: 10000, reqDegrees: ["Master of Laws (LLM)"], reqJobId: "law_associate", level: "Executive" },

    // --- SERVICE (No Degree / Hospitality) ---
    { id: "srv_waiter", title: "Waiter", sector: "service", emoji: Mascot.Emotes.JobService, pay: 1000, reqDegrees: [], level: "Junior" },
    { id: "srv_chef", title: "Sous Chef", sector: "service", emoji: Mascot.Emotes.JobService, pay: 2800, reqDegrees: ["High School Diploma"], reqJobId: "srv_waiter", level: "Senior" },

    // --- TRADE (Trade School) ---
    { id: "trd_apprentice", title: "Apprentice Mechanic", sector: "trade", emoji: Mascot.Emotes.JobTrade, pay: 1800, reqDegrees: ["High School Diploma"], level: "Intern" },
    { id: "trd_mechanic", title: "Master Mechanic", sector: "trade", emoji: Mascot.Emotes.JobTrade, pay: 4000, reqDegrees: ["Trade License (Plumbing)"], reqJobId: "trd_apprentice", level: "Senior" },

    // --- FREELANCE (No Degree) ---
    { id: "freelance_writer", title: "Freelance Writer", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: 800, reqDegrees: [], level: "Freelance" },
    { id: "freelance_uber", title: "Delivery Driver", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: 900, reqDegrees: [], level: "Freelance" },
    { id: "freelance_streamer", title: "Streamer", sector: "freelance", emoji: Mascot.Emotes.JobWorking, pay: 1200, reqDegrees: [], level: "Freelance" }
];

export function getJobsBySector(sector: JobDefinition['sector']) {
    return JOBS.filter(j => j.sector === sector);
}

export function getJob(id: string) {
    return JOBS.find(j => j.id === id);
}
