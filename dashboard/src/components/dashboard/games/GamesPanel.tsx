"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameConfigForm } from "./GameConfigForm";
import { cn } from "@/lib/utils";
import { Dices, Crown, LayoutGrid, Coins, Sword, Skull } from "lucide-react";

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
