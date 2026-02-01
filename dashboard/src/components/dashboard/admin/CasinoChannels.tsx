"use client";

import { useState } from "react";
import { updateCasinoChannels } from "@/actions/admin-actions";
import { Loader2, Plus, Trash2, Hash } from "lucide-react";
import { useRouter } from "next/navigation";

interface CasinoChannelsProps {
    guildId: string;
    channels: string[];
}

export function CasinoChannels({ guildId, channels }: CasinoChannelsProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [channelId, setChannelId] = useState("");

    const handleAdd = async () => {
        if (!channelId.trim()) return;
        if (channels.length >= 10) {
            alert("Max 10 channels allowed.");
            return;
        }
        if (channels.includes(channelId)) return;

        setIsLoading(true);
        const newList = [...channels, channelId];
        await updateCasinoChannels(guildId, newList);
        setChannelId("");
        router.refresh();
        setIsLoading(false);
    };

    const handleRemove = async (id: string) => {
        setIsLoading(true);
        const newList = channels.filter(c => c !== id);
        await updateCasinoChannels(guildId, newList);
        router.refresh();
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="glass-card border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold font-display text-white mb-2 flex items-center gap-2">
                    <span className="text-blue-500">#</span> Casino Channel Whitelist
                </h3>
                <p className="text-sm text-zinc-400 mb-6">If list is empty, bot works in ALL channels.</p>

                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        placeholder="Channel ID"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 font-mono"
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    />
                    <button
                        onClick={handleAdd}
                        disabled={isLoading || !channelId}
                        className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-4 py-2 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    {channels.length === 0 ? (
                        <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-lg text-center text-blue-400 text-sm">
                            No restrictions enabled. Bot is active everywhere.
                        </div>
                    ) : (
                        channels.map(id => (
                            <div key={id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 group">
                                <div className="flex items-center gap-3">
                                    <Hash size={16} className="text-zinc-600" />
                                    <code className="text-zinc-300 font-mono text-sm">{id}</code>
                                </div>
                                <button
                                    onClick={() => handleRemove(id)}
                                    disabled={isLoading}
                                    className="text-zinc-600 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
