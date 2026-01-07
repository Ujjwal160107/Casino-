"use client";

import { motion } from "framer-motion";
import { type DiscordGuild } from "@/lib/discord";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ServerPokerChipProps {
    guild: DiscordGuild;
    onClick: () => void;
    index: number;
}

export function ServerPokerChip({ guild, onClick, index }: ServerPokerChipProps) {
    // Generate a consistent "suit" color based on index or guild ID
    // Generate a consistent "suit" color based on index or guild ID
    // All monochrome + Gold accent theme now
    const colors = [
        "from-zinc-800 to-zinc-950",
        "from-zinc-900 to-black",
        "from-zinc-700 to-zinc-900",
        "from-zinc-800 to-zinc-950",
        "from-zinc-900 to-black",
    ];
    const colorClass = colors[index % colors.length];

    // Edge stripe pattern for poker chip look
    // Using a repeating conic gradient for the stripes
    const stripeGradient = "repeating-conic-gradient(transparent 0deg 20deg, rgba(255,255,255,0.2) 20deg 40deg)";

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, rotate: -180 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{
                type: "spring",
                stiffness: 100,
                damping: 15,
                delay: index * 0.1
            }}
            whileHover={{
                scale: 1.1,
                rotate: 5,
                y: -10,
                boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)"
            }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className="flex flex-col items-center gap-4 group cursor-pointer"
        >
            {/* The Chip */}
            <div className={cn(
                "relative w-40 h-40 rounded-full shadow-2xl flex items-center justify-center p-4",
                "bg-gradient-to-br border-4 border-white/10",
                colorClass
            )}>
                {/* Edge Stripes Overlay */}
                <div
                    className="absolute inset-0 rounded-full opacity-50 pointer-events-none"
                    style={{ background: stripeGradient }}
                />

                {/* Inner Metallic Ring */}
                <div className="absolute inset-2 rounded-full border-4 border-dashed border-yellow-500/50 opacity-100" />

                {/* Inner White/Gold Circle Container */}
                <div className="relative w-full h-full rounded-full bg-zinc-950 border-4 border-yellow-500/80 shadow-inner flex items-center justify-center overflow-hidden z-10">

                    {/* Guild Icon */}
                    {guild.icon ? (
                        <Image
                            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                            fill
                            alt={guild.name}
                            className="object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                    ) : (
                        <div className="text-4xl font-bold text-yellow-500 font-serif">
                            {guild.name.charAt(0)}
                        </div>
                    )}

                    {/* Gloss Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>
            </div>

            {/* Label */}
            <div className="text-center">
                <h3 className="text-lg font-bold text-zinc-200 group-hover:text-yellow-400 transition-colors font-serif tracking-wide shadow-black drop-shadow-md">
                    {guild.name}
                </h3>
                <span className="text-xs text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">
                    Admin Access
                </span>
            </div>
        </motion.div>
    );
}
