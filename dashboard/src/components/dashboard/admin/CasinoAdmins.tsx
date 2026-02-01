"use client";

import { useState } from "react";
import { addCasinoAdmin, removeCasinoAdmin } from "@/actions/admin-actions";
import { Loader2, Plus, Trash2, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface CasinoAdminsProps {
    guildId: string;
    initialAdmins: { discordId: string; username: string }[];
}

export function CasinoAdmins({ guildId, initialAdmins }: CasinoAdminsProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [newAdminId, setNewAdminId] = useState("");

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminId) return;

        setIsLoading(true);
        const res = await addCasinoAdmin(guildId, newAdminId);
        if (res.success) {
            toast.success("Casino Admin added successfully.");
            setNewAdminId("");
            router.refresh();
        } else {
            toast.error(res.error || "Failed to add admin.");
        }
        setIsLoading(false);
    };

    const handleRemove = async (discordId: string) => {
        setIsLoading(true);
        const res = await removeCasinoAdmin(guildId, discordId);
        if (res.success) {
            toast.success("Casino Admin removed.");
            router.refresh();
        } else {
            toast.error(res.error || "Failed to remove admin.");
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="glass-card border border-white/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-lg bg-red-500/10 text-red-500">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold font-display text-white">Casino Admins</h2>
                        <p className="text-sm text-zinc-400">Users with access to casino management commands.</p>
                    </div>
                </div>

                {/* Add Form */}
                <form onSubmit={handleAdd} className="flex gap-2 mb-6">
                    <input
                        type="text"
                        placeholder="Discord User ID"
                        value={newAdminId}
                        onChange={(e) => setNewAdminId(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-red-500/50 font-mono text-sm"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !newAdminId}
                        className="bg-red-500 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                        Add
                    </button>
                </form>

                {/* List */}
                <div className="space-y-2">
                    {initialAdmins.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-sm bg-white/5 rounded-lg border border-white/5 border-dashed">
                            No Casino Admins assigned.
                        </div>
                    ) : (
                        initialAdmins.map((admin) => (
                            <div key={admin.discordId} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                                        <User size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{admin.username}</p>
                                        <p className="text-xs text-zinc-500 font-mono">{admin.discordId}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemove(admin.discordId)}
                                    disabled={isLoading}
                                    className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Remove Admin"
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
