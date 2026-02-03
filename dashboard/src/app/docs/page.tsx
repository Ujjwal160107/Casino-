"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { NavGroup, NavLink, SectionHeader } from "@/components/docs/SharedDocs";
import { Shield, Book, UserPlus, Briefcase, GraduationCap, TrendingUp, HelpCircle, Link as LinkIcon, Star, Dna, ShoppingBag, Landmark, Heart, Swords } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { useState } from "react";

export default function DocsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-violet-500/30">
            <LandingNavbar hideLogin={true} />

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400 mb-6"
                    >
                        Player Guide
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-zinc-400 max-w-2xl mx-auto"
                    >
                        Learn how to build your empire, climb the corporate ladder, and dominate the economy.
                    </motion.p>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-6 pb-32 grid grid-cols-1 lg:grid-cols-4 gap-12">
                {/* Sidebar Navigation */}
                <div className="hidden lg:block col-span-1">
                    <div className="sticky top-32 space-y-8 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
                        <NavGroup title="Basics">
                            <NavLink href="#intro">Introduction</NavLink>
                            <NavLink href="#dailies">Earning Money</NavLink>
                            <NavLink href="#banking">Bank & Finance</NavLink>
                        </NavGroup>
                        <NavGroup title="Life & Career">
                            <NavLink href="#education">Education</NavLink>
                            <NavLink href="#jobs">Carreer & Jobs</NavLink>
                            <NavLink href="#family">Marriage & Family</NavLink>
                        </NavGroup>
                        <NavGroup title="Assets">
                            <NavLink href="#inventory">Inventory & Market</NavLink>
                            <NavLink href="#stocks">Stock Market</NavLink>
                            <NavLink href="#properties">Properties</NavLink>
                        </NavGroup>
                        <NavGroup title="Entertainment">
                            <NavLink href="#games">Casino Games</NavLink>
                            <NavLink href="#chicken">Chicken Training</NavLink>
                        </NavGroup>
                        <NavGroup title="Reference">
                            <Link href="/docs/commands" className="text-violet-400 hover:text-violet-300 font-bold flex items-center gap-2 py-1">
                                <LinkIcon size={14} /> Full Command List
                            </Link>
                        </NavGroup>
                    </div>
                </div>

                {/* Main Content */}
                <div className="col-span-1 lg:col-span-3 space-y-20">

                    {/* Introduction */}
                    <section id="intro">
                        <SectionHeader icon={<UserPlus />} title="Welcome to Fortuna" />
                        <GlassCard className="p-8 space-y-6">
                            <p className="text-lg text-zinc-300 leading-relaxed">
                                Fortuna is more than just a currency bot—it's a complete <strong>Life Simulation</strong>.
                                You don't just click a button to get rich; you need to study, get a degree, find a job, manage your stress, and invest wisely.
                            </p>
                        </GlassCard>
                    </section>

                    {/* Earning Money */}
                    <section id="dailies">
                        <SectionHeader icon={<Star />} title="Earning Money" />
                        <div className="space-y-6">
                            <p className="text-zinc-400">There are many ways to make money, ranging from honest work to dangerous crimes.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <GlassCard className="p-6">
                                    <h4 className="font-bold text-white text-lg mb-2">Safe Income</h4>
                                    <ul className="space-y-2 text-sm text-zinc-300 font-mono">
                                        <li>• !daily / !weekly / !monthly</li>
                                        <li>• !work (Requires a Job)</li>
                                        <li>• !collect (Passive Income)</li>
                                        <li>• !vote (Vote rewards)</li>
                                        <li>• !beg (Ask strangers for cash)</li>
                                    </ul>
                                </GlassCard>
                                <GlassCard className="p-6 border-red-500/20">
                                    <h4 className="font-bold text-red-400 text-lg mb-2">Risky Business</h4>
                                    <ul className="space-y-2 text-sm text-zinc-300 font-mono">
                                        <li>• !crime (High risk, moderate reward)</li>
                                        <li>• !rob @user (Steal from wallets)</li>
                                        <li>• !slut (Sell your... dignity)</li>
                                    </ul>
                                    <p className="mt-4 text-xs text-red-400">
                                        <strong>Warning:</strong> These commands carry a high risk of fines or jail time. If you land in jail, you cannot use commands until your sentence is over or you pay bail!
                                    </p>
                                </GlassCard>
                            </div>
                        </div>
                    </section>

                    {/* Banking Module */}
                    <section id="banking">
                        <SectionHeader icon={<Landmark />} title="Bank & Finance" />
                        <div className="space-y-6 text-zinc-300">
                            <p>
                                Your <strong>Bank</strong> is safe from robbers. Always deposit your cash!
                                Access the banking dashboard with <code className="bg-white/10 px-1 rounded">!bank</code>.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                <div>
                                    <h4 className="text-white font-bold mb-2 text-lg">🏦 Loans</h4>
                                    <p className="text-sm text-zinc-400 mb-2">Need quick cash? Take out a loan backed by your Credit Score.</p>
                                    <ul className="list-disc list-inside text-sm text-zinc-400">
                                        <li>Higher Credit Score = Bigger Loans</li>
                                        <li>Miss payments = Score drops</li>
                                        <li>Use <code className="text-zinc-300">!bank</code> to manage/repay loans.</li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-white font-bold mb-2 text-lg">📈 Investments (FD/RD)</h4>
                                    <p className="text-sm text-zinc-400 mb-2">Let your money grow over time.</p>
                                    <ul className="list-disc list-inside text-sm text-zinc-400">
                                        <li><strong>Fixed Deposit (FD):</strong> Lock money for a set time (e.g., 7 days) for high interest.</li>
                                        <li><strong>Recurring Deposit (RD):</strong> Auto-save a small amount daily.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Inventory & Market */}
                    <section id="inventory">
                        <SectionHeader icon={<ShoppingBag />} title="Inventory & Market" />
                        <div className="space-y-6 text-zinc-300">
                            <p>
                                View your items with <code className="bg-white/10 px-1 rounded">!inventory</code> (or !inv).
                            </p>

                            <h4 className="text-xl font-bold text-white mt-8 mb-4">Trading & Selling</h4>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-white/5 p-4 rounded-lg">
                                    <strong className="text-white block mb-1">Quick Sell</strong>
                                    <p className="text-sm text-zinc-400">
                                        Sell items back to the system instantly for a fraction of their value using <code className="text-zinc-300">!shop sell &lt;item&gt;</code>.
                                    </p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-lg">
                                    <strong className="text-white block mb-1">Player Trading</strong>
                                    <p className="text-sm text-zinc-400">
                                        Give items to friends using <code className="text-zinc-300">!give &lt;@user&gt; &lt;item&gt;</code>.
                                    </p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-lg border border-purple-500/20">
                                    <strong className="text-purple-400 block mb-1">The Black Market</strong>
                                    <p className="text-sm text-zinc-400">
                                        List items for other players to buy at your own price!
                                        <br />• View listings: <code className="text-zinc-300">!market</code>
                                        <br />• Sell item: <code className="text-zinc-300">!market list &lt;item&gt; &lt;price&gt;</code>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Games */}
                    <section id="games">
                        <SectionHeader icon={<Dna />} title="Casino Games" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <GameTile name="Blackjack" cmd="!bj" desc="Beat the dealer to 21." />
                            <GameTile name="Roulette" cmd="!roulette" desc="Bet on colors or numbers." />
                            <GameTile name="Slots" cmd="!slots" desc="Spin to win jackpots." />
                            <GameTile name="Coinflip" cmd="!cf" desc="Double or nothing." />
                            <GameTile name="Russian Roulette" cmd="!rr" desc="High risk, high reward." />
                            <GameTile name="Cockfight" cmd="!cockfight" desc="PVP Chicken Battles." />
                        </div>
                    </section>

                    {/* Chicken Module */}
                    <section id="chicken">
                        <SectionHeader icon={<Swords />} title="Chicken Module" />
                        <GlassCard className="p-6">
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1">
                                    <h4 className="text-xl font-bold text-white mb-2">Own a Fighter</h4>
                                    <p className="text-zinc-400 mb-4">
                                        Buy a chicken from the shop and train it to become the ultimate champion.
                                    </p>
                                    <ul className="space-y-2 text-sm text-zinc-300">
                                        <li>• <strong>Feed:</strong> Keeps your chicken alive and happy.</li>
                                        <li>• <strong>Train:</strong> Improves stats (Attack, Defense, Speed).</li>
                                        <li>• <strong>Fight:</strong> Battle against other players' chickens for money.</li>
                                    </ul>
                                </div>
                                <div className="flex-1 bg-black/30 rounded-lg p-4 font-mono text-sm text-zinc-400">
                                    <div className="mb-2 text-purple-400 font-bold">Commands:</div>
                                    <div>!shop buy chicken</div>
                                    <div>!manage-chicken feed</div>
                                    <div>!manage-chicken train</div>
                                    <div>!cockfight &lt;amount&gt;</div>
                                </div>
                            </div>
                        </GlassCard>
                    </section>

                    {/* Education */}
                    <section id="education">
                        <SectionHeader icon={<GraduationCap />} title="University & Education" />
                        <div className="space-y-6 text-zinc-300">
                            <p>Most high-paying jobs require a specific <strong>Degree</strong>.</p>
                            <ol className="list-decimal list-inside space-y-4 ml-4">
                                <li><strong>Browse:</strong> <code className="bg-white/10 px-1 rounded">!education</code></li>
                                <li><strong>Enroll:</strong> <code className="bg-white/10 px-1 rounded">!enroll &lt;degree&gt;</code></li>
                                <li><strong>Study:</strong> <code className="bg-white/10 px-1 rounded">!study</code> (Boosts GPA/Int)</li>
                                <li><strong>Graduate:</strong> Hit the stat requirements!</li>
                            </ol>
                        </div>
                    </section>

                    {/* Jobs */}
                    <section id="jobs">
                        <SectionHeader icon={<Briefcase />} title="Jobs & Careers" />
                        <GlassCard className="p-6">
                            <p className="text-zinc-300 mb-4">
                                Climb the ladder from Janitor to CEO.
                                Work shifts with <code className="bg-white/10 px-1 rounded">!work</code> to earn XP.
                                When you have enough XP, use <code className="bg-white/10 px-1 rounded">!promote</code>.
                            </p>
                            <div className="bg-red-500/10 p-4 rounded border border-red-500/20 text-sm">
                                <strong className="text-red-400">Manage Stress:</strong> Working raises stress. Relax with <code className="text-red-300">!relax</code> or you may die.
                            </div>
                        </GlassCard>
                    </section>

                    {/* Propertes & Marriage */}
                    <section id="properties">
                        <SectionHeader icon={<Landmark />} title="Properties" />
                        <div className="space-y-4 text-zinc-300">
                            <p>
                                Buy real estate to show off your wealth and earn perks. Properties can provide passive income or stat boosts.
                            </p>
                            <ul className="list-disc list-inside text-sm text-zinc-400">
                                <li>View listings: <code className="text-zinc-300">!properties</code></li>
                                <li>Buy: <code className="text-zinc-300">!buy-property &lt;id&gt;</code></li>
                            </ul>
                        </div>
                    </section>

                    <section id="family">
                        <SectionHeader icon={<Heart />} title="Marriage & Family" />
                        <div className="space-y-4 text-zinc-300">
                            <p>
                                Find a partner and get married to share wealth and potentially earn tax benefits (or just for fun).
                            </p>
                            <div className="flex gap-4 flex-wrap">
                                <span className="bg-pink-500/20 text-pink-300 px-3 py-1 rounded text-sm code">!marry @user</span>
                                <span className="bg-zinc-800 text-zinc-400 px-3 py-1 rounded text-sm code">!divorce</span>
                                <span className="bg-zinc-800 text-zinc-400 px-3 py-1 rounded text-sm code">!family</span>
                            </div>
                        </div>
                    </section>

                    {/* Stocks */}
                    <section id="stocks">
                        <SectionHeader icon={<TrendingUp />} title="Stock Market" />
                        <div className="space-y-4 text-zinc-300">
                            <p>
                                Real-time simulated stock market. Buy low, sell high.
                                <br />Use <code className="bg-white/10 px-1 rounded">!stock</code> to view the ticker.
                            </p>
                        </div>
                    </section>

                    {/* Closing */}
                    <section className="pt-20 border-t border-white/10 text-center">
                        <h3 className="text-2xl font-bold text-white mb-6">Ready to explore?</h3>
                        <Link
                            href="/docs/commands"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10"
                        >
                            <Book size={20} />
                            View All Commands
                        </Link>
                    </section>

                </div>
            </div>
            <Footer />
        </main>
    );
}

function GameTile({ name, cmd, desc }: { name: string, cmd: string, desc: string }) {
    return (
        <div className="bg-white/5 border border-white/5 p-4 rounded-lg hover:bg-white/10 transition-colors">
            <h5 className="font-bold text-white mb-1">{name}</h5>
            <code className="text-xs text-violet-400 bg-black/30 px-1 py-0.5 rounded mb-2 inline-block">{cmd}</code>
            <p className="text-xs text-zinc-400">{desc}</p>
        </div>
    );
}
