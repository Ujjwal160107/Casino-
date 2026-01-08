"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Users, TrendingUp, Dice5 } from "lucide-react";
import Image from "next/image";

// Defined globally to match Hero usage
const CARDS = [
    {
        id: "crime",
        title: "High Stakes Crime",
        description: "Manage jail times, bail amounts, and track the city's most wanted criminals.",
        icon: ShieldAlert,
        color: "from-red-500 to-orange-600",
        image: "/cards/card_crime.png" // Placeholder or reusable asset
    },
    {
        id: "social",
        title: "Social Life",
        description: "Oversee marriages, families, and social interactions within your servers.",
        icon: Users,
        color: "from-pink-500 to-rose-600",
        image: "/cards/card_social.png"
    },
    {
        id: "economy",
        title: "Global Economy",
        description: "Monitor inflation, user balances, and marketplace transactions in real-time.",
        icon: TrendingUp,
        color: "from-emerald-500 to-teal-600",
        image: "/cards/card_economy.png"
    },
    {
        id: "casino",
        title: "Casino Royale",
        description: "Analyze betting patterns, game usage, and house edge statistics.",
        icon: Dice5,
        color: "from-amber-400 to-yellow-600",
        image: "/cards/card_casino.png"
    }
];

export function InteractiveCardDeck() {
    const [isSpread, setIsSpread] = useState(false);
    const [flippedIndices, setFlippedIndices] = useState<number[]>([]);

    const handleDeckClick = () => {
        if (!isSpread) {
            setIsSpread(true);
        } else {
            // Optional: clicking center again could collapse, but we'll use a close button/background for better UX
            // setIsSpread(false);
        }
    };

    const handleCardClick = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isSpread) {
            setIsSpread(true);
            return;
        }

        setFlippedIndices((prev) => {
            if (prev.includes(index)) {
                return prev.filter((i) => i !== index);
            }
            return [...prev, index];
        });
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSpread(false);
        setFlippedIndices([]); // Reset flips on close
    };

    return (
        <div className="relative w-full h-[600px] flex items-center justify-center perspective-1000">
            {/* Clickable Backdrop to close spread */}
            {isSpread && (
                <div
                    className="absolute inset-0 z-0 cursor-pointer"
                    onClick={handleClose}
                />
            )}

            {/* Hint Text */}
            {!isSpread && (
                <div className="absolute top-10 text-zinc-500 text-sm font-mono animate-pulse">
                    &lt; Click Deck to Deal &gt;
                </div>
            )}

            <div
                className="relative w-full h-full flex items-center justify-center"
                onClick={handleDeckClick}
            >
                {CARDS.map((card, index) => {
                    const isFlipped = flippedIndices.includes(index);

                    // Spread Calculations
                    const totalCards = CARDS.length;
                    // Spread: -45deg to +45deg
                    const angleStep = 60 / (totalCards - 1);
                    const baseAngle = -30 + (index * angleStep);

                    // Stacked: subtle randomness
                    const stackAngle = (index % 2 === 0 ? -2 : 2) * (index + 1);
                    const stackX = index * 4;
                    const stackY = index * -4;

                    // Final Transforms
                    const rotate = isSpread ? baseAngle : stackAngle;
                    // Move cards out along the radius when spread
                    const x = isSpread ? Math.sin(baseAngle * (Math.PI / 180)) * 300 : stackX;
                    const y = isSpread ? -Math.cos(baseAngle * (Math.PI / 180)) * 200 + 100 : stackY;

                    return (
                        <motion.div
                            key={card.id}
                            initial={false}
                            animate={{
                                x: x,
                                y: y,
                                rotate: rotate,
                                scale: isSpread ? 1 : 1 - index * 0.05,
                                zIndex: isSpread ? 10 + index : totalCards - index,
                            }}
                            transition={{
                                type: "spring",
                                stiffness: 200,
                                damping: 20,
                                delay: isSpread ? index * 0.05 : 0
                            }}
                            className="absolute w-[280px] h-[420px] cursor-pointer group"
                            onClick={(e) => handleCardClick(index, e)}
                            whileHover={isSpread ? { scale: 1.1, zIndex: 50, rotate: 0 } : {}}
                        >
                            <motion.div
                                className="w-full h-full relative preserve-3d transition-all duration-500"
                                animate={{ rotateY: isFlipped ? 180 : 0 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                style={{ transformStyle: "preserve-3d" }}
                            >
                                {/* Front Face (Face Down / Card Back) */}
                                <div className="absolute inset-0 backface-hidden w-full h-full rounded-2xl overflow-hidden border-4 border-yellow-900/50 shadow-2xl bg-zinc-900">
                                    <Image
                                        src="/card_back.png"
                                        alt="Back"
                                        fill
                                        className="object-cover"
                                    />
                                    {/* Texture Overlay */}
                                    <div className="absolute inset-0 bg-black/20" />
                                </div>

                                {/* Back Face (Revealed Content) */}
                                <div
                                    className="absolute inset-0 backface-hidden w-full h-full rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900"
                                    style={{ transform: "rotateY(180deg)" }}
                                >
                                    <Image
                                        src={card.image}
                                        alt={card.title}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Close Button (Optional UX aid) */}
            {isSpread && (
                <button
                    onClick={handleClose}
                    className="absolute bottom-10 px-6 py-2 rounded-full bg-zinc-800/80 text-white font-mono text-sm backdrop-blur border border-white/10 hover:bg-zinc-700 transition-colors z-50"
                >
                    Close Hand
                </button>
            )}
        </div>
    );
}
