"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Scale, Shield, AlertTriangle, ScrollText, Ban, Gavel, FileSignature } from "lucide-react";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-emerald-500/30">
            <LandingNavbar />

            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 mb-6"
                    >
                        Terms of Service
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-zinc-400 max-w-2xl mx-auto"
                    >
                        Please read these terms carefully before using Fortuna Bot.
                    </motion.p>
                    <p className="mt-4 text-sm text-zinc-500">Last Updated: January 20, 2026</p>
                </div>
            </section>

            <div className="max-w-4xl mx-auto px-6 pb-32 space-y-8">

                <GlassCard className="p-8 border-blue-500/20">
                    <p className="text-zinc-300 leading-relaxed text-lg">
                        By inviting Fortuna Bot to your Discord server or using any of its features (commands, dashboard, systems), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the bot.
                    </p>
                </GlassCard>

                <TermSection
                    icon={<FileSignature className="text-blue-400" />}
                    title="1. Usage License"
                >
                    <p>
                        We grant you a limited, non-exclusive, non-transferable, revocable license to use Fortuna Bot for your personal, non-commercial use on Discord servers, subject to these Terms. You agree not to use the bot for any illegal purpose or in any way that violates Discord's Terms of Service or Community Guidelines.
                    </p>
                </TermSection>

                <TermSection
                    icon={<Scale className="text-emerald-400" />}
                    title="2. Virtual Currency & Economy"
                >
                    <div className="space-y-4">
                        <p>
                            The "currency", "money", "items", and other assets represented within Fortuna Bot are purely <strong>virtual</strong> and have <strong>no real-world value</strong>.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                            <li>You cannot exchange virtual currency for real money, goods, or services.</li>
                            <li>We do not guarantee the permanence of any virtual items or currency.</li>
                            <li>We reserve the right to reset, modify, or delete economy data at any time for any reason (e.g., balancing, bug fixes, exploits).</li>
                        </ul>
                    </div>
                </TermSection>

                <TermSection
                    icon={<Ban className="text-red-400" />}
                    title="3. Prohibited Conduct"
                >
                    <p className="mb-4">You agree NOT to:</p>
                    <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                        <li><strong className="text-zinc-200">Exploit Bugs:</strong> Intentionally abusing glitches or bugs to gain unfair advantages (e.g., infinite money exploits). Report bugs immediately.</li>
                        <li><strong className="text-zinc-200">Automate:</strong> Using self-bots, macros, or scripts to automate commands (farming).</li>
                        <li><strong className="text-zinc-200">Spam:</strong> Intentionally spamming commands to cause lag or disruption.</li>
                        <li><strong className="text-zinc-200">Scam:</strong> Deceiving other users in trades or transactions.</li>
                    </ul>
                </TermSection>

                <TermSection
                    icon={<Shield className="text-indigo-400" />}
                    title="4. Availability & Termination"
                >
                    <p>
                        We strive for high uptime but do not guarantee that Fortuna Bot will be available at all times. We reserve the right to modify, suspend, or discontinue the bot (or any part thereof) at any time with or without notice. We may also ban any user or server from using the bot for violation of these terms.
                    </p>
                </TermSection>

                <TermSection
                    icon={<AlertTriangle className="text-amber-400" />}
                    title="5. Disclaimer of Warranties"
                >
                    <p className="uppercase text-xs font-bold text-zinc-500 mb-2">READ CAREFULLY</p>
                    <p>
                        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE ARE NOT LIABLE FOR ANY LOSS OF DATA, LOSS OF VIRTUAL CURRENCY, OR DAMAGES RESULTING FROM THE USE OF THE BOT.
                    </p>
                </TermSection>

                <TermSection
                    icon={<Gavel className="text-zinc-400" />}
                    title="6. Governing Law"
                >
                    <p>
                        These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which the bot owner resides, without regard to its conflict of law provisions.
                    </p>
                </TermSection>

                <TermSection
                    icon={<ScrollText className="text-zinc-400" />}
                    title="Contact & Updates"
                >
                    <p>
                        We reserve the right to update these policies at any time. Continued use of the bot after changes constitutes acceptance of the new terms.
                    </p>
                    <div className="mt-6">
                        <a href="https://discord.gg/Y5P44UCH2Y" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 transition-colors text-blue-200 font-medium">
                            Join Support Server
                        </a>
                    </div>
                </TermSection>

            </div>

        </main>
    );
}

function TermSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <GlassCard className="p-8">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    {icon}
                </div>
                <h2 className="text-2xl font-bold text-white">{title}</h2>
            </div>
            <div className="text-lg text-zinc-300 leading-relaxed">
                {children}
            </div>
        </GlassCard>
    );
}
