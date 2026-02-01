"use client";

import { useState } from "react";
import { addPermission, removePermission } from "@/actions/admin-actions";
import { Loader2, Trash2, Plus, GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";

interface Permission {
    id: string;
    command: string;
    targetType: string;
    targetId: string;
    action: string;
}

interface GranularPermissionsProps {
    guildId: string;
    permissions: Permission[];
}

export function GranularPermissions({ guildId, permissions }: GranularPermissionsProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        command: "",
        targetType: "USER",
        targetId: "",
        action: "ALLOW"
    });

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.command || !formData.targetId) return;

        setIsLoading(true);
        await addPermission(guildId, formData.command, formData.targetType, formData.targetId, formData.action);
        setFormData({ ...formData, command: "", targetId: "" });
        router.refresh();
        setIsLoading(false);
    };

    const handleRemove = async (id: string) => {
        setIsLoading(true);
        await removePermission(id);
        router.refresh();
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            {/* Add New Permission Form */}
            <div className="glass-card border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold font-display text-white mb-4 flex items-center gap-2">
                    <span className="text-yellow-500">🔒</span> Add Permission
                </h3>
                <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3 space-y-1">
                        <label className="text-xs text-zinc-400">Command</label>
                        <input
                            type="text"
                            placeholder="e.g. robbery"
                            value={formData.command}
                            onChange={(e) => setFormData({ ...formData, command: e.target.value.toLowerCase() })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono"
                        />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                        <label className="text-xs text-zinc-400">Type</label>
                        <select
                            value={formData.targetType}
                            onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono"
                        >
                            <option value="USER">User</option>
                            <option value="ROLE">Role</option>
                            <option value="CHANNEL">Channel</option>
                        </select>
                    </div>
                    <div className="md:col-span-4 space-y-1">
                        <label className="text-xs text-zinc-400">Target ID</label>
                        <input
                            type="text"
                            placeholder="Discord ID"
                            value={formData.targetId}
                            onChange={(e) => setFormData({ ...formData, targetId: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono"
                        />
                    </div>
                    <div className="md:col-span-3">
                        <button
                            type="submit"
                            disabled={isLoading || !formData.command || !formData.targetId}
                            className="w-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-4 py-2 rounded-lg hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                            Add Rule
                        </button>
                    </div>
                </form>
            </div>

            {/* Permissions List */}
            <div className="space-y-2">
                {permissions.map((p) => (
                    <div key={p.id} className="flex items-center justify-between glass-card p-4 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-yellow-500/10 rounded text-yellow-500">
                                <GripVertical size={16} />
                            </div>
                            <div>
                                <h4 className="text-sm font-mono text-white font-bold">{p.command}</h4>
                                <div className="flex gap-2 text-xs text-zinc-500 mt-1">
                                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">{p.targetType}</span>
                                    <span className="font-mono">{p.targetId}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded border border-green-500/20">
                                {p.action}
                            </span>
                            <button
                                onClick={() => handleRemove(p.id)}
                                disabled={isLoading}
                                className="text-zinc-600 hover:text-red-500 transition-colors p-2"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}

                {permissions.length === 0 && (
                    <div className="text-center py-10 text-zinc-500">
                        No granular permissions configured.
                    </div>
                )}
            </div>
        </div>
    );
}
