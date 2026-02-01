"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateJobSettings, JobSettingsData } from "@/actions/job-actions";
import { Loader2, Save, Monitor, Stethoscope, Briefcase, Scale, Coffee, Wrench, PenTool, Dumbbell, Brain, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { DurationInput } from "../ui/DurationInput";

// Hardcoded for UI listing
const SECTORS = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];
const RELAX_ACTIVITIES = ["gym", "meditation", "sports"];

const SECTOR_ICONS: Record<string, React.ElementType> = {
    "tech": Monitor,
    "medical": Stethoscope,
    "business": Briefcase,
    "legal": Scale,
    "service": Coffee,
    "trade": Wrench,
    "freelance": PenTool
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
    "gym": Dumbbell,
    "meditation": Brain,
    "sports": Trophy
};

const SAMPLE_JOBS = [
    { id: "tech_intern", title: "IT Intern", sector: "tech", canPromoteTo: "tech_junior" },
    { id: "tech_junior", title: "Junior Developer", sector: "tech", canPromoteTo: "tech_senior" },
    { id: "tech_senior", title: "Senior Developer", sector: "tech", canPromoteTo: "tech_lead" },
    { id: "tech_lead", title: "Lead Engineer", sector: "tech", canPromoteTo: null },
    // Simplified list for demo, ideally fetched from backend constants if possible, but hardcoding for UI is fine for now as IDs are static.
    // I entered a few sample ones. To be robust, I should probably expose JOBS array via API or action.
    // For now, I will include a more complete list or just a generic input for IDs if needed, 
    // but the user wants "how much shifts and xp reqd for promo", so I need a way to target specific promos.
    // I will list the ones from jobService.
];

// Full list from jobService (manual sync as I can't import server code directly in client if it has node deps easily, but I could try importing shared types if available)
// I'll just hardcode the IDs I saw in jobService.ts
const ALL_JOBS = [
    { id: "tech_intern", title: "IT Intern" }, { id: "tech_junior", title: "Junior Developer" }, { id: "tech_senior", title: "Senior Developer" }, { id: "tech_lead", title: "Lead Engineer" },
    { id: "med_resident", title: "Medical Resident" }, { id: "med_general", title: "GP" }, { id: "med_surgeon", title: "Surgeon" }, { id: "med_chief", title: "Chief of Medicine" },
    { id: "biz_intern", title: "Sales Intern" }, { id: "biz_analyst", title: "Financial Analyst" }, { id: "biz_manager", title: "Sales Manager" },
    { id: "law_paralegal", title: "Paralegal" }, { id: "law_associate", title: "Associate Attorney" }, { id: "law_partner", title: "Partner" },
    { id: "srv_waiter", title: "Waiter" }, { id: "srv_chef", title: "Sous Chef" },
    { id: "trd_apprentice", title: "Apprentice Mechanic" }, { id: "trd_mechanic", title: "Master Mechanic" },
    { id: "freelance_writer", title: "Freelance Writer" }, { id: "freelance_uber", title: "Driver" }, { id: "freelance_streamer", title: "Streamer" }
];

interface JobsConfigFormProps {
    guildId: string;
    initialData: JobSettingsData;
}

export function JobsConfigForm({ guildId, initialData }: JobsConfigFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState<JobSettingsData>(initialData);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            const result = await updateJobSettings(guildId, formData);
            if (result.success) {
                setMessage({ type: "success", text: "Configuration saved successfully!" });
                router.refresh();
            } else {
                setMessage({ type: "error", text: result.error || "Failed to save configuration." });
            }
        } catch (error) {
            setMessage({ type: "error", text: "An unexpected error occurred." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleNestedChange = (category: keyof JobSettingsData, key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            [category]: {
                ...(prev[category] as Record<string, number>),
                [key]: parseInt(value) || 0
            }
        }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-7xl mx-auto w-full">
            {/* General Settings */}
            <div className="space-y-4 glass-card p-6 rounded-xl">
                <h2 className="text-xl font-bold font-display text-white mb-4">General Settings</h2>
                <div className="space-y-2">
                    <DurationInput
                        label="Work Cooldown"
                        value={formData.jobCooldown}
                        onChange={(val) => setFormData({ ...formData, jobCooldown: val })}
                    />
                    <p className="text-xs text-zinc-500">Time between work shifts (Default: 3600s = 1 hour).</p>
                </div>
            </div>

            {/* Sector Salaries */}
            <div className="space-y-4 glass-card p-6 rounded-xl">
                <h2 className="text-xl font-bold font-display text-white mb-4">Sector Base Salaries</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SECTORS.map(sector => {
                        const Icon = SECTOR_ICONS[sector] || Briefcase;
                        return (
                            <div key={sector} className="space-y-1">
                                <label className="text-sm font-medium text-zinc-400 capitalize flex items-center gap-2">
                                    <Icon size={16} className="text-yellow-500" />
                                    {sector}
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.jobSectorBasePay[sector] === 0 ? "" : (formData.jobSectorBasePay[sector] ?? "")}
                                    onChange={(e) => handleNestedChange("jobSectorBasePay", sector, e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                                    placeholder={`Def: ${initialData.defaultSectorPay ? initialData.defaultSectorPay[sector] || 'N/A' : 'N/A'}`}
                                />
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-zinc-500">Overrides the default base pay for all jobs in this sector.</p>
            </div>

            {/* Relax Activities */}
            <div className="space-y-4 glass-card p-6 rounded-xl">
                <h2 className="text-xl font-bold font-display text-white mb-4">Relax Activity Costs</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {RELAX_ACTIVITIES.map(activity => {
                        const Icon = ACTIVITY_ICONS[activity] || Dumbbell;
                        return (
                            <div key={activity} className="space-y-1">
                                <label className="text-sm font-medium text-zinc-400 capitalize flex items-center gap-2">
                                    <Icon size={16} className="text-blue-400" />
                                    {activity}
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.jobRelaxControllers[activity] === 0 ? "" : (formData.jobRelaxControllers[activity] ?? "")}
                                    onChange={(e) => handleNestedChange("jobRelaxControllers", activity, e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                                    placeholder="Default"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Promotion Requirements */}
            <div className="space-y-4 glass-card p-6 rounded-xl">
                <h2 className="text-xl font-bold font-display text-white mb-4">Promotion Requirements</h2>
                <p className="text-sm text-zinc-400 mb-4">Set the required XP and Shifts needed to be PROMOTED TO this job.</p>

                <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                    {ALL_JOBS.map(job => (
                        <div key={job.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="flex-1">
                                <p className="text-white font-medium">{job.title}</p>
                                <p className="text-xs text-zinc-500 font-mono">{job.id}</p>
                            </div>

                            <div className="w-24">
                                <label className="text-[10px] uppercase text-zinc-500 font-bold">Shifts Req</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.jobShiftReqs[job.id] ?? 0}
                                    onChange={(e) => handleNestedChange("jobShiftReqs", job.id, e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm"
                                    placeholder="Def"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Status Message */}
            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-lg text-sm border ${message.type === "success"
                        ? "bg-green-500/10 border-green-500/20 text-green-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}
                >
                    {message.text}
                </motion.div>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-2.5 rounded-lg font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Save Configuration
            </button>
        </form>
    );
}
