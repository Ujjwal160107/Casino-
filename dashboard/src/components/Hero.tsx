
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Book, ExternalLink } from "lucide-react";
import { BackgroundParticles } from "./ui/BackgroundParticles";
import { ScrollReveal } from "./ui/ScrollReveal";
import { InteractiveCardDeck } from "./InteractiveCardDeck";

export function Hero() {
    const inviteUrl = "https://discord.com/oauth2/authorize?client_id=1371816936857669702&permissions=268823672&scope=bot%20applications.commands";

    return (
        <div className="relative min-h-screen flex flex-col justify-center overflow-hidden font-sans bg-background text-foreground selection:bg-primary/30">
            {/* Background Image with Overlay */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat fixed"
                style={{ backgroundImage: 'url("/fortuna_world.jpg")' }}
            >
                <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-[2px]" />
                <BackgroundParticles />
            </div>

            <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-24">

                {/* Left Column: Text & CTA */}
                <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
                    <ScrollReveal direction="left" className="mb-6">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8 }}
                        >
                            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white mb-6 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                BUILD THE <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 animate-gradient-x bg-[length:200%_auto]">
                                    ULTIMATE
                                </span> <br />
                                SERVER.
                            </h1>
                        </motion.div>
                    </ScrollReveal>

                    <ScrollReveal delay={0.2} direction="left" className="mb-10 max-w-xl">
                        <p className="text-lg md:text-xl text-zinc-300 font-light leading-relaxed">
                            Configure moderation, leveling, economy, and casino games for your Discord community.
                        </p>
                    </ScrollReveal>

                    <ScrollReveal delay={0.3} direction="up" className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <a
                            href={inviteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-primary hover:bg-primary/90 text-black text-lg font-bold px-8 py-4 rounded-xl transition-transform hover:scale-105 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <ExternalLink size={20} />
                            Add to Discord
                        </a>
                        <Link
                            href="/docs"
                            className="bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-bold px-8 py-4 rounded-xl transition-transform hover:scale-105 border border-white/10 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <Book size={20} />
                            Documentation
                        </Link>
                    </ScrollReveal>


                </div>

                {/* Right Column: Interactive Card Deck */}
                <div className="flex-1 w-full max-w-md lg:max-w-full flex justify-center lg:justify-end">
                    <InteractiveCardDeck />
                </div>

            </div>
        </div>
    );
}
