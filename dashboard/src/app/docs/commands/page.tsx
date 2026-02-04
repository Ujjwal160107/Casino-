"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { SectionHeader, CommandCard, NavGroup, NavLink } from "@/components/docs/SharedDocs";
import { GeneralSidebar } from "@/components/GeneralSidebar";
import { Shield, CreditCard, ShoppingBag, Dna, Briefcase, GraduationCap, TrendingUp, Settings, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CommandsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-violet-500/30">
            <LandingNavbar hideLogin={true} />

            {/* Hero Section */}
            <section className="relative pt-32 pb-12 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-violet-900/10 to-transparent pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <Link href="/docs" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
                        <ArrowLeft size={16} /> Back to Guide
                    </Link>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400 mb-4"
                    >
                        Command Reference
                    </motion.h1>
                    <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                        A complete list of all available commands in Fortuna.
                    </p>
                </div>
            </section>

            <div className="max-w-[1400px] mx-auto px-6 pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* General Sidebar (Left) */}
                <div className="col-span-2">
                    <GeneralSidebar />
                </div>

                {/* Content (Center) */}
                <div className="col-span-1 lg:col-span-8 space-y-16">

                    {/* Economy */}
                    <section id="economy">
                        <SectionHeader icon={<CreditCard />} title="Economy & Banking" />
                        <div className="grid grid-cols-1 gap-3">
                            <CommandCard cmd="!balance" args="[@user]" desc="Check wallet and bank balance." />
                            <CommandCard cmd="!deposit" args="<amount | all>" desc="Secure money in your bank account." />
                            <CommandCard cmd="!withdraw" args="<amount | all>" desc="Take money out of your bank." />
                            <CommandCard cmd="!transfer" args="<@user> <amount>" desc="Send money to another player." />
                            <CommandCard cmd="!daily" desc="Claim your daily cash reward." />
                            <CommandCard cmd="!weekly" desc="Claim your weekly reward." />
                            <CommandCard cmd="!monthly" desc="Claim your monthly reward." />
                            <CommandCard cmd="!collect" desc="Collect passive income from roles/properties." />
                            <CommandCard cmd="!vote" desc="Vote for the bot to earn rewards." />
                            <CommandCard cmd="!rob" args="<@user>" desc="Attempt to steal money from someone." />
                            <CommandCard cmd="!crime" desc="Commit a crime for quick cash (High risk)." />
                            <CommandCard cmd="!profile" args="[@user]" desc="View full user profile." />
                            <CommandCard cmd="!leaderboard" desc="View the server's richest players." />
                            <CommandCard cmd="!leaderboard global" desc="View global rankings." />
                        </div>
                    </section>

                    {/* Games */}
                    <section id="games">
                        <SectionHeader icon={<Dna />} title="Casino Games" />
                        <div className="grid grid-cols-1 gap-3">
                            <CommandCard cmd="!blackjack" args="<amount>" desc="Play a hand of Blackjack." />
                            <CommandCard cmd="!roulette" args="<amount> <bet>" desc="Bet on Red, Black, Odd, Even, or Numbers." />
                            <CommandCard cmd="!slots" args="<amount>" desc="Spin the slot machine." />
                            <CommandCard cmd="!coinflip" args="<amount> <heads/tails>" desc="Simple double or nothing." />
                            <CommandCard cmd="!cockfight" args="<amount>" desc="Bet on your chicken in a fight." />
                            <CommandCard cmd="!manage-chicken" desc="Train or feed your fighting chicken." />
                            <CommandCard cmd="!rr" args="<amount>" desc="Russian Roulette. 1/6 chance to die." />
                        </div>
                    </section>

                    {/* Life Sim */}
                    <section id="life">
                        <SectionHeader icon={<Briefcase />} title="Life & Career" />
                        <div className="grid grid-cols-1 gap-3">
                            <CommandCard cmd="!jobs" desc="Browse available job listings." />
                            <CommandCard cmd="!apply" args="<job_id>" desc="Apply for a job." />
                            <CommandCard cmd="!work" desc="Work a shift to earn your paycheck." />
                            <CommandCard cmd="!resign" desc="Quit your current job." />
                            <CommandCard cmd="!marry" args="<@user>" desc="Propose to a partner." />
                            <CommandCard cmd="!divorce" desc="End your marriage." />
                            <CommandCard cmd="!relax" desc="Reduce stress levels." />
                            <CommandCard cmd="!properties" desc="View real estate listings." />
                            <CommandCard cmd="!buy-property" args="<id>" desc="Purchase a property." />
                        </div>
                    </section>

                    {/* Education */}
                    <section id="education">
                        <SectionHeader icon={<GraduationCap />} title="Education" />
                        <div className="grid grid-cols-1 gap-3">
                            <CommandCard cmd="!education" desc="List available degrees and universities." />
                            <CommandCard cmd="!enroll" args="<degree_id>" desc="Start studying for a degree." />
                            <CommandCard cmd="!study" desc="Increase your intelligence and GPA." />
                            <CommandCard cmd="!dropout" desc="Quit your current course." />
                            <CommandCard cmd="!uni-shop" desc="Buy school supplies." />
                        </div>
                    </section>

                    {/* Shop */}
                    <section id="shop">
                        <SectionHeader icon={<ShoppingBag />} title="Shop & Items" />
                        <div className="grid grid-cols-1 gap-3">
                            <CommandCard cmd="!shop" desc="Open the server shop." />
                            <CommandCard cmd="!buy" args="<item_name>" desc="Purchase an item." />
                            <CommandCard cmd="!inventory" desc="Check your backpack." />
                            <CommandCard cmd="!use" args="<item_name>" desc="Use an item." />
                            <CommandCard cmd="!equip" args="<item_name>" desc="Equip a tool or accessory." />
                            <CommandCard cmd="!item-info" args="<item_name>" desc="View detailed item stats." />
                            <CommandCard cmd="!market" desc="Global black market listings." />
                            <CommandCard cmd="!market sell" args="<item> <price>" desc="List an item for sale." />
                        </div>
                    </section>

                    {/* Stocks */}
                    <section id="stocks">
                        <SectionHeader icon={<TrendingUp />} title="Stocks & Investment" />
                        <div className="grid grid-cols-1 gap-3">
                            <CommandCard cmd="!stock" desc="View real-time stock market." />
                            <CommandCard cmd="!stock buy" args="<symbol> <amount>" desc="Buy shares." />
                            <CommandCard cmd="!stock sell" args="<symbol> <amount>" desc="Sell shares." />
                            <CommandCard cmd="!portfolio" desc="View your investment performance." />
                        </div>
                    </section>

                    {/* Admin */}
                    <section id="admin">
                        <SectionHeader icon={<Settings />} title="Admin Commands" />

                        <div className="space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Essentials</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!setup" desc="Run the interactive setup wizard." />
                                    <CommandCard cmd="!admin-dashboard" desc="View the main admin control panel." />
                                    <CommandCard cmd="!view-config" desc="View current server configuration." />
                                    <CommandCard cmd="!set-prefix" args="<new_prefix>" desc="Change the bot's command prefix." />
                                    <CommandCard cmd="!debug-perms" desc="Check bot permissions and missing scopes." />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Economy Management</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!add-money" args="<@user> <amount>" desc="Give money to a user." />
                                    <CommandCard cmd="!remove-money" args="<@user> <amount>" desc="Remove money from a user." />
                                    <CommandCard cmd="!set-money" args="<@user> <amount>" desc="Set a user's exact balance." />
                                    <CommandCard cmd="!set-currency" args="<name>" desc="Change the currency name." />
                                    <CommandCard cmd="!set-currency-emoji" args="<emoji>" desc="Change the currency symbol." />
                                    <CommandCard cmd="!set-start-money" args="<amount>" desc="Set starting cash for new members." />
                                    <CommandCard cmd="!reset-economy" desc="Wipe everyone's money (Dangerous)." />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Shops & Items</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!add-shop-item" desc="Create a new item in the shop." />
                                    <CommandCard cmd="!manage-shop" desc="Edit or remove shop items." />
                                    <CommandCard cmd="!add-emoji" args="<name> <url>" desc="Add generic emojis for items." />
                                    <CommandCard cmd="!remove-item" args="<@user> <item>" desc="Forcefully remove an item from a user." />
                                    <CommandCard cmd="!reset-shop" desc="Delete ALL items from the shop." />
                                    <CommandCard cmd="!manage-job-store" desc="Edit items required for jobs." />
                                    <CommandCard cmd="!manage-uni-store" desc="Edit items sold in the university." />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Income & Jobs</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!config-jobs" desc="Configure job salaries and requirements." />
                                    <CommandCard cmd="!set-income" desc="Configure tax rates and income limits." />
                                    <CommandCard cmd="!set-income-cooldown" args="<seconds>" desc="Set cooldown for work/crime." />
                                    <CommandCard cmd="!set-role-income" args="<@role> <amount>" desc="Set passive income for a role." />
                                    <CommandCard cmd="!chat-money-config" desc="Configure cash drops for chatting." />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Gambling & Games</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!set-casino-channel" args="<#channel>" desc="Restrict gambling commands to a channel." />
                                    <CommandCard cmd="!set-game-cooldown" args="<seconds>" desc="Set cooldown between games." />
                                    <CommandCard cmd="!set-global-game-cooldown" args="<seconds>" desc="Set server-wide gambling rate limit." />
                                    <CommandCard cmd="!set-min-bet" args="<amount>" desc="Set the minimum bet amount." />
                                    <CommandCard cmd="!bet-limit" args="<amount>" desc="Set the maximum bet amount." />
                                    <CommandCard cmd="!casino-ban" args="<@user>" desc="Ban a user from gambling games." />
                                    <CommandCard cmd="!casino-unban" args="<@user>" desc="Unban a user from details." />
                                    <CommandCard cmd="!casino-ban-list" desc="View all banned gamblers." />
                                    <CommandCard cmd="!setup-drop" desc="Configure random channel money drops." />
                                    <CommandCard cmd="!manage-chicken" desc="Admin tools for chicken fighting." />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Credit & Loans</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!manage-credit" desc="Configure credit score rules." />
                                    <CommandCard cmd="!set-credit-score" args="<@user> <score>" desc="Manually adjust a user's score." />
                                    <CommandCard cmd="!config-credit-tier" desc="Define interest rates per tier." />
                                    <CommandCard cmd="!loan-ban" args="<@user>" desc="Block a user from taking loans." />
                                    <CommandCard cmd="!reset-loans" desc="Wipe all active loan data." />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-violet-400 mb-4 border-b border-white/10 pb-2">Other</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <CommandCard cmd="!education-admin" desc="Manage degrees and universities." />
                                    <CommandCard cmd="!admin-property" desc="Manage properties (create/edit/delete)." />
                                    <CommandCard cmd="!set-log-channel" args="<#channel>" desc="Set channel for economy logs." />
                                    <CommandCard cmd="!test-welcome" desc="Preview the welcome message." />
                                    <CommandCard cmd="!factory-reset" desc="Reset all bot data for this server." />
                                </div>
                            </div>
                        </div>
                    </section>

                </div>


                {/* Categories Sidebar (Right) */}
                <div className="hidden lg:block col-span-2">
                    <div className="sticky top-32 space-y-8 max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
                        <NavGroup title="Categories">
                            <NavLink href="#economy">Economy</NavLink>
                            <NavLink href="#games">Games</NavLink>
                            <NavLink href="#life">Life & Career</NavLink>
                            <NavLink href="#education">Education</NavLink>
                            <NavLink href="#shop">Shop & Items</NavLink>
                            <NavLink href="#stocks">Stocks & Crypto</NavLink>
                            <NavLink href="#admin">Admin Settings</NavLink>
                        </NavGroup>
                    </div>
                </div>
            </div>
            <Footer />
        </main >
    );
}
