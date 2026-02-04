"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { GeneralSidebar } from "@/components/GeneralSidebar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sparkles, Zap, Shield, Layout, Book, Users, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function ChangelogPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-violet-500/30">
            <LandingNavbar hideLogin={true} />

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-violet-900/10 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm font-medium mb-6"
                    >
                        <Sparkles size={14} />
                        <span>Latest Release</span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-violet-200 to-violet-400 mb-6"
                    >
                        Changelog
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-xl text-zinc-400 max-w-2xl mx-auto"
                    >
                        Track the evolution of Fortuna. We ship updates regularly to improve your experience.
                    </motion.p>
                </div>
            </section>

            <div className="max-w-[1400px] mx-auto px-6 pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="hidden lg:block col-span-2">
                    <GeneralSidebar />
                </div>

                <div className="col-span-1 lg:col-span-10 space-y-16">

                    {/* Version 1.5 */}
                    <div className="relative pl-8 md:pl-0">
                        {/* Timeline Line */}
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-white/10 md:hidden" />

                        <div className="flex flex-col md:flex-row gap-8">
                            {/* Version Info */}
                            <div className="md:w-1/4 md:text-right sticky top-32 h-fit">
                                <h2 className="text-3xl font-bold text-white mb-2">v1.5</h2>
                                <p className="text-zinc-500 font-mono text-sm mb-2">February 3, 2026</p>
                                <span className="inline-block px-3 py-1 rounded bg-violet-500/20 text-violet-300 text-xs font-bold border border-violet-500/30">
                                    MAJOR UPDATE
                                </span>
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-8">
                                <GlassCard className="p-8 border-violet-500/20 bg-violet-900/5">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="p-3 bg-violet-500/20 rounded-xl text-violet-400">
                                            <Zap size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">Total Dashboard Overhaul</h3>
                                            <p className="text-zinc-400 leading-relaxed">
                                                We've completely redesigned the dashboard with a modern, glassmorphic aesthetic. It's faster, sleeker, and more intuitive than ever before.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <FeatureItem>New Glassmorphism UI Identity</FeatureItem>
                                        <FeatureItem>Enhanced Mobile Responsiveness</FeatureItem>
                                        <FeatureItem>Improved Navigation Sidebar</FeatureItem>
                                        <FeatureItem>Smoother Animations</FeatureItem>
                                    </div>
                                </GlassCard>

                                <GlassCard className="p-8">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
                                            <Book size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">Documentation Revamp</h3>
                                            <p className="text-zinc-400 leading-relaxed">
                                                A brand new Documentation Hub with comprehensive guides for players and detailed references for every single command.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <FeatureItem>Added <strong>Player Guide</strong> for getting started</FeatureItem>
                                        <FeatureItem>Complete <strong>Command Reference</strong> list</FeatureItem>
                                        <FeatureItem>Detailed <strong>Dashboard Guide</strong> for admins</FeatureItem>
                                        <FeatureItem>New FAQ section for common questions</FeatureItem>
                                    </div>
                                </GlassCard>

                                <GlassCard className="p-8">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
                                            <Layout size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">New Pages & Polish</h3>
                                            <p className="text-zinc-400 leading-relaxed">
                                                We've expanded the website with dedicated pages for our team, legal information, and a global footer for easier navigation.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <FeatureItem>New <strong>Team Page</strong> with 3D tilt effects</FeatureItem>
                                        <FeatureItem>Formal <strong>Terms of Service</strong> & Privacy Policy</FeatureItem>
                                        <FeatureItem>Consistent Global Footer across all public pages</FeatureItem>
                                        <FeatureItem>Refined landing page animations</FeatureItem>
                                    </div>
                                </GlassCard>
                            </div>
                        </div>
                    </div>

                    {/* Previous Versions (Placeholder for visual continuity) */}
                    <div className="relative pl-8 md:pl-0 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-white/10 md:hidden" />
                        <div className="flex flex-col md:flex-row gap-8">
                            <div className="md:w-1/4 md:text-right sticky top-32 h-fit">
                                <h2 className="text-3xl font-bold text-white mb-2">v1.0</h2>
                                <p className="text-zinc-500 font-mono text-sm mb-2">January 1, 2026</p>
                            </div>
                            <div className="flex-1">
                                <GlassCard className="p-8">
                                    <h3 className="text-xl font-bold text-white mb-4">Initial Launch</h3>
                                    <p className="text-zinc-400">
                                        The first public release of Fortuna Bot. Included basic economy features, casino games (Blackjack, Roulette), and the initial shop system.
                                    </p>
                                </GlassCard>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <Footer />
        </main >
    );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 text-zinc-300 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
            <span>{children}</span>
        </div>
    );
}
