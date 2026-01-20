"use client";

import { motion } from "framer-motion";
import { LandingNavbar } from "@/components/LandingNavbar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Terminal, Shield, Wallet, ShoppingBag, Settings, Gavel, GraduationCap, Dice5, FileCode } from "lucide-react";
import { useState } from "react";

const CATEGORIES = [
    { id: "economy", name: "Economy Management", icon: <Wallet className="text-emerald-400" /> },
    { id: "shop", name: "Shop & Items", icon: <ShoppingBag className="text-blue-400" /> },
    { id: "config", name: "Server Configuration", icon: <Settings className="text-zinc-400" /> },
    { id: "games", name: "Games & Gambling", icon: <Dice5 className="text-amber-400" /> },
    { id: "mod", name: "Moderation & User", icon: <Gavel className="text-red-400" /> },
    { id: "jobs", name: "Jobs & Education", icon: <GraduationCap className="text-violet-400" /> },
    { id: "misc", name: "Miscellaneous", icon: <FileCode className="text-pink-400" /> },
];

const COMMANDS = [
    // Economy
    { name: "add-money", desc: "Add money to a user's wallet or bank.", category: "economy", usage: "!add-money <user> <amount> [type]" },
    { name: "remove-money", desc: "Remove money from a user.", category: "economy", usage: "!remove-money <user> <amount> [type]" },
    { name: "set-money", desc: "Set a user's balance to a specific amount.", category: "economy", usage: "!set-money <user> <amount> [type]" },
    { name: "reset-economy", desc: "Reset the entire server economy (Dangerous).", category: "economy", usage: "!reset-economy" },
    { name: "set-start-money", desc: "Set the starting balance for new users.", category: "economy", usage: "!set-start-money <amount>" },
    { name: "set-currency", desc: "Set the currency name.", category: "economy", usage: "!set-currency <name>" },
    { name: "set-currency-emoji", desc: "Set the currency emoji symbol.", category: "economy", usage: "!set-currency-emoji <emoji>" },
    { name: "set-income", desc: "Configure global income settings.", category: "economy", usage: "!set-income" },
    { name: "set-role-income", desc: "Set passive income for specific roles.", category: "economy", usage: "!set-role-income <role> <amount>" },

    // Shop
    { name: "add-shop-item", desc: "Add a new item to the shop.", category: "shop", usage: "!add-shop-item" },
    { name: "remove-item", desc: "Remove an item from the shop.", category: "shop", usage: "!remove-item <name>" },
    { name: "manage-shop", desc: "Open the shop management dashboard.", category: "shop", usage: "!manage-shop" },
    { name: "manage-job-store", desc: "Manage items in the job-specific store.", category: "shop", usage: "!manage-job-store" },
    { name: "manage-uni-store", desc: "Manage items in the university store.", category: "shop", usage: "!manage-uni-store" },
    { name: "reset-shop", desc: "Delete all shop items.", category: "shop", usage: "!reset-shop" },

    // Config
    { name: "setup", desc: "Run the interactive server setup wizard.", category: "config", usage: "!setup" },
    { name: "view-config", desc: "View current server configuration.", category: "config", usage: "!view-config" },
    { name: "factory-reset", desc: "Reset all bot settings for this server.", category: "config", usage: "!factory-reset" },
    { name: "reset-admin-config", desc: "Reset admin permissions config.", category: "config", usage: "!reset-admin-config" },
    { name: "set-prefix", desc: "Change the bot command prefix.", category: "config", usage: "!set-prefix <new_prefix>" },
    { name: "set-log-channel", desc: "Set the channel for audit logs.", category: "config", usage: "!set-log-channel <#channel>" },
    { name: "set-casino-channel", desc: "Restrict casino game commands to specific channels.", category: "config", usage: "!set-casino-channel" },
    { name: "set-economy-config", desc: "Configure advanced economy settings.", category: "config", usage: "!set-economy-config" },
    { name: "debug-permissions", desc: "Debug permission issues for users/roles.", category: "config", usage: "!debug-permissions <user>" },
    { name: "add-emoji", desc: "Add external emojis to the server.", category: "config", usage: "!add-emoji" },

    // Games
    { name: "set-min-bet", desc: "Set the minimum bet amount.", category: "games", usage: "!set-min-bet <amount>" },
    { name: "bet-limit", desc: "Configure max bet limits.", category: "games", usage: "!bet-limit <amount>" },
    { name: "set-game-cooldown", desc: "Set cooldown for a specific game.", category: "games", usage: "!set-game-cooldown <game> <seconds>" },
    { name: "set-global-game-cooldown", desc: "Set a global cooldown for all games.", category: "games", usage: "!set-global-game-cooldown <seconds>" },
    { name: "set-cockfight", desc: "Configure cockfight game settings.", category: "games", usage: "!set-cockfight" },
    { name: "drop", desc: "Drop a random money box in the channel.", category: "games", usage: "!drop <amount>" },
    { name: "setup-drop", desc: "Configure automatic money drops.", category: "games", usage: "!setup-drop" },

    // Moderation
    { name: "casino-ban", desc: "Ban a user from using casino commands.", category: "mod", usage: "!casino-ban <user>" },
    { name: "casino-unban", desc: "Unban a user from casino commands.", category: "mod", usage: "!casino-unban <user>" },
    { name: "casino-ban-list", desc: "View list of banned users.", category: "mod", usage: "!casino-ban-list" },
    { name: "manage-loan-ban", desc: "Ban/Unban users from taking loans.", category: "mod", usage: "!manage-loan-ban" },
    { name: "manage-credit-score", desc: "Manually adjust a user's credit score.", category: "mod", usage: "!manage-credit-score <user>" },
    { name: "manage-credit-config", desc: "Configure credit score rules.", category: "mod", usage: "!manage-credit-config" },
    { name: "add-credit-tier", desc: "Add a new credit score tier.", category: "mod", usage: "!add-credit-tier" },
    { name: "config-credit-tier", desc: "Configure existing credit tiers.", category: "mod", usage: "!config-credit-tier" },

    // Jobs
    { name: "config-jobs", desc: "Configure job sectors and salaries.", category: "jobs", usage: "!config-jobs" },
    { name: "education-admin", desc: "Manage universities and degrees.", category: "jobs", usage: "!education-admin" },

    // Misc
    { name: "admin-dashboard", desc: "Open the main admin dashboard panel.", category: "misc", usage: "!admin-dashboard" },
    { name: "admin-property", desc: "Manage property listings.", category: "misc", usage: "!admin-property" },
    { name: "manage-casino-admin", desc: "Manage bot admin roles.", category: "misc", usage: "!manage-casino-admin" },
    { name: "chat-money-config", desc: "Configure money earned from chatting.", category: "misc", usage: "!chat-money-config" },
    { name: "manage-chicken", desc: "Manage user chickens.", category: "misc", usage: "!manage-chicken" },
    { name: "set-rob", desc: "Configure robbery settings.", category: "misc", usage: "!set-rob" },
];

export default function AdminCommandsPage() {
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    const filteredCommands = COMMANDS.filter(cmd => {
        const matchesCategory = selectedCategory === "all" || cmd.category === selectedCategory;
        const matchesSearch = cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cmd.desc.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-emerald-500/30">
            <LandingNavbar />

            <section className="relative pt-32 pb-12 px-6">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 to-transparent pointer-events-none" />
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div>
                            <motion.h1
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-4xl md:text-5xl font-bold text-white mb-3"
                            >
                                <span className="text-purple-400">Admin</span> Commands
                            </motion.h1>
                            <p className="text-zinc-400 text-lg">
                                Complete reference for all administrative commands.
                            </p>
                        </div>
                        <div className="w-full md:w-auto">
                            <input
                                type="text"
                                placeholder="Search commands..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full md:w-80 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="flex flex-wrap gap-2 mb-10">
                        <button
                            onClick={() => setSelectedCategory("all")}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedCategory === "all"
                                ? "bg-white text-black"
                                : "bg-white/5 text-zinc-400 hover:bg-white/10"
                                }`}
                        >
                            All Commands
                        </button>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${selectedCategory === cat.id
                                    ? "bg-purple-500/20 text-purple-200 border border-purple-500/30"
                                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                        {filteredCommands.length > 0 ? (
                            filteredCommands.map((cmd, idx) => (
                                <GlassCard key={idx} className="p-6 hover:bg-white/5 transition-colors group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="bg-white/5 p-2 rounded-md font-mono text-purple-300 font-bold tracking-wide">
                                            {cmd.name}
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            {CATEGORIES.find(c => c.id === cmd.category)?.icon}
                                        </div>
                                    </div>
                                    <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                                        {cmd.desc}
                                    </p>
                                    <div className="bg-black/40 rounded p-2 border border-white/5">
                                        <code className="text-xs text-zinc-500 font-mono block">
                                            {cmd.usage}
                                        </code>
                                    </div>
                                </GlassCard>
                            ))
                        ) : (
                            <div className="col-span-full py-20 text-center text-zinc-500">
                                No commands found matching your criteria.
                            </div>
                        )}
                    </div>

                </div>
            </section>
        </main>
    );
}
