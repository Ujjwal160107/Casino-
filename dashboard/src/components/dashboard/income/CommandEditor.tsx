"use client";

import { useState, useEffect } from "react";
import { updateIncomeCommand } from "@/actions/income-actions";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { DurationInput } from "../ui/DurationInput";
import { SentenceEditor } from "./SentenceEditor";
import { toast } from "sonner";
import { Switch } from "../../ui/Switch";

interface CommandConfig {
    minPay: number;
    maxPay: number;
    cooldown: number;
    successPct: number;
    failPenaltyPct: number;
    successMessages?: string[];
    failMessages?: string[];
    jailTime?: number;
    jailFine?: number;
    enabled?: boolean;
}

interface CommandEditorProps {
    guildId: string;
    commandKey: string;
    label: string;
    description: string;
    initialData: CommandConfig;
    isCrime?: boolean; // Special flag for crime warnings
}

export function CommandEditor({ guildId, commandKey, label, description, initialData, isCrime }: CommandEditorProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState(initialData);

    // Sync state with props when initialData changes (e.g. after refresh)
    useEffect(() => {
        setFormData(initialData);
    }, [initialData]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await updateIncomeCommand(guildId, commandKey, {
                ...formData,
                successMessages: formData.successMessages || [],
                failMessages: formData.failMessages || []
            });

            if (result.success) {
                toast.success(`${label} updated successfully!`);
                router.refresh();
            } else {
                toast.error(result.error || "Failed to update settings.");
                console.error("Update failed:", result.error);
            }
        } catch (error) {
            toast.error("Failed to update settings.");
        }
        setIsLoading(false);
    };

    const handleToggle = (checked: boolean) => {
        setFormData({ ...formData, enabled: checked });
        // Optional: Auto-save on toggle? The user might prefer "Update" button, 
        // but typically toggles are instant. 
        // Given the "Update" button exists, I'll defer saving until click, 
        // OR the user might expect instant toggle. 
        // The prompt asked for a toggle in the dashboard where admins can toggle. 
        // Usually settings forms with a Save button don't auto-save toggles.
        // I'll keep it as part of the form data to be saved on "Update".
    };

    return (
        <div className={`glass-card border border-white/5 rounded-xl p-6 relative transition-opacity ${formData.enabled === false ? 'opacity-70' : ''}`}>
            {!formData.enabled && (
                <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center pointer-events-none">
                    <span className="bg-black/80 px-4 py-2 rounded text-red-400 font-bold uppercase tracking-widest border border-red-500/20 transform -rotate-12">
                        Module Disabled
                    </span>
                </div>
            )}

            <div className="flex items-start justify-between mb-4 relative z-20 pointer-events-auto">
                <div>
                    <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider">{label}</h3>
                    <p className="text-sm text-zinc-200">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 uppercase">
                        {formData.enabled !== false ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                        checked={formData.enabled !== false}
                        onCheckedChange={handleToggle}
                    />
                </div>
            </div>

            {/* Configuration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="space-y-1">
                    <label className="text-xs text-white uppercase font-bold tracking-wider">Min Pay</label>
                    <input
                        type="number"
                        min={0}
                        value={formData.minPay}
                        onChange={(e) => setFormData({ ...formData, minPay: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                        disabled={formData.enabled === false}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-white uppercase font-bold tracking-wider">Max Pay</label>
                    <input
                        type="number"
                        min={0}
                        value={formData.maxPay}
                        onChange={(e) => setFormData({ ...formData, maxPay: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                        disabled={formData.enabled === false}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-white uppercase font-bold tracking-wider">Success Rate %</label>
                    <input
                        type="number"
                        min={1} max={100}
                        value={formData.successPct}
                        onChange={(e) => setFormData({ ...formData, successPct: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                        disabled={formData.enabled === false}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-white uppercase font-bold tracking-wider">Fail Penalty %</label>
                    <input
                        type="number"
                        min={0} max={100}
                        value={formData.failPenaltyPct}
                        onChange={(e) => setFormData({ ...formData, failPenaltyPct: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                        disabled={formData.enabled === false}
                    />
                </div>
            </div>

            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
                <DurationInput
                    value={formData.cooldown}
                    onChange={(val) => setFormData({ ...formData, cooldown: val })}
                    label="Global Cooldown"
                    disabled={formData.enabled === false}
                />
            </div>

            {/* Custom Messages Section */}
            {!isCrime && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <SentenceEditor
                        title="Success Messages"
                        description="Displayed when the user gets money."
                        sentences={formData.successMessages || []}
                        onChange={(s) => setFormData({ ...formData, successMessages: s })}
                        placeholder="You found {amount} coins!"
                        disabled={formData.enabled === false}
                    />
                    <SentenceEditor
                        title="Fail / Penalty Messages"
                        description="Displayed when the command fails."
                        sentences={formData.failMessages || []}
                        onChange={(s) => setFormData({ ...formData, failMessages: s })}
                        placeholder="You were caught! Fined {penalty}."
                        disabled={formData.enabled === false}
                    />
                </div>
            )}

            {isCrime && (
                <div className="mb-6 border-t border-white/5 pt-4">
                    <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <AlertTriangle size={14} /> Jail Consequences
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-white uppercase font-bold tracking-wider">Bail Amount (Fine)</label>
                            <input
                                type="number"
                                min={0}
                                value={formData.jailFine}
                                onChange={(e) => setFormData({ ...formData, jailFine: parseInt(e.target.value) || 0 })}
                                className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                                placeholder="1000"
                                disabled={formData.enabled === false}
                            />
                            <p className="text-[10px] text-zinc-400">Cost to bail out instantly.</p>
                        </div>
                        <div className="space-y-1">
                            <DurationInput
                                value={formData.jailTime || 0}
                                onChange={(val) => setFormData({ ...formData, jailTime: val })}
                                label="Jail Time"
                                disabled={formData.enabled === false}
                            />
                            <p className="text-[10px] text-zinc-400">Time spent in jail.</p>
                        </div>
                    </div>
                </div>
            )}

            {isCrime && (
                <p className="text-xs text-zinc-400 mt-2 mb-6 italic">
                    Note: Crime scenarios have complex logic handled by the bot. Custom messages are not supported here yet.
                </p>
            )}

            <div className="flex justify-end pt-4 border-t border-white/5 relative z-20 pointer-events-auto">
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-yellow-500 text-black px-4 py-2 rounded-lg hover:bg-yellow-400 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Update {label}
                </button>
            </div>
        </div>
    );
}
