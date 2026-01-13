"use client";

import { useState } from "react";
import { updateChatMoneyConfig } from "@/actions/admin-actions";
import { Loader2, Save, Hash, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { DurationInput } from "../ui/DurationInput";
import { toast } from "sonner";

interface ChatMoneyConfigProps {
    guildId: string;
    config: {
        min: number;
        max: number;
        interval: number;
        channels: string[];
    };
}

export function ChatMoneyConfig({ guildId, config }: ChatMoneyConfigProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        min: config.min,
        max: config.max,
        interval: config.interval,
        channels: config.channels || [],
    });
    const [newChannel, setNewChannel] = useState("");

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateChatMoneyConfig(guildId, formData);
            toast.success("Chat money settings updated!");
            router.refresh();
        } catch (error) {
            toast.error("Failed to update chat money.");
        }
        setIsLoading(false);
    };

    const handleAddChannel = () => {
        if (!newChannel.trim() || formData.channels.includes(newChannel)) return;
        setFormData(prev => ({ ...prev, channels: [...prev.channels, newChannel.trim()] }));
        setNewChannel("");
    };

    const handleRemoveChannel = (id: string) => {
        setFormData(prev => ({ ...prev, channels: prev.channels.filter(c => c !== id) }));
    };

    return (
        <div className="space-y-8">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="text-green-400">$</span> Chat Money Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Min Amount</label>
                        <input
                            type="number"
                            value={formData.min}
                            onChange={(e) => setFormData({ ...formData, min: parseInt(e.target.value) || 0 })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Max Amount</label>
                        <input
                            type="number"
                            value={formData.max}
                            onChange={(e) => setFormData({ ...formData, max: parseInt(e.target.value) || 0 })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white"
                        />
                    </div>
                </div>

                <div className="space-y-2 bg-black/20 p-4 rounded-lg border border-white/5">
                    <DurationInput
                        value={formData.interval}
                        onChange={(val) => setFormData({ ...formData, interval: val })}
                        label="Cooldown / Interval"
                    />
                    <p className="text-xs text-zinc-500">Time between earning money messages.</p>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                    <label className="text-sm font-medium text-zinc-400">Allowed Channels</label>
                    <p className="text-xs text-zinc-500 mb-2">If empty, chat money works in ALL channels.</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newChannel}
                            onChange={(e) => setNewChannel(e.target.value)}
                            placeholder="Channel ID"
                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white font-mono"
                            onKeyDown={(e) => e.key === "Enter" && handleAddChannel()}
                        />
                        <button
                            onClick={handleAddChannel}
                            disabled={!newChannel}
                            className="bg-white/5 text-white border border-white/10 px-4 py-2 rounded-lg hover:bg-white/10"
                        >
                            <Plus size={20} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        {formData.channels.map(id => (
                            <div key={id} className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-white/5">
                                <div className="flex items-center gap-3">
                                    <Hash size={16} className="text-zinc-600" />
                                    <code className="text-zinc-300 font-mono text-sm">{id}</code>
                                </div>
                                <button
                                    onClick={() => handleRemoveChannel(id)}
                                    className="text-zinc-600 hover:text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
