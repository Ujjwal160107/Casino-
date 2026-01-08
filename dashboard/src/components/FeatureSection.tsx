"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { GlassCard } from "./ui/GlassCard";
import { ScrollReveal } from "./ui/ScrollReveal";

const features = [
    {
        title: "Server Administration",
        description: "Complete control over your server's settings, permissions, and automated moderation tools.",
        image: "/feature_admin.png" // Placeholder
    },
    {
        title: "Economy Management",
        description: "Track global currency flow, manage inflation, and monitor high-value transactions in real-time.",
        image: "/feature_economy.png"
    },
    {
        title: "User Analytics",
        description: "Deep dive into user behavior, activity metrics, and engagement statistics across your guild.",
        image: "/feature_analytics.png"
    },
    {
        title: "Game Configuration",
        description: "Adjust win rates, payouts, and game mechanics for the Casino and RPG elements.",
        image: "/feature_games.png"
    }
];

export function FeatureSection() {
    const targetRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: ["start start", "end end"],
    });

    return (
        <section ref={targetRef} className="relative bg-background">
            <div className="max-w-7xl mx-auto px-6 py-24 md:py-48">
                <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">

                    {/* Left Column - Sticky Content */}
                    <div className="lg:w-1/2 lg:h-screen lg:sticky lg:top-0 flex flex-col justify-center py-12">
                        <ScrollReveal direction="left">
                            <h2 className="text-4xl md:text-6xl font-black text-white mb-6">
                                POWERFUL <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                                    INTEGRATIONS
                                </span>
                            </h2>
                            <p className="text-xl text-muted-foreground max-w-xl mb-8 leading-relaxed">
                                Connect seamlessly with Discord's API to bring real-time data and control directly to your fingertips.
                                Experience a dashboard that evolves with your community.
                            </p>

                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4 text-white">
                                    <div className="w-12 h-1 bg-primary rounded-full"></div>
                                    <span className="font-bold tracking-widest text-sm uppercase">Real-Time Sync</span>
                                </div>
                                <div className="flex items-center gap-4 text-white">
                                    <div className="w-12 h-1 bg-secondary rounded-full"></div>
                                    <span className="font-bold tracking-widest text-sm uppercase">Secure OAuth2</span>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>

                    {/* Right Column - Scrolling Grid */}
                    <div className="lg:w-1/2 flex flex-col gap-12 pt-12 lg:pt-24 pb-24">
                        {features.map((feature, index) => (
                            <FeatureCard key={index} feature={feature} index={index} />
                        ))}
                    </div>

                </div>
            </div>
        </section>
    );
}

function FeatureCard({ feature, index }: { feature: any, index: number }) {
    return (
        <ScrollReveal direction="up" delay={index * 0.1}>
            <GlassCard className="p-8 group hover:bg-white/10 transition-colors">
                <div className="aspect-video bg-indigo-950/50 rounded-lg mb-6 overflow-hidden border border-white/5 relative">
                    {/* Placeholder for feature image */}
                    <div className="absolute inset-0 flex items-center justify-center text-white/20 font-mono text-4xl font-bold">
                        IMG_0{index + 1}
                    </div>
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                </div>

                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                    {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                </p>
            </GlassCard>
        </ScrollReveal>
    );
}
