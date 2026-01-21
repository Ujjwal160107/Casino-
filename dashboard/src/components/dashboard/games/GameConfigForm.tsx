"use client";

import { useState } from "react";
import { updateGameSettings } from "@/actions/game-actions";
import { Loader2, Save, Dices, Clock, AlertCircle } from "lucide-react";
import { DurationInput } from "../ui/DurationInput";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface GameConfigFormProps {
    guildId: string;
    gameKey: string;
    gameName: string;
    initialSettings: {
        minBet: number;
        maxBet: number;
        cooldown: number;
        rouletteSpinTime?: number;
        cockfightBetTime?: number;
        chickenHealCost?: number;
        chickenTrainBaseCost?: number;
        chickenTrainMultiplier?: number;
        enabled: boolean;
    };
    globalLimits: {
        min: number;
        max: number;
    };
}

export function GameConfigForm({ guildId, gameKey, gameName, initialSettings, globalLimits }: GameConfigFormProps) {
    const [isLoading, setIsLoading] = useState(false);

    // Auto-set default max bet if 0
    const [settings, setSettings] = useState(() => ({
        ...initialSettings,
        maxBet: initialSettings.maxBet === 0 ? globalLimits.max : initialSettings.maxBet
    }));

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await updateGameSettings(guildId, gameKey, settings);
            if (result.success) {
                toast.success(`${gameName} settings updated!`);
            } else {
                toast.error(result.error || "Failed to update settings.");
            }
        } catch (error) {
            toast.error("An error occurred.");
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-500">
                            <Dices size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{gameName} Configuration</h2>
                            <p className="text-sm text-zinc-400">Manage betting limits and cooldowns for {gameName}.</p>
                        </div>
                    </div>

                    {/* Enable Toggle */}
                    <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${settings.enabled ? "text-green-400" : "text-red-400"}`}>
                            {settings.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                            className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${settings.enabled ? "bg-green-500" : "bg-zinc-700"
                                }`}
                        >
                            <span
                                className={`absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${settings.enabled ? "translate-x-5" : "translate-x-0"
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Max Bet */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                            Max Bet (Coins)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={settings.maxBet}
                                onChange={(e) => setSettings({ ...settings, maxBet: parseInt(e.target.value) || 0 })}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setSettings({ ...settings, maxBet: globalLimits.max })}
                                className="absolute right-3 top-2.5 text-[10px] text-zinc-500 font-mono hover:text-yellow-500 bg-white/5 px-2 py-0.5 rounded cursor-pointer transition-colors"
                            >
                                Reset to Global: {globalLimits.max}
                            </button>
                        </div>
                        <p className="text-xs text-zinc-500">
                            Maximum amount a user can bet in one game.
                        </p>
                    </div>

                    {/* Min Bet */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                            Min Bet (Coins)
                        </label>
                        <input
                            type="number"
                            value={settings.minBet}
                            onChange={(e) => setSettings({ ...settings, minBet: parseInt(e.target.value) || 0 })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                        />
                        <p className="text-xs text-zinc-500">
                            Minimum amount required to play. Global Min: {globalLimits.min}
                        </p>
                    </div>

                    {/* Cooldown */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2 mb-2">
                            <Clock size={14} /> Cooldown
                        </label>
                        <DurationInput
                            value={settings.cooldown}
                            onChange={(val) => setSettings({ ...settings, cooldown: val })}
                        />
                        <p className="text-xs text-zinc-500 mt-2">
                            Time a user must wait between games.
                        </p>
                    </div>

                    {/* Specifics */}
                    {gameKey === "roulette" && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                                Spin Time (Seconds)
                            </label>
                            <input
                                type="number"
                                value={settings.rouletteSpinTime || 0}
                                onChange={(e) => setSettings({ ...settings, rouletteSpinTime: parseInt(e.target.value) || 0 })}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                            />
                            <p className="text-xs text-zinc-500">
                                Duration of the roulette spin animation.
                            </p>
                        </div>
                    )}

                    {gameKey === "cockfight" && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                                Betting Time (Seconds)
                            </label>
                            <input
                                type="number"
                                value={settings.cockfightBetTime || 0}
                                onChange={(e) => setSettings({ ...settings, cockfightBetTime: parseInt(e.target.value) || 0 })}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                            />
                            <p className="text-xs text-zinc-500">
                                Duration of the betting phase before the fight starts.
                            </p>
                        </div>
                    )}

                    {gameKey === "cockfight" && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                                    Chicken Heal Cost
                                </label>
                                <input
                                    type="number"
                                    value={settings.chickenHealCost || 0}
                                    onChange={(e) => setSettings({ ...settings, chickenHealCost: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                                />
                                <p className="text-xs text-zinc-500">
                                    Cost to heal an injured chicken.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                                    Training Base Cost
                                </label>
                                <input
                                    type="number"
                                    value={settings.chickenTrainBaseCost || 0}
                                    onChange={(e) => setSettings({ ...settings, chickenTrainBaseCost: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                                />
                                <p className="text-xs text-zinc-500">
                                    Base cost for training a chicken.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                                    Training Multiplier
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={settings.chickenTrainMultiplier || 0}
                                    onChange={(e) => setSettings({ ...settings, chickenTrainMultiplier: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                                />
                                <p className="text-xs text-zinc-500">
                                    Cost multiplier per training level (e.g., 0.5).
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end pt-6 mt-6 border-t border-white/5">
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="bg-yellow-500 text-black px-6 py-2.5 rounded-lg hover:bg-yellow-400 font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-yellow-500/20"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Save Settings
                    </button>
                </div>
            </div>
        </div >
    );
}
