"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Shield, Lock, Eye, Trash2, Database, Users, Scale, FileText } from "lucide-react";

export default function PolicyPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-emerald-500/30">
            <LandingNavbar />

            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400 mb-6"
                    >
                        Privacy Policy
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-zinc-400 max-w-2xl mx-auto"
                    >
                        Transparency about how we handle your data.
                    </motion.p>
                    <p className="mt-4 text-sm text-zinc-500">Last Updated: January 20, 2026</p>
                </div>
            </section>

            <div className="max-w-4xl mx-auto px-6 pb-32 space-y-8">

                <GlassCard className="p-8">
                    <p className="text-zinc-300 leading-relaxed">
                        Fortuna Bot ("we", "us", or "our") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Discord bot and associated services. By adding Fortuna Bot to your server or using its commands, you agree to the collection and use of information in accordance with this policy.
                    </p>
                </GlassCard>

                <PolicySection
                    icon={<Eye className="text-blue-400" />}
                    title="1. Information We Collect"
                >
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-white font-bold mb-2">A. Information You Voluntarily Provide</h3>
                            <p className="text-zinc-400 mb-2">We collect information that you voluntarily provide when using specific features:</p>
                            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                                <li><strong className="text-zinc-200">User IDs & Usernames:</strong> To link your account to your economy profile.</li>
                                <li><strong className="text-zinc-200">Profile Data:</strong> Gameplay data including balances, inventory, job status, marriage, and game history.</li>
                                <li><strong className="text-zinc-200">Server Configuration:</strong> Custom settings for your guild (currency, taxes, shops) if you are an admin.</li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-white font-bold mb-2">B. Information Automatically Collected</h3>
                            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                                <li><strong className="text-zinc-200">Guild IDs:</strong> The unique ID of Discord servers to maintain separate economies.</li>
                                <li><strong className="text-zinc-200">Timestamps:</strong> For tracking cooldowns and account age.</li>
                            </ul>
                        </div>
                    </div>
                </PolicySection>

                <PolicySection
                    icon={<Database className="text-indigo-400" />}
                    title="2. How We Use Your Information"
                >
                    <p>We use the collected information solely for providing the bot’s services:</p>
                    <ul className="list-disc pl-5 space-y-2 mt-4 text-zinc-400">
                        <li><strong className="text-zinc-200">Core Functionality:</strong> Processing transactions, calculating game outcomes, and managing inventory.</li>
                        <li><strong className="text-zinc-200">Persistence:</strong> Ensuring your progress is saved securely.</li>
                        <li><strong className="text-zinc-200">Permissions:</strong> Verifying administrative rights for sensitive commands.</li>
                        <li><strong className="text-zinc-200">Improvement:</strong> Analyzing usage patterns to optimize performance.</li>
                    </ul>
                </PolicySection>

                <PolicySection
                    icon={<Users className="text-emerald-400" />}
                    title="3. Data Sharing & Disclosure"
                >
                    <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                        <li><strong className="text-green-400">No Third-Party Sales:</strong> We do NOT sell, trade, or rent your personal information to others.</li>
                        <li><strong className="text-green-400">No Advertising:</strong> We do not use your data for third-party advertising or tracking.</li>
                        <li><strong className="text-zinc-200">Legal Compliance:</strong> We may disclose info if required by law.</li>
                    </ul>
                </PolicySection>

                <PolicySection
                    icon={<Lock className="text-amber-400" />}
                    title="4. Data Security"
                >
                    <p>
                        We use administrative, technical, and physical security measures to protect your data. Information is stored in a secure MongoDB database with restricted access. However, no data transmission over the Internet can be guaranteed to be 100% secure.
                    </p>
                </PolicySection>

                <PolicySection
                    icon={<Trash2 className="text-red-400" />}
                    title="5. Your Data Rights"
                >
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-white font-bold mb-1">Access</h3>
                            <p className="text-zinc-400">You can view all data stored about you by using the <code className="bg-white/10 px-1 rounded text-zinc-300">!profile</code>, <code className="bg-white/10 px-1 rounded text-zinc-300">!balance</code>, and <code className="bg-white/10 px-1 rounded text-zinc-300">!inventory</code> commands.</p>
                        </div>
                        <div>
                            <h3 className="text-white font-bold mb-1">Deletion</h3>
                            <p className="text-zinc-400">
                                You may request deletion of your account data by contacting us. Server Administrators can delete all server-associated data using <code className="bg-white/10 px-1 rounded text-zinc-300">!reset-economy</code>.
                            </p>
                        </div>
                    </div>
                </PolicySection>

                <PolicySection
                    icon={<Scale className="text-violet-400" />}
                    title="6. Children's Privacy"
                >
                    <p>
                        Our services are not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware of such collection, we will delete the information.
                    </p>
                </PolicySection>

                <PolicySection
                    icon={<FileText className="text-zinc-400" />}
                    title="Contact Us"
                >
                    <p>
                        If you have questions about this Privacy Policy, please join our Support Server.
                    </p>
                    <div className="mt-6">
                        <a href="https://discord.gg/Y5P44UCH2Y" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 transition-colors text-emerald-200 font-medium">
                            Join Support Server
                        </a>
                    </div>
                </PolicySection>

            </div>

        </main>
    );
}

function PolicySection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
