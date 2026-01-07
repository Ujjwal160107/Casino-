"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { Club, Diamond, Heart, Spade } from "lucide-react";

interface PokerCardProps {
    suit: "spade" | "heart" | "diamond" | "club";
    rank: string;
    title: string;
    description: string;
    index: number;
}

const suitIcons = {
    spade: Spade,
    heart: Heart,
    diamond: Diamond,
    club: Club,
};

const suitColors = {
    spade: "text-zinc-900 dark:text-zinc-100",
    club: "text-zinc-900 dark:text-zinc-100",
    heart: "text-red-600",
    diamond: "text-red-600",
};

export function PokerCard({ suit, rank, title, description, index, imageSrc }: PokerCardProps & { imageSrc?: string }) {
    const Icon = suit ? suitIcons[suit] : null;
    const colorClass = suit ? suitColors[suit] : "";

    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useTransform(y, [-100, 100], [10, -10]);
    const rotateY = useTransform(x, [-100, 100], [-10, 10]);

    function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        x.set(event.clientX - centerX);
        y.set(event.clientY - centerY);
    }

    function handleMouseLeave() {
        x.set(0);
        y.set(0);
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, rotate: -5 }}
            animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -2 : 2 }}
            whileHover={{ y: -20, rotate: 0, scale: 1.05, zIndex: 10 }}
            style={{ perspective: 1000, rotateX, rotateY }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={cn(
                "relative w-64 h-[22rem] rounded-xl shadow-2xl overflow-hidden group cursor-pointer transform-gpu preserve-3d",
                !imageSrc && "bg-white dark:bg-zinc-100 border-4 border-zinc-200 dark:border-zinc-300",
                !imageSrc && colorClass
            )}
        >
            {imageSrc ? (
                // Image Card
                <div className="relative w-full h-full">
                    <img
                        src={imageSrc}
                        alt={title}
                        className="w-full h-full object-cover pointer-events-none select-none"
                    />
                    {/* Shadow Overlay for depth instead of gloss */}
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 pointer-events-none" />
                </div>
            ) : (
                // Constructed Card (Legacy/Fallback)
                <>
                    {/* Card Corner Top-Left */}
                    <div className="absolute top-2 left-3 flex flex-col items-center leading-none">
                        <span className="text-3xl font-bold font-serif">{rank}</span>
                        {Icon && <Icon className="w-6 h-6" fill="currentColor" />}
                    </div>

                    {/* Card Corner Bottom-Right (Rotated) */}
                    <div className="absolute bottom-2 right-3 flex flex-col items-center leading-none rotate-180">
                        <span className="text-3xl font-bold font-serif">{rank}</span>
                        {Icon && <Icon className="w-6 h-6" fill="currentColor" />}
                    </div>

                    {/* Center Content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-200 flex items-center justify-center mb-4 shadow-inner">
                            {Icon && <Icon className="w-10 h-10 opacity-80" />}
                        </div>
                        <h3 className="text-xl font-bold text-zinc-900 mb-2 font-serif">{title}</h3>
                        <p className="text-sm text-zinc-600 font-medium leading-relaxed">
                            {description}
                        </p>
                    </div>

                    {/* Subtle Texture instead of Gloss */}
                    <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
                </>
            )}
        </motion.div>
    );
}
