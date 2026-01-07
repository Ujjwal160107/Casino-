"use client";

import { motion } from "framer-motion";
import { type DiscordGuild } from "@/lib/discord";
import { useRouter } from "next/navigation";
import { ServerPokerChip } from "./ServerPokerChip";

interface ServerListProps {
    guilds: DiscordGuild[];
}

export function ServerList({ guilds }: ServerListProps) {
    const router = useRouter();

    if (guilds.length === 0) {
        return (
            <div className="text-center py-20 bg-zinc-900/50 rounded-3xl border border-white/5 backdrop-blur-sm">
                <div className="w-20 h-20 bg-zinc-800 rounded-full mx-auto flex items-center justify-center mb-6">
                    <span className="text-4xl">🃏</span>
                </div>
                <h2 className="text-2xl font-bold text-zinc-200 mb-2 font-serif">No Tables Found</h2>
                <p className="text-zinc-400 max-w-md mx-auto">
                    We couldn't find any servers where you're an admin and Fortuna is present.
                    <br /><br />
                    <span className="text-yellow-500">Tip:</span> Invite Fortuna to your server first!
                </p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-wrap items-center justify-center gap-12 p-8"
            >
                {guilds.map((guild, index) => (
                    <ServerPokerChip
                        key={guild.id}
                        guild={guild}
                        index={index}
                        onClick={() => router.push(`/dashboard/${guild.id}`)}
                    />
                ))}
            </motion.div>
        </div>
    );
}
