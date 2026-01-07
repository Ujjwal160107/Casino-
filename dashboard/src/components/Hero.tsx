
"use client";

import { motion } from "framer-motion";
import { signIn } from "next-auth/react";
import { ArrowRight, LayoutDashboard, ExternalLink } from "lucide-react";
import { PokerCard } from "./PokerCard";
import { FloatingParticles } from "./FloatingParticles";

export function Hero() {
    return (
        <div className="relative min-h-screen flex flex-col items-center overflow-x-hidden font-sans">
            {/* Background Image with Overlay */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat fixed"
                style={{ backgroundImage: 'url("/fortuna_world.jpg")' }}
            >
                <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-[1px]" />
                <FloatingParticles />
            </div>

            <div className="relative z-10 flex flex-col items-center px-4 max-w-7xl mx-auto text-center pt-24 pb-12">

                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="text-7xl md:text-9xl font-black tracking-tighter text-white mb-6 drop-shadow-2xl relative"
                >
                    FORTUNA
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="text-zinc-300 text-xl md:text-2xl mb-12 max-w-2xl mx-auto font-medium drop-shadow-md"
                >
                    Control your economy, manage servers, and analyze data from one central command center.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="flex flex-col sm:flex-row gap-4 mb-24"
                >
                    <button
                        onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
                        className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground text-lg font-bold rounded-xl shadow-lg shadow-black/20 hover:bg-primary/90 transition-all hover:-tranzinc-y-1 active:tranzinc-y-0"
                    >
                        <LayoutDashboard className="w-6 h-6" />
                        <span>Enter Dashboard</span>
                        <ArrowRight className="w-5 h-5 group-hover:tranzinc-x-1 transition-transform" />
                    </button>

                    <a
                        href="https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot" // TODO: Add actual invite link
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-zinc-800 border border-zinc-700 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-zinc-700 transition-all hover:-tranzinc-y-1 active:tranzinc-y-0"
                    >
                        <ExternalLink className="w-6 h-6" />
                        <span>Add to Discord</span>
                    </a>
                </motion.div>

                {/* Game Features - Poker Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 perspective-1000">
                    <PokerCard
                        index={0}
                        suit="spade"
                        rank="Q"
                        title="High Stakes Crime"
                        description="Manage jail times, bail amounts, and track the city's most wanted criminals."
                        imageSrc="/cards/card_crime.png"
                    />
                    <PokerCard
                        index={1}
                        suit="heart"
                        rank="K"
                        title="Social Life"
                        description="Oversee marriages, families, and social interactions within your servers."
                        imageSrc="/cards/card_social.png"
                    />
                    <PokerCard
                        index={2}
                        suit="diamond"
                        rank="A"
                        title="Global Economy"
                        description="Monitor inflation, user balances, and marketplace transactions in real-time."
                        imageSrc="/cards/card_economy.png"
                    />
                    <PokerCard
                        index={3}
                        suit="club"
                        rank="J"
                        title="Casino Royale"
                        description="Analyze betting patterns, game usage, and house edge statistics."
                        imageSrc="/cards/card_casino.png"
                    />
                </div>

            </div>
        </div>
    );
}

