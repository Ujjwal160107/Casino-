"use client";

import { useState, useEffect } from "react";
import { updateCasinoDrops, triggerManualDrop } from "@/actions/income-actions";
import { Loader2, Save, Trash2, Plus, Clock, Terminal, Calendar, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Channel {
    id: string;
    name: string;
}

interface DropConfig {
    id?: string;
    type: "SCHEDULED" | "INTERVAL" | "MANUAL";
    channelId: string;
    minAmount: number;
    maxAmount: number;
    scheduleTime?: string; // HH:mm
    interval?: number; // Minutes
    expiration?: number; // Seconds
}

interface CasinoDropsEditorProps {
    guildId: string;
    initialData: DropConfig[];
    channels: Channel[];
}

export function CasinoDropsEditor({ guildId, initialData, channels }: CasinoDropsEditorProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [drops, setDrops] = useState<DropConfig[]>(initialData.length > 0 ? initialData : []);

    // Sync state when initialData updates (after save/refresh)
    useEffect(() => {
        setDrops(initialData);
    }, [initialData]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await updateCasinoDrops(guildId, drops);
            if (result.success) {
                toast.success("Requests updated successfully!");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to update settings.");
            }
        } catch (error) {
            toast.error("Failed to update settings.");
        }
        setIsLoading(false);
    };

    const addDrop = () => {
        setDrops([
            ...drops,
            {
                type: "INTERVAL",
                channelId: channels[0]?.id || "",
                minAmount: 100,
                maxAmount: 500,
                interval: 60,
                expiration: 60
            }
        ]);
    };

    const removeDrop = (index: number) => {
        setDrops(drops.filter((_, i) => i !== index));
    };

    const updateDrop = (index: number, key: keyof DropConfig, value: any) => {
        const newDrops = [...drops];
        newDrops[index] = { ...newDrops[index], [key]: value };
        setDrops(newDrops);
    };

    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Terminal size={18} className="text-purple-400" />
                        Casino Drops
                    </h3>
                    <p className="text-sm text-zinc-400">Configure automated or manual money drops in channels.</p>
                </div>
                <button
                    onClick={addDrop}
                    disabled={drops.length >= 5}
                    className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-white/5"
                    title={drops.length >= 5 ? "Max 5 drops allowed" : "Add new drop"}
                >
                    <Plus size={14} /> {drops.length >= 5 ? "Limit Reached" : "Add Drop"}
                </button>
            </div>


            <div className="space-y-4">
                <AnimatePresence>
                    {drops.map((drop, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-black/20 border border-white/5 rounded-lg p-4 relative group"
                        >
                            <button
                                onClick={() => removeDrop(index)}
                                className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                            >
                                <Trash2 size={14} />
                            </button>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                {/* Type Selector */}
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Type</label>
                                    <select
                                        value={drop.type}
                                        onChange={(e) => updateDrop(index, "type", e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    >
                                        <option value="INTERVAL">Interval (Every X min)</option>
                                        <option value="SCHEDULED">Scheduled (Specific Time)</option>
                                        <option value="MANUAL">Manual (Admin Trigger)</option>
                                    </select>
                                </div>

                                {/* Channel Selector */}
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Channel</label>
                                    <select
                                        value={drop.channelId}
                                        onChange={(e) => updateDrop(index, "channelId", e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    >
                                        <option value="" disabled>Select Channel</option>
                                        {channels.map(c => (
                                            <option key={c.id} value={c.id}>#{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Min/Max Amount */}
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Min Amount</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={drop.minAmount}
                                        onChange={(e) => updateDrop(index, "minAmount", parseInt(e.target.value) || 0)}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Max Amount</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={drop.maxAmount}
                                        onChange={(e) => updateDrop(index, "maxAmount", parseInt(e.target.value) || 0)}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    />
                                </div>

                                {/* Expiration */}
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
                                        <Clock size={10} /> Expires (Sec)
                                    </label>
                                    <input
                                        type="number"
                                        min={5}
                                        value={drop.expiration || 60}
                                        onChange={(e) => updateDrop(index, "expiration", parseInt(e.target.value) || 60)}
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    />
                                </div>

                                {/* Dynamic Fields based on Type */}
                                {drop.type === "INTERVAL" && (
                                    <div className="space-y-1 col-span-2 md:col-span-1">
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
                                            <Clock size={10} /> Interval (Minutes)
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={drop.interval || 60}
                                            onChange={(e) => updateDrop(index, "interval", parseInt(e.target.value) || 0)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                        />
                                    </div>
                                )}

                                {drop.type === "SCHEDULED" && (
                                    <div className="space-y-1 col-span-2 md:col-span-1">
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
                                            <Calendar size={10} /> Time (UTC)
                                        </label>
                                        <input
                                            type="time"
                                            value={drop.scheduleTime || "12:00"}
                                            onChange={(e) => updateDrop(index, "scheduleTime", e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                        />
                                    </div>
                                )}

                                {drop.type === "MANUAL" && (
                                    <div className="col-span-2 md:col-span-1 flex flex-col justify-end space-y-1">
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold text-center w-full">Action</label>
                                        <button
                                            onClick={async () => {
                                                if (!drop.id) {
                                                    toast.error("Save the drop first!");
                                                    return;
                                                }
                                                const promise = triggerManualDrop(drop.id);
                                                toast.promise(promise, {
                                                    loading: "Triggering drop...",
                                                    success: "Drop sent!",
                                                    error: (err) => `Failed: ${err}`
                                                });
                                            }}
                                            disabled={!drop.id}
                                            className="w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded px-3 py-2 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Send size={14} /> Send Drop
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {drops.length === 0 && (
                    <div className="text-center py-10 border border-dashed border-white/10 rounded-xl bg-white/5">
                        <Terminal className="mx-auto text-zinc-600 mb-2" size={32} />
                        <p className="text-zinc-500 text-sm">No drops configured.</p>
                        <button
                            onClick={addDrop}
                            className="text-purple-400 hover:text-purple-300 text-xs font-bold mt-2"
                        >
                            + Add First Drop
                        </button>
                    </div>
                )}
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-white/5">
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-500 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-purple-500/20"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Save Drops
                </button>
            </div>
        </div>
    );
}
