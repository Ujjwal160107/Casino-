"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Shield, Lock, Eye, Trash2, Database, Users, Scale, FileText, Server } from "lucide-react";

export default function PolicyPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-emerald-500/30">
            <LandingNavbar hideLogin={true} />

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
                        Official Statement Regarding Data Processing and Privacy Practices
                    </motion.p>
                    <p className="mt-4 text-sm text-zinc-500">Effective Date: February 3, 2026</p>
                </div>
            </section>

            <div className="max-w-4xl mx-auto px-6 pb-32 space-y-8">

                <GlassCard className="p-8">
                    <p className="text-zinc-300 leading-relaxed text-justify">
                        This Privacy Policy ("Policy") constitutes a legal agreement between you ("User," "you," or "your") and the development team of Fortuna Bot ("Service Provider," "we," "us," or "our"). This Policy elucidates our practices regarding the collection, use, disclosure, and protection of your Personal Data in connection with your use of the Fortuna Bot services on the Discord platform ("Service").
                        <br /><br />
                        By accessing or using the Service, you expressly consent to the data processing practices described in this Policy. If you do not agree to the terms of this Policy, you must strictly refrain from using the Service.
                    </p>
                </GlassCard>

                <PolicySection
                    icon={<Eye className="text-blue-400" />}
                    title="1. Collection of Data"
                >
                    <div className="space-y-6">
                        <p className="text-zinc-400">We collect Specific Categories of Personal Data necessary for the operation of the Service, as classified below:</p>

                        <div>
                            <h3 className="text-white font-bold mb-2">1.1. User-Provided Information</h3>
                            <p className="text-zinc-400 mb-2">We collect data that you voluntarily submit through direct interaction with the Service:</p>
                            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                                <li><strong className="text-zinc-200">Identity Data:</strong> Discord User ID, Username, Discriminator, and Avatar URL.</li>
                                <li><strong className="text-zinc-200">Transaction Data:</strong> Records of virtual currency transactions, inventory acquisitions, bank deposits, and loans.</li>
                                <li><strong className="text-zinc-200">Configuration Data:</strong> Server-specific settings, preferences, and permissions configured by administrative users.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-white font-bold mb-2">1.2. Automated Data Collection</h3>
                            <p className="text-zinc-400 mb-2">Upon interaction with the Service, the following data is automatically generated and retained:</p>
                            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                                <li><strong className="text-zinc-200">Metadata:</strong> Timestamps of account creation, command usage logs, and interaction frequency.</li>
                                <li><strong className="text-zinc-200">Guild Data:</strong> Discord Server (Guild) IDs and channel associations required for segregated economy management.</li>
                            </ul>
                        </div>
                    </div>
                </PolicySection>

                <PolicySection
                    icon={<Database className="text-indigo-400" />}
                    title="2. Purpose and Legal Basis of Processing"
                >
                    <p className="mb-4">We process Personal Data under the following legal bases and for the specific purposes outlined herein:</p>
                    <ul className="list-disc pl-5 space-y-3 text-zinc-400">
                        <li>
                            <strong className="text-zinc-200">Contractual Necessity:</strong> To fulfill our obligations under these Terms, including maintaining your virtual account balance, inventory, and progress.
                        </li>
                        <li>
                            <strong className="text-zinc-200">Legitimate Interests:</strong> To analyze Service performance, prevent fraudulent activity (including automated "farming" or exploitation), and enforce our Terms of Service.
                        </li>
                        <li>
                            <strong className="text-zinc-200">Compliance with Legal Obligations:</strong> To comply with applicable laws, regulations, or valid legal processes (e.g., subpoenas or court orders).
                        </li>
                    </ul>
                </PolicySection>

                <PolicySection
                    icon={<Users className="text-emerald-400" />}
                    title="3. Disclosure of Information"
                >
                    <p className="mb-4">We adhere to a strict policy regarding the disclosure of your Personal Data:</p>
                    <ul className="list-disc pl-5 space-y-3 text-zinc-400">
                        <li>
                            <strong className="text-emerald-400">No Commercial Transfer:</strong> We do not sell, license, lease, or commercially transfer User Data to third-party advertisers or data brokers.
                        </li>
                        <li>
                            <strong className="text-zinc-200">Service Providers:</strong> We may disclose data to third-party infrastructure providers (e.g., cloud hosting services, database management systems) solely for the purpose of hosting and maintaining the Service. These providers are bound by confidentiality agreements.
                        </li>
                        <li>
                            <strong className="text-zinc-200">Legal Requirements:</strong> We reserve the right to disclose data when we have a good-faith belief that such action is necessary to comply with a judicial proceeding, court order, or legal process served on us.
                        </li>
                    </ul>
                </PolicySection>

                <PolicySection
                    icon={<Lock className="text-amber-400" />}
                    title="4. Data Security and Retention"
                >
                    <div className="space-y-4">
                        <p>
                            We implement industry-standard technical and organizational measures designed to protect your Personal Data from unauthorized access, accidental loss, disclosure, or destruction. These measures include encryption in transit and rest, strict access controls, and regular security audits.
                        </p>
                        <p>
                            We retain Personal Data only for as long as is necessary to fulfill the purposes for which it was collected, including for the purposes of satisfying any legal, accounting, or reporting requirements. Upon account deletion or termination, data is expunged from our active databases in accordance with our retention schedule.
                        </p>
                    </div>
                </PolicySection>

                <PolicySection
                    icon={<Trash2 className="text-red-400" />}
                    title="5. User Rights and Control"
                >
                    <p className="mb-4">Subject to applicable law, you possess the following rights regarding your Personal Data:</p>
                    <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                        <li><strong className="text-zinc-200">Right to Access:</strong> You may request a copy of the Personal Data we hold about you via the <code className="bg-white/10 px-1 rounded text-zinc-300">!profile</code> command.</li>
                        <li><strong className="text-zinc-200">Right to Erasure ("Right to be Forgotten"):</strong> You may request the permanent deletion of your data. The Service provides the <code className="bg-white/10 px-1 rounded text-zinc-300">!reset-economy</code> command for Administrators to purge server-specific data. Individual deletion requests may be submitted via our Support Server.</li>
                        <li><strong className="text-zinc-200">Right to Rectification:</strong> You have the right to request correction of inaccurate or incomplete data.</li>
                    </ul>
                </PolicySection>

                <PolicySection
                    icon={<Scale className="text-violet-400" />}
                    title="6. International Data Transfers"
                >
                    <p>
                        The Service is hosted on infrastructure located in the United States and potentially other jurisdictions. By using the Service, you acknowledge and consent to the transfer of your data to, and processing in, jurisdictions that may have different data protection laws than your jurisdiction of residence.
                    </p>
                </PolicySection>

                <PolicySection
                    icon={<Server className="text-zinc-400" />}
                    title="7. Amendments"
                >
                    <p>
                        We reserve the right to modify this Policy at our sole discretion. Material changes will be notified via the Service or our official support channels. Your continued use of the Service following such notification constitutes your explicit acceptance of the amended Policy.
                    </p>
                </PolicySection>

                <PolicySection
                    icon={<FileText className="text-zinc-400" />}
                    title="Contact Information"
                >
                    <p>
                        For inquiries regarding this Policy or to exercise your data rights, please contact our Data Protection Officer via our official Support Server.
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
            <div className="text-lg text-zinc-300 leading-relaxed text-justify">
                {children}
            </div>
        </GlassCard>
    );
}
