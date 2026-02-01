"use client";

import { useState } from "react";
import { updateDisabledCommands } from "@/actions/admin-actions";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface GlobalDisablesProps {
    guildId: string;
    disabledCommands: string[];
}

const AVAILABLE_COMMANDS = [
    // Economy
    "balance", "bank", "deposit", "withdraw", "transfer", "c rime", "rob", "work", "shop", "buy",
    "inventory", "use", "leaderboard", "daily", "weekly", "monthly", "collect", "pay-bail", "jail",
    "stock", "my-stocks", "properties", "buy-property", "sell-property", "my-properties", "collect-rent",

    // Games
    "slots", "roulette", "blackjack", "coinflip", "cockfight", "russian-roulette", "chicken", "feed",
    "race", "bet",

    // Life/Social
    "marry", "divorce", "family", "propose", "education", "enroll", "study", "exam", "degrees",
    "jobs", "apply", "resign", "retirement",

    // Admin/Config (Some might be critical, but including non-critical ones)
    "add-money", "remove-money", "set-money", "reset-economy", "give-item", "remove-item",
    "set-income", "set-rob", "set-shop", "add-shop-item", "remove-shop-item"
].sort();

export function GlobalDisables({ guildId, disabledCommands }: GlobalDisablesProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCmd, setSelectedCmd] = useState("");

    const handleAdd = async () => {
        if (!selectedCmd) return;
        if (disabledCommands.includes(selectedCmd)) return;

        setIsLoading(true);
        const newList = [...disabledCommands, selectedCmd];
        await updateDisabledCommands(guildId, newList);
        setSelectedCmd("");
        setIsLoading(false);
        router.refresh();
    };

    const handleRemove = async (cmd: string) => {
        setIsLoading(true);
        const newList = disabledCommands.filter(c => c !== cmd);
        await updateDisabledCommands(guildId, newList);
        router.refresh();
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="glass-card border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-bold font-display text-white mb-4 flex items-center gap-2">
                    <span className="text-red-500">🚫</span> Global Disabled Commands
                </h3>

                <div className="flex gap-2 mb-6">
                    <div className="relative flex-1">
                        <select
                            value={selectedCmd}
                            onChange={(e) => setSelectedCmd(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white appearance-none focus:outline-none focus:border-red-500/50 cursor-pointer"
                        >
                            <option value="">Select a command to disable...</option>
                            {AVAILABLE_COMMANDS.filter(cmd => !disabledCommands.includes(cmd)).map(cmd => (
                                <option key={cmd} value={cmd} className="bg-[#212831]">
                                    {cmd}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                            ▼
                        </div>
                    </div>

                    <button
                        onClick={handleAdd}
                        disabled={isLoading || !selectedCmd}
                        className="bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {disabledCommands.length === 0 ? (
                        <p className="text-zinc-500 text-sm col-span-full italic">No commands disabled.</p>
                    ) : (
                        disabledCommands.map(cmd => (
                            <div key={cmd} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 group">
                                <code className="text-red-400 font-mono text-sm">{cmd}</code>
                                <button
                                    onClick={() => handleRemove(cmd)}
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
