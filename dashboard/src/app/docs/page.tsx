"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Shield, Book, CreditCard, DollarSign, Dna, Bot, Briefcase, GraduationCap, Heart, ShoppingBag, TrendingUp, Gavel, Settings, HelpCircle, UserPlus, MessageCircle } from "lucide-react";

export default function DocsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-violet-500/30">
            <LandingNavbar />

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-violet-900/20 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400 mb-6"
                    >
                        User Manual
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-zinc-400 max-w-2xl mx-auto"
                    >
                        Everything you need to know to master Fortuna.
                    </motion.p>
                </div>
            </section>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 pb-32 grid grid-cols-1 lg:grid-cols-4 gap-12">
                {/* Sidebar Navigation */}
                <div className="hidden lg:block col-span-1">
                    <div className="sticky top-32 space-y-8">
                        <NavGroup title="Start Here">
                            <NavLink href="#getting-started">Getting Started</NavLink>
                            <NavLink href="#faq">FAQ</NavLink>
                            <NavLink href="#support">Support</NavLink>
                        </NavGroup>
                        <NavGroup title="Economy">
                            <NavLink href="#banking">Banking & Wallet</NavLink>
                            <NavLink href="#income">Income & Rewards</NavLink>
                            <NavLink href="#market">Shop & Market</NavLink>
                            <NavLink href="#stocks">Stocks</NavLink>
                        </NavGroup>
                        <NavGroup title="Games">
                            <NavLink href="#casino">Casino Games</NavLink>
                        </NavGroup>
                        <NavGroup title="Life Sim">
                            <NavLink href="#career">Career</NavLink>
                            <NavLink href="#education">Education</NavLink>
                            <NavLink href="#family">Family & Family</NavLink>
                        </NavGroup>
                        <NavGroup title="Admin">
                            <NavLink href="#config">Configuration</NavLink>
                            <NavLink href="#moderation">Moderation</NavLink>
                        </NavGroup>
                    </div>
                </div>

                {/* Main Content */}
                <div className="col-span-1 lg:col-span-3 space-y-16">

                    {/* Getting Started */}
                    <section id="getting-started">
                        <SectionHeader icon={<UserPlus />} title="Getting Started" />
                        <GlassCard className="p-8 space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-white">1. Invite Fortuna</h3>
                                <p className="text-zinc-400">Add the bot to your server using the invite link below. You need "Manage Server" permissions.</p>
                                <a href="https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands" className="inline-block px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors font-medium">Add to Discord</a>
                            </div>
                            <div className="space-y-4 pt-6 border-t border-white/10">
                                <h3 className="text-xl font-bold text-white">2. Initial Setup</h3>
                                <p className="text-zinc-400">Once added, run the setup command to configure your currency and economy settings.</p>
                                <CommandCard cmd="!setup" args="" desc="Launches interactive setup wizard." />
                            </div>
                        </GlassCard>
                    </section>

                    {/* FAQ */}
                    <section id="faq">
                        <SectionHeader icon={<HelpCircle />} title="Frequently Asked Questions" />
                        <div className="space-y-4">
                            <FAQItem q="How do I earn money?" a="Use commands like !daily, !work, and !weekly. You can also gamble in the casino or play the stock market." />
                            <FAQItem q="Why can't I use an item?" a="Check your inventory with !inv. Some items are passive, others require !use <item_name>." />
                            <FAQItem q="My balance is gone?" a="If the server admin reset the economy, all data is wiped. Or, you might have been robbed!" />
                            <FAQItem q="How do I get a job?" a="Use !jobs to see listing, then !apply <id>. Some jobs require a degree from !education." />
                        </div>
                    </section>

                    {/* Economy Section */}
                    <section id="banking">
                        <SectionHeader icon={<CreditCard />} title="Banking & Wallet" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard
                                cmd="!balance"
                                args=""
                                desc="Displays your current Wallet, Bank, and Net Worth."
                            />
                            <CommandCard
                                cmd="!deposit"
                                args="<amount | all>"
                                desc="Move money from your Wallet to your Bank. Banked money is safe from robbery."
                            />
                            <CommandCard
                                cmd="!withdraw"
                                args="<amount | all>"
                                desc="Move money from your Bank to your Wallet for spending."
                            />
                            <CommandCard
                                cmd="!transfer"
                                args="<@user> <amount>"
                                desc="Send money to another user. May be subject to transfer tax."
                            />
                        </div>
                    </section>

                    <section id="income">
                        <SectionHeader icon={<DollarSign />} title="Income & Rewards" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!daily" args="" desc="Claim your daily reward." />
                            <CommandCard cmd="!weekly" args="" desc="Claim your weekly reward." />
                            <CommandCard cmd="!monthly" args="" desc="Claim your monthly reward." />
                            <CommandCard cmd="!work" args="" desc="Perform a shift at your job. Requires a job (see Life Sim)." />
                            <CommandCard cmd="!crime" args="" desc="Attempt illegal activity for cash. High risk of fines/jail." />
                            <CommandCard cmd="!rob" args="<@user>" desc="Steal from another user's wallet." />
                            <CommandCard cmd="!collect" args="" desc="Collect income from Roles or Properties." />
                        </div>
                    </section>

                    <section id="market">
                        <SectionHeader icon={<ShoppingBag />} title="Shop & Market" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!shop" args="" desc="View the server shop." />
                            <CommandCard cmd="!shop buy" args="<item name>" desc="Purchase an item." />
                            <CommandCard cmd="!inventory" args="" desc="View your owned items." />
                            <CommandCard cmd="!use" args="<item name>" desc="Consume an item (e.g. food, potions)." />
                            <CommandCard cmd="!market" args="" desc="View the global Black Market (Player Trading)." />
                            <CommandCard cmd="!market list" args="<item> <price>" desc="Sell an item on the Black Market." />
                        </div>
                    </section>

                    <section id="stocks">
                        <SectionHeader icon={<TrendingUp />} title="Stocks" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!stock" args="" desc="View real-time stock prices." />
                            <CommandCard cmd="!stock buy" args="<symbol> <amount>" desc="Invest in a stock." />
                            <CommandCard cmd="!portfolio" args="" desc="View your investments and profits." />
                        </div>
                    </section>

                    {/* Games Section */}
                    <section id="casino">
                        <SectionHeader icon={<Dna />} title="Casino Games" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <GameCard
                                title="Blackjack"
                                cmd="!blackjack <amount>"
                                desc="Classic 21. Hit, Stand, Double Down supported."
                            />
                            <GameCard
                                title="Roulette"
                                cmd="!roulette <amount> <bet>"
                                desc="Bet on Red/Black (2x), Odd/Even (2x), or Numbers (36x)."
                            />
                            <GameCard
                                title="Slots"
                                cmd="!slots <amount>"
                                desc="Spin the machine for multipliers."
                            />
                            <GameCard
                                title="Coinflip"
                                cmd="!coinflip <amount> <heads/tails>"
                                desc="Double or nothing."
                            />
                            <GameCard
                                title="Cockfight"
                                cmd="!cockfight <amount>"
                                desc="Bet on your owned Chicken vs another."
                            />
                            <GameCard
                                title="Russian Roulette"
                                cmd="!rr <amount>"
                                desc="1/6 chance to lose it all. High risk."
                            />
                        </div>
                    </section>

                    {/* Life Sim Section */}
                    <section id="career">
                        <SectionHeader icon={<Briefcase />} title="Career" />
                        <GlassCard className="p-6 mb-4">
                            <p className="text-zinc-400">Advance through job tiers to earn higher paychecks.</p>
                        </GlassCard>
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!jobs" args="" desc="List available jobs." />
                            <CommandCard cmd="!apply" args="<job_id>" desc="Apply for a job (Checks Intelligence/Degrees)." />
                            <CommandCard cmd="!work" args="" desc="Work a shift. Increases Stress." />
                            <CommandCard cmd="!promote" args="" desc="Check eligibility for promotion." />
                            <CommandCard cmd="!resign" args="" desc="Quit your current job." />
                        </div>
                    </section>

                    <section id="education">
                        <SectionHeader icon={<GraduationCap />} title="Education" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!education" args="" desc="Browse university degrees." />
                            <CommandCard cmd="!enroll" args="<degree>" desc="Start a degree program." />
                            <CommandCard cmd="!study" args="" desc="Boost (GPA) and Intelligence." />
                        </div>
                    </section>

                    <section id="family">
                        <SectionHeader icon={<Heart />} title="Family & Lifestyle" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!marry" args="<@user>" desc="Propose to another user." />
                            <CommandCard cmd="!divorce" args="" desc="End a marriage." />
                            <CommandCard cmd="!relax" args="" desc="Reduce Stress (Gym, Meditation)." />
                        </div>
                    </section>

                    {/* Admin Section */}
                    <section id="config">
                        <SectionHeader icon={<Settings />} title="Admin Configuration" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!setup" args="" desc="Interactive server setup wizard." />
                            <CommandCard cmd="!set-currency" args="<name> <emoji>" desc="Customize currency (e.g. Coins 🪙)." />
                            <CommandCard cmd="!set-income" args="" desc="Configure Taxes, Interest Rates, Pay Multipliers." />
                            <CommandCard cmd="!add-shop-item" args="" desc="Create a new item in the shop." />
                            <CommandCard cmd="!manage-item" args="<name>" desc="Edit/Delete a shop item." />
                        </div>
                    </section>

                    <section id="moderation">
                        <SectionHeader icon={<Gavel />} title="Moderation" />
                        <div className="grid grid-cols-1 gap-4">
                            <CommandCard cmd="!add-money" args="<@user> <amount>" desc="Spawn money for a user." />
                            <CommandCard cmd="!remove-money" args="<@user> <amount>" desc="Remove money from a user." />
                            <CommandCard cmd="!reset-economy" args="" desc="DANGER: Resets all server economy data." />
                            <CommandCard cmd="!casino-ban" args="<@user>" desc="Ban a user from bot commands." />
                            <CommandCard cmd="!set-casino-channel" args="add <#channel>" desc="Whitelist bot to specific channels." />
                        </div>
                    </section>

                    {/* Support */}
                    <section id="support">
                        <SectionHeader icon={<MessageCircle />} title="Support & Community" />
                        <GlassCard className="p-8 text-center">
                            <h3 className="text-2xl font-bold text-white mb-4">Need Help?</h3>
                            <p className="text-zinc-400 mb-8 max-w-lg mx-auto">Have a question that wasn't answered? Found a bug? Or just want to hang out with other users?</p>
                            <a href="https://discord.gg/Y5P44UCH2Y" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-all font-bold shadow-lg hover:shadow-indigo-500/25">
                                Join Support Server
                            </a>
                        </GlassCard>
                    </section>

                </div>
            </div>
        </main>
    );
}

// --- Components ---

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">{title}</h3>
            <div className="flex flex-col space-y-2 border-l border-white/10 pl-4">
                {children}
            </div>
        </div>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} className="text-sm text-zinc-400 hover:text-violet-400 transition-colors block py-1">
            {children}
        </a>
    );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-3 mb-6 scroll-mt-32">
            <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                {icon}
            </div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>
    );
}

function CommandCard({ cmd, args, desc }: { cmd: string; args: string; desc: string }) {
    return (
        <div className="bg-white/5 border border-white/5 rounded-lg p-5 hover:bg-white/10 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="font-mono text-sm">
                <span className="text-violet-400 font-bold">{cmd}</span>
                {args && <span className="text-zinc-500 ml-2">{args}</span>}
            </div>
            <p className="text-sm text-zinc-300 md:text-right">{desc}</p>
        </div>
    );
}

function GameCard({ title, cmd, desc }: { title: string; cmd: string; desc: string }) {
    return (
        <GlassCard className="p-6 space-y-3">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <code className="block text-xs bg-black/30 p-2 rounded text-violet-300 font-mono">{cmd}</code>
            <p className="text-sm text-zinc-400">{desc}</p>
        </GlassCard>
    );
}

function FAQItem({ q, a }: { q: string, a: string }) {
    return (
        <div className="border border-white/5 rounded-lg p-4 bg-white/[0.02]">
            <h4 className="text-white font-bold mb-2">{q}</h4>
            <p className="text-zinc-400 text-sm">{a}</p>
        </div>
    )
}
