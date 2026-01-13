"use client";

import { useState } from "react";
import { updateQuestSettings } from "@/actions/income-actions";
import { Loader2, Save, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface QuestConfig {
    questPay: number;
    questXp: number;
}

interface QuestEditorProps {
    guildId: string;
    initialData: QuestConfig;
}

export function QuestEditor({ guildId, initialData }: QuestEditorProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState(initialData);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await updateQuestSettings(guildId, formData);
            if (result.success) {
                toast.success("Quest settings updated successfully!");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to update settings.");
            }
        } catch (error) {
            toast.error("Failed to update settings.");
        }
        setIsLoading(false);
    };

    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 relative">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <ScrollText size={18} className="text-purple-400" />
                        Daily Quest Rewards
                    </h3>
                    <p className="text-sm text-zinc-400">Configure rewards for completing daily quests.</p>
                </div>
            </div>

            {/* Config Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-2">
                    <label className="text-xs text-zinc-500 font-bold uppercase">Completion Reward</label>
                    <input
                        type="number"
                        min={0}
                        value={formData.questPay}
                        onChange={(e) => setFormData({ ...formData, questPay: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                    <p className="text-[10px] text-zinc-600">Fixed currency reward.</p>
                </div>
                <div className="space-y-2">
                    <label className="text-xs text-zinc-500 font-bold uppercase">XP Reward</label>
                    <input
                        type="number"
                        min={0}
                        value={formData.questXp}
                        onChange={(e) => setFormData({ ...formData, questXp: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                    <p className="text-[10px] text-zinc-600">XP gained upon completion.</p>
                </div>
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-white/5">
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-500 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-purple-500/20"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Save Quest Settings
                </button>
            </div>
        </div>
    );
}
