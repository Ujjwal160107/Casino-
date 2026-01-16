"use client";

import { useState } from "react";
import { updateEducationConfig, updateDegreeTuition } from "@/actions/education-actions";
import { Loader2, Save, GraduationCap, Clock, Dumbbell, Brain, Activity, Coins } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/Switch";
import { motion, AnimatePresence } from "framer-motion";
import { DurationInput } from "@/components/dashboard/ui/DurationInput";

interface EducationPanelProps {
    guildId: string;
    config: {
        studyCooldown: number;
        gymCost: number;
        meditationCost: number;
        sportsCost: number;
        eduGymCost: number;
        eduMeditationCost: number;
        eduSportsCost: number;
    };
    degrees: {
        id: string;
        name: string;
        tuitionPerSem: number;
    }[];
}

export function EducationPanel({ guildId, config, degrees }: EducationPanelProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState(config);
    const [degreeData, setDegreeData] = useState(degrees);
    const [hasChanges, setHasChanges] = useState(false);

    const handleConfigChange = (key: keyof typeof config, value: number) => {
        setFormData(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const handleDegreeChange = (index: number, value: number) => {
        const newDegrees = [...degreeData];
        newDegrees[index].tuitionPerSem = value;
        setDegreeData(newDegrees);
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            // Update Global Config
            const configPromise = updateEducationConfig(guildId, formData);

            // Update Degrees (Parallel)
            const degreePromises = degreeData.map(d => {
                const original = degrees.find(od => od.id === d.id);
                if (original?.tuitionPerSem !== d.tuitionPerSem) {
                    return updateDegreeTuition(guildId, d.id, d.tuitionPerSem);
                }
                return Promise.resolve({ success: true });
            });

            await Promise.all([configPromise, ...degreePromises]);

            toast.success("Education settings updated!");
            setHasChanges(false);
            router.refresh();
        } catch (error) {
            toast.error("Failed to update settings.");
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            {/* Global Configs */}
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                    <Activity size={18} className="text-blue-400" />
                    General Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <DurationInput
                            label="Study Cooldown"
                            value={formData.studyCooldown}
                            onChange={(val) => handleConfigChange("studyCooldown", val)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2">
                            <Dumbbell size={12} /> Gym Cost
                        </label>
                        <input
                            type="number"
                            value={formData.gymCost}
                            onChange={(e) => handleConfigChange("gymCost", parseInt(e.target.value) || 0)}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2">
                            <Brain size={12} /> Meditation Cost
                        </label>
                        <input
                            type="number"
                            value={formData.meditationCost}
                            onChange={(e) => handleConfigChange("meditationCost", parseInt(e.target.value) || 0)}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2">
                            <Activity size={12} /> Sports Cost
                        </label>
                        <input
                            type="number"
                            value={formData.sportsCost}
                            onChange={(e) => handleConfigChange("sportsCost", parseInt(e.target.value) || 0)}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Job Stress Relief (Reference) */}
            <div className="mt-8 mb-4 border-t border-white/5 pt-4">
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Job Stress Relief Costs (Reference)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 pointer-events-none grayscale">
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2"><Dumbbell size={12} /> Job Gym</label>
                        <input type="number" readOnly value={formData.gymCost} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-zinc-400" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2"><Activity size={12} /> Job Sports</label>
                        <input type="number" readOnly value={formData.sportsCost} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-zinc-400" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2"><Brain size={12} /> Job Meditation</label>
                        <input type="number" readOnly value={formData.meditationCost} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-zinc-400" />
                    </div>
                </div>
            </div>

            {/* Education Stress Relief (Config) */}
            <div className="mt-4">
                <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">Student Stress Relief Costs (Configurable)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs text-blue-300/70 font-bold uppercase flex items-center gap-2">
                            <Dumbbell size={12} /> Student Gym Cost
                        </label>
                        <input
                            type="number"
                            value={formData.eduGymCost}
                            onChange={(e) => handleConfigChange("eduGymCost", parseInt(e.target.value) || 0)}
                            className="w-full bg-blue-900/10 border border-blue-500/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-blue-300/70 font-bold uppercase flex items-center gap-2">
                            <Activity size={12} /> Student Sports Cost
                        </label>
                        <input
                            type="number"
                            value={formData.eduSportsCost}
                            onChange={(e) => handleConfigChange("eduSportsCost", parseInt(e.target.value) || 0)}
                            className="w-full bg-blue-900/10 border border-blue-500/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-blue-300/70 font-bold uppercase flex items-center gap-2">
                            <Brain size={12} /> Student Meditation Cost
                        </label>
                        <input
                            type="number"
                            value={formData.eduMeditationCost}
                            onChange={(e) => handleConfigChange("eduMeditationCost", parseInt(e.target.value) || 0)}
                            className="w-full bg-blue-900/10 border border-blue-500/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>
            </div>
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                    <GraduationCap size={18} className="text-yellow-400" />
                    Degree Tuitions
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {degreeData.map((degree, index) => (
                        <div key={degree.id} className="bg-black/20 border border-white/5 rounded-lg p-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-white font-serif font-bold">
                                <GraduationCap size={16} className="text-zinc-500" />
                                <span className="truncate">{degree.name}</span>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold uppercase flex items-center gap-1">
                                    <Coins size={10} /> Tuition Per Semester
                                </label>
                                <input
                                    type="number"
                                    value={degree.tuitionPerSem}
                                    onChange={(e) => handleDegreeChange(index, parseInt(e.target.value) || 0)}
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-6">
                <button
                    onClick={handleSave}
                    disabled={isLoading || !hasChanges}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-500 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-purple-500/20"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    {hasChanges ? "Save Changes" : "Up to Date"}
                </button>
            </div>
        </div>
    );
}
