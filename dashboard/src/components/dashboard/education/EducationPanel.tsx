"use client";

import { useState, useEffect } from "react";
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

    useEffect(() => {
        setFormData(config);
        setDegreeData(degrees);
    }, [config, degrees]);

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
            await updateEducationConfig(guildId, formData, degreeData);

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
            <div className="glass-card border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                    <Activity size={18} className="text-blue-400" />
                    General Settings
                </h3>

                <div>
                    <div className="space-y-2">
                        <DurationInput
                            label="Study Cooldown"
                            value={formData.studyCooldown}
                            onChange={(val) => handleConfigChange("studyCooldown", val)}
                        />
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
                            value={formData.eduGymCost === 0 ? "" : formData.eduGymCost}
                            onChange={(e) => handleConfigChange("eduGymCost", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-blue-300/70 font-bold uppercase flex items-center gap-2">
                            <Activity size={12} /> Student Sports Cost
                        </label>
                        <input
                            type="number"
                            value={formData.eduSportsCost === 0 ? "" : formData.eduSportsCost}
                            onChange={(e) => handleConfigChange("eduSportsCost", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-blue-300/70 font-bold uppercase flex items-center gap-2">
                            <Brain size={12} /> Student Meditation Cost
                        </label>
                        <input
                            type="number"
                            value={formData.eduMeditationCost === 0 ? "" : formData.eduMeditationCost}
                            onChange={(e) => handleConfigChange("eduMeditationCost", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>
            </div>
            <div className="glass-card border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider flex items-center gap-2 mb-6">
                    <GraduationCap size={18} className="text-yellow-400" />
                    Degree Tuitions
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {degreeData.map((degree, index) => (
                        <div key={degree.id} className="bg-white/5 border border-white/5 rounded-lg p-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-white font-display font-bold">
                                <GraduationCap size={16} className="text-zinc-500" />
                                <span className="truncate">{degree.name}</span>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold uppercase flex items-center gap-1">
                                    <Coins size={10} /> Tuition Per Semester
                                </label>
                                <input
                                    type="number"
                                    value={degree.tuitionPerSem === 0 ? "" : degree.tuitionPerSem}
                                    onChange={(e) => handleDegreeChange(index, e.target.value === "" ? 0 : parseInt(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
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
