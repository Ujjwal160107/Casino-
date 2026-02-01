"use client";

import { useState } from "react";
import { updateRewardAmounts } from "@/actions/income-actions";
import { Loader2, Save, Calendar, Clock, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface RewardEditorProps {
    guildId: string;
    initialData: {
        dailyAmount: number;
        weeklyAmount: number;
        monthlyAmount: number;
    };
}

export function RewardEditor({ guildId, initialData }: RewardEditorProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState(initialData);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateRewardAmounts(guildId, formData);
            toast.success("Reward amounts updated successfully!");
            router.refresh();
        } catch (error) {
            toast.error("Failed to update rewards.");
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Crown className="text-yellow-500" /> Time-Based Rewards
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Daily */}
                    <div className="bg-black/20 p-4 rounded-lg border border-white/5 space-y-3">
                        <div className="flex items-center gap-2 text-blue-400 font-bold">
                            <Clock size={18} /> Daily
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-zinc-500">Amount</label>
                            <input
                                type="number"
                                value={formData.dailyAmount === 0 ? "" : formData.dailyAmount}
                                onChange={(e) => setFormData({ ...formData, dailyAmount: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white"
                            />
                        </div>
                        <p className="text-xs text-zinc-600">Standard 24h Cooldown</p>
                    </div>

                    {/* Weekly */}
                    <div className="bg-black/20 p-4 rounded-lg border border-white/5 space-y-3">
                        <div className="flex items-center gap-2 text-purple-400 font-bold">
                            <Calendar size={18} /> Weekly
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-zinc-500">Amount</label>
                            <input
                                type="number"
                                value={formData.weeklyAmount === 0 ? "" : formData.weeklyAmount}
                                onChange={(e) => setFormData({ ...formData, weeklyAmount: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white"
                            />
                        </div>
                        <p className="text-xs text-zinc-600">Standard 7 Day Cooldown</p>
                    </div>

                    {/* Monthly */}
                    <div className="bg-black/20 p-4 rounded-lg border border-white/5 space-y-3">
                        <div className="flex items-center gap-2 text-orange-400 font-bold">
                            <Crown size={18} /> Monthly
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-zinc-500">Amount</label>
                            <input
                                type="number"
                                value={formData.monthlyAmount === 0 ? "" : formData.monthlyAmount}
                                onChange={(e) => setFormData({ ...formData, monthlyAmount: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white"
                            />
                        </div>
                        <p className="text-xs text-zinc-600">Standard 30 Day Cooldown</p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="bg-yellow-500 text-black px-6 py-2 rounded-lg font-bold hover:bg-yellow-400 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Save Rewards
                    </button>
                </div>
            </div>
        </div>
    );
}
