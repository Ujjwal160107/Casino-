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
    const [activeIndex, setActiveIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const activeCard = CARDS[activeIndex];

    const handleNext = () => {
        setIsFlipped(false); // Flip back to face down
        setTimeout(() => {
            setActiveIndex((prev) => (prev + 1) % CARDS.length);
        }, 300);
    };

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
    };

    return (
        <div className="relative w-full h-[500px] flex items-center justify-center perspective-1000">
            {/* Background/Stack Cards (Face Down) */}
            <div className="absolute inset-0 flex items-center justify-center z-0">
                {[1, 2].map((offset) => {
                    return (
                        <div
                            key={offset}
                            className="absolute w-[300px] h-[450px] rounded-2xl border-2 border-zinc-900 shadow-2xl overflow-hidden"
                            style={{
                                transform: `translateX(${offset * 12}px) translateY(${offset * 8}px) rotate(${offset * 4}deg) scale(${1 - offset * 0.05})`,
                                zIndex: -offset,
                            }}
                        >
                            <Image
                                src="/card_back.png"
                                alt="Card Back"
                                fill
                                className="object-cover"
                            />
                            <div className="absolute inset-0 bg-black/20" />
                        </div>
                    );
                })}
            </div>

            {/* Main Active Card */}
            <div
                className="relative w-[300px] h-[450px] cursor-pointer group z-10"
                onClick={handleFlip}
            >
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-zinc-500 text-sm font-mono animate-pulse whitespace-nowrap">
                    {isFlipped ? "Click Next ->" : "< Click to Reveal >"}
                </div>

                <motion.div
                    className="w-full h-full relative preserve-3d transition-all duration-500"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    style={{ transformStyle: "preserve-3d" }}
                >
                    {/* Front Face (Face Down / Card Back) */}
                    <div className="absolute inset-0 backface-hidden w-full h-full rounded-2xl overflow-hidden border-4 border-yellow-900/50 shadow-2xl">
                        <Image
                            src="/card_back.png"
                            alt="Lady Fortuna"
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>

                    {/* Back Face (Revealed Content) */}
                    <div
                        className="absolute inset-0 backface-hidden w-full h-full rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900"
                        style={{ transform: "rotateY(180deg)" }}
                    >
                        {/* Full Bleed Feature Image */}
                        <Image
                            src={activeCard.image}
                            alt={activeCard.title}
                            fill
                            className="object-cover"
                        />

                        {/* Overlay for Text Readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col items-center justify-end p-6 text-center">

                            <div className="mb-4 p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                                <activeCard.icon className="text-white w-8 h-8" />
                            </div>

                            <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-wider drop-shadow-lg">{activeCard.title}</h3>
                            <p className="text-zinc-200 text-sm leading-relaxed mb-6 font-medium drop-shadow-md">
                                {activeCard.description}
                            </p>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNext();
                                }}
                                className="px-6 py-2 rounded-full bg-white text-black font-bold hover:bg-primary hover:scale-105 transition-all shadow-lg"
                            >
                                Next Feature
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
