"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Scale, Shield, AlertTriangle, ScrollText, Ban, Gavel, FileSignature, CheckCircle } from "lucide-react";

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-emerald-500/30">
            <LandingNavbar hideLogin={true} />

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
                        Legally Binding User Agreement
                    </motion.p>
                    <p className="mt-4 text-sm text-zinc-500">Effective Date: February 3, 2026</p>
                </div>
            </section>

            <div className="max-w-4xl mx-auto px-6 pb-32 space-y-8">

                <GlassCard className="p-8 border-blue-500/20">
                    <p className="text-zinc-300 leading-relaxed text-lg text-justify">
                        THESE TERMS OF SERVICE ("TERMS") CONSTITUTE A BINDING LEGAL AGREEMENT BETWEEN YOU AND THE FORTUNA BOT DEVELOPMENT TEAM. BY INVITING THE BOT TO A SERVER, EXECUTING ANY COMMAND, OR ACCESSING THE DASHBOARD, YOU UNCONDITIONALLY ACCEPT AND AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE TO THESE TERMS, YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICE.
                    </p>
                </GlassCard>

                <TermSection
                    icon={<FileSignature className="text-blue-400" />}
                    title="1. License Grant and Restrictions"
                >
                    <p className="mb-4">
                        Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-sublicensable, revocable, non-transferable license to access and use the Service solely for your personal, non-commercial entertainment purposes.
                    </p>
                    <h4 className="text-white font-bold mb-2">Restrictions:</h4>
                    <p>You agree that you will not:</p>
                    <ul className="list-disc pl-5 mt-2 space-y-2 text-zinc-400">
                        <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Service.</li>
                        <li>Use the Service to transmit unauthorized communications, including "spam" or promotional materials.</li>
                        <li>Interfere with or disrupt the integrity or performance of the Service or third-party data contained therein.</li>
                        <li>Attempt to gain unauthorized access to the Service or its related systems or networks.</li>
                    </ul>
                </TermSection>

                <TermSection
                    icon={<Scale className="text-emerald-400" />}
                    title="2. Virtual Assets and Economy"
                >
                    <div className="space-y-4">
                        <p>
                            The Service simulates an economic system involving virtual currency, items, experience points, and other attributes ("Virtual Assets").
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                            <li><strong className="text-zinc-200">No Ownership Rights:</strong> You acknowledge that you do not own the Virtual Assets. You possess a limited license to use them within the Service.</li>
                            <li><strong className="text-zinc-200">No Real World Value:</strong> Virtual Assets have strictly no monetary value and cannot be exchanged for legal tender, real-world goods, or services.</li>
                            <li><strong className="text-zinc-200">Right to Modify:</strong> We reserve the absolute right to manage, regulate, control, modify, or eliminate Virtual Assets at our sole discretion, with or without notice, and shall have no liability to you or any third party for the exercise of such rights.</li>
                        </ul>
                    </div>
                </TermSection>

                <TermSection
                    icon={<Ban className="text-red-400" />}
                    title="3. User Conduct and Prohibitions"
                >
                    <p className="mb-4">You agree not to engage in any of the following prohibited activities:</p>
                    <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                        <li><strong className="text-zinc-200">Exploitation:</strong> Identifying and utilizing bugs, glitches, or vulnerabilities to gain an unfair advantage ("exploits"). All bugs must be reported immediately.</li>
                        <li><strong className="text-zinc-200">Automation:</strong> Using "bots," "macros," "scripts," or other automated means to interact with the Service.</li>
                        <li><strong className="text-zinc-200">Deceptive Practices:</strong> Engaging in scams, social engineering, or defrauding other users within the trading system.</li>
                        <li><strong className="text-zinc-200">Violation of Discord TOS:</strong> Using the Service in any manner that violates the Discord Terms of Service or Community Guidelines.</li>
                    </ul>
                    <p className="mt-4 text-red-300">
                        Violation of these prohibitions may result in immediate termination of your license, account suspension, or a permanent ban from the Service without recourse.
                    </p>
                </TermSection>

                <TermSection
                    icon={<Shield className="text-indigo-400" />}
                    title="4. Indemnification"
                >
                    <p>
                        You agree to indemnify, defend, and hold harmless the Service Provider, its affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, liabilities, damages, losses, costs, expenses, or fees (including reasonable attorneys' fees) that such parties may incur as a result of or arising from your (or anyone using your account) violation of these Terms or your use of the Service.
                    </p>
                </TermSection>

                <TermSection
                    icon={<AlertTriangle className="text-amber-400" />}
                    title="5. Disclaimer of Warranties"
                >
                    <p className="uppercase text-xs font-bold text-zinc-500 mb-2 tracking-widest">IMPORTANT</p>
                    <p className="uppercase text-zinc-300">
                        THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE EXPRESSLY DISCLAIM ANY AND ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND COURSE OF DEALING. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
                    </p>
                </TermSection>

                <TermSection
                    icon={<AlertTriangle className="text-amber-400" />}
                    title="6. Limitation of Liability"
                >
                    <p className="uppercase text-zinc-300">
                        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE SERVICE PROVIDER BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE USE OF, OR INABILITY TO USE, THE SERVICE.
                    </p>
                </TermSection>

                <TermSection
                    icon={<Gavel className="text-zinc-400" />}
                    title="7. Governing Law and Dispute Resolution"
                >
                    <p>
                        These Terms shall be governed by and construed in accordance with the laws of the United States of America, without regard to its conflict of law principles. Any dispute arising from or relating to the subject matter of these Terms shall be finally settled by arbitration or in a court of competent jurisdiction.
                    </p>
                </TermSection>

                <TermSection
                    icon={<ScrollText className="text-zinc-400" />}
                    title="8. Modifications"
                >
                    <p>
                        We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
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
            <div className="text-lg text-zinc-300 leading-relaxed text-justify">
                {children}
            </div>
        </GlassCard>
    );
}
