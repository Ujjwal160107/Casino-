
"use client";

import { useState } from "react";
import { factoryResetGuild } from "@/actions/admin-actions";
import { AlertTriangle, Trash2, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";

interface FactoryResetZoneProps {
    guildId: string;
}

export function FactoryResetZone({ guildId }: FactoryResetZoneProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleReset = async () => {
        if (confirmText !== "DELETE") return;

        setIsLoading(true);
        try {
            const res = await factoryResetGuild(guildId);
            if (res.success) {
                // Force a hard reload or redirect
                window.location.href = `/dashboard/${guildId}`;
            } else {
                alert("Failed to reset: " + res.error);
                setIsLoading(false);
            }
        } catch (error) {
            alert("An error occurred.");
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold text-red-500 flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" /> Danger Zone
                            </h3>
                            <p className="text-zinc-400 max-w-2xl">
                                Performing a factory reset will permanently delete <strong>ALL</strong> data associated with this server.
                                This includes all user balances, items, shop configurations, job settings, and permissions.
                                <br /><br />
                                <span className="text-red-400 font-bold">This action cannot be undone.</span>
                            </p>
                        </div>
                        <button
                            onClick={() => setIsOpen(true)}
                            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-bold transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 whitespace-nowrap"
                        >
                            <Trash2 size={18} />
                            Factory Reset
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-8 text-center space-y-6">
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                </div>

                <div>
                    <h3 className="text-2xl font-bold text-white mb-2">Are you absolutely sure?</h3>
                    <p className="text-zinc-300 max-w-md mx-auto">
                        This will wipe <strong>everything</strong>. There is no going back.
                        Please type <span className="bg-black/40 px-2 py-0.5 rounded font-mono text-white select-all">DELETE</span> below to confirm.
                    </p>
                </div>

                <div className="max-w-xs mx-auto space-y-4">
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="w-full bg-black/40 border border-red-500/30 rounded-lg px-4 py-3 text-center text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                    />

                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={() => setIsOpen(false)}
                            disabled={isLoading}
                            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleReset}
                            disabled={confirmText !== "DELETE" || isLoading}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-red-600/20 flex items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                            Confirm Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
