"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameConfigForm } from "./GameConfigForm";
import { updateGlobalGameCooldown } from "@/actions/game-actions";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dices, Crown, LayoutGrid, Coins, Sword, Skull } from "lucide-react";

import { DurationInput } from "../ui/DurationInput";

interface GlobalCooldownInputProps {
    guildId: string;
}

function GlobalCooldownInput({ guildId }: GlobalCooldownInputProps) {
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    const handleUpdate = async () => {
        setLoading(true);
        try {
            const result = await updateGlobalGameCooldown(guildId, cooldown);
            if (result.success) {
                toast.success("Global cooldown updated for all games!");
                setCooldown(0);
            } else {
                toast.error(result.error || "Failed to update.");
            }
        } catch (e) {
            toast.error("Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <div className="w-[320px]">
                <DurationInput
                    value={cooldown}
                    onChange={setCooldown}
                    label=""
                />
            </div>
            <button
                onClick={handleUpdate}
                disabled={loading}
                className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 h-full mt-1"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Set All
            </button>
        </div>
    );
}

interface GameData {
    key: string;
    name: string;
    settings: any;
}

interface GamesPanelProps {
    guildId: string;
    games: GameData[];
    globalLimits: {
        min: number;
        max: number;
    };
}

const ICONS: Record<string, any> = {
    blackjack: Crown,
    roulette: Dices,
    slots: LayoutGrid,
    coinflip: Coins,
    cockfight: Sword,
    russianRoulette: Skull
};

export function GamesPanel({ guildId, games, globalLimits }: GamesPanelProps) {
    const [selectedGame, setSelectedGame] = useState(games[0].key);

    const activeGame = games.find(g => g.key === selectedGame) || games[0];

    return (
        <div className="space-y-6">
            {/* Global Settings */}
            <div className="bg-gradient-to-r from-violet-900/20 to-indigo-900/20 border border-violet-500/20 rounded-xl p-6 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Crown className="w-5 h-5 text-yellow-500" />
                            Global Game Cooldown
                        </h3>
                        <p className="text-sm text-zinc-400">Set a unified cooldown timer for all casino games at once.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <GlobalCooldownInput guildId={guildId} />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 pb-4 border-b border-white/5">
                {games.map((game) => {
                    const Icon = ICONS[game.key] || Dices;
                    const isSelected = selectedGame === game.key;

                    return (
                        <button
                            key={game.key}
                            onClick={() => setSelectedGame(game.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all border",
                                isSelected
                                    ? "bg-yellow-500 text-black border-yellow-500 shadow-lg shadow-yellow-500/20"
                                    : "bg-zinc-900 text-zinc-400 border-white/5 hover:text-white hover:bg-zinc-800"
                            )}
                        >
                            <Icon size={16} />
                            {game.name}
                        </button>
                    );
                })}
            </div>

            {/* Content area with animation */}
            <div className="min-h-[400px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={selectedGame}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        <GameConfigForm
                            guildId={guildId}
                            gameKey={activeGame.key}
                            gameName={activeGame.name}
                            initialSettings={activeGame.settings}
                            globalLimits={globalLimits}
                            key={activeGame.key} // Force re-mount on change to reset internal state if needed
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
