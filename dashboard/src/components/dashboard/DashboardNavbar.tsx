"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Bell, Search, Menu, LogOut, LayoutGrid, Settings as SettingsIcon, ExternalLink } from "lucide-react";
import { type DiscordGuild } from "@/lib/discord";
import { type Session } from "next-auth";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DashboardNavbarProps {
    guild: DiscordGuild;
    user: Session["user"];
}

type SearchItem = {
    title: string;
    description: string;
    category: string;
    href: string;
    keywords: string[];
}

export function DashboardNavbar({ guild, user }: DashboardNavbarProps) {
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showResults, setShowResults] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : null;

    // Search Index
    const searchItems: SearchItem[] = useMemo(() => [
        {
            title: "General Settings",
            description: "Prefix, Currency, Wallet Limits, Starting Balance",
            category: "Config",
            href: `/dashboard/${guild.id}/general-economy/config`,
            keywords: ["prefix", "money", "currency", "balance", "start", "wallet", "limit"]
        },
        {
            title: "Bank Configuration",
            description: "Interest rates, Bank limits, Loans",
            category: "Economy",
            href: `/dashboard/${guild.id}/general-economy/bank`,
            keywords: ["bank", "interest", "loan", "deposit", "withdraw"]
        },
        {
            title: "Income Settings",
            description: "Daily rewards, weekly, monthly income",
            category: "Economy",
            href: `/dashboard/${guild.id}/general-economy/income`,
            keywords: ["daily", "weekly", "monthly", "reward", "income"]
        },
        {
            title: "Shop Items",
            description: "Manage shop inventory and items",
            category: "Shop",
            href: `/dashboard/${guild.id}/shop-misc/shop`,
            keywords: ["shop", "item", "inventory", "buy", "sell"]
        },
        {
            title: "Casino Games",
            description: "Game configs, betting limits",
            category: "Casino",
            href: `/dashboard/${guild.id}/casino`,
            keywords: ["casino", "game", "bet", "gamble", "coinflip", "slots"]
        },
        {
            title: "Jobs",
            description: "Configure jobs and salaries",
            category: "Life",
            href: `/dashboard/${guild.id}/life-economy/job`,
            keywords: ["job", "work", "salary", "shift"]
        },
        {
            title: "Education",
            description: "Degrees and tuition settings",
            category: "Life",
            href: `/dashboard/${guild.id}/life-economy/education`,
            keywords: ["school", "education", "degree", "university"]
        }
    ], [guild.id]);

    const filteredResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const query = searchQuery.toLowerCase();
        return searchItems.filter(item =>
            item.title.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            item.keywords.some(k => k.includes(query))
        );
    }, [searchQuery, searchItems]);

    // Close search on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearchSelect = (href: string) => {
        setSearchQuery("");
        setShowResults(false);
        router.push(href);
    };

    return (
        <header className="fixed top-0 left-0 right-0 h-16 glass z-50 flex items-center justify-between px-4 md:px-6 transition-all duration-300">
            {/* Left: Branding & Mobile Menu */}
            <div className="flex items-center gap-4">
                <button className="md:hidden text-zinc-400 hover:text-white">
                    <Menu size={24} />
                </button>

                <Link href="/dashboard" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 relative rounded-full overflow-hidden border border-white/10 shadow-[0_0_15px_rgba(255,215,0,0.2)] group-hover:shadow-[0_0_25px_rgba(255,215,0,0.4)] transition-all">
                        <Image
                            src="/fortuna_icon.png"
                            alt="Fortuna"
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>
                    <span className="font-bold text-xl tracking-tight text-white hidden sm:block">
                        FORTUNA
                    </span>
                </Link>

                {/* Vertical Divider */}
                <div className="h-6 w-px bg-white/10 hidden md:block mx-2" />

                {/* Server Context Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
                        className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer group border border-transparent hover:border-white/5"
                    >
                        <div className="w-6 h-6 rounded-full bg-zinc-800 shrink-0 overflow-hidden border border-white/10 relative">
                            {iconUrl ? (
                                <Image
                                    src={iconUrl}
                                    alt={guild.name}
                                    fill
                                    className="object-cover"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full w-full text-[10px] text-zinc-400 font-bold">
                                    {guild.name.charAt(0)}
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-medium text-zinc-200 group-hover:text-white truncate max-w-[150px]">
                            {guild.name}
                        </span>
                        <ChevronDown size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                    </button>

                    {/* Server Dropdown Content */}
                    {isServerMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsServerMenuOpen(false)} />
                            <div className="absolute top-full left-0 mt-2 w-64 glass-card rounded-xl shadow-xl z-50 p-2 animate-in fade-in slide-in-from-top-2">
                                <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                    Current Server
                                </div>
                                <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5 border border-white/5 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0 overflow-hidden border border-white/10 relative">
                                        {iconUrl ? (
                                            <Image src={iconUrl} alt={guild.name} fill className="object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full w-full text-xs text-zinc-400 font-bold">{guild.name.charAt(0)}</div>
                                        )}
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="text-sm font-bold text-white truncate">{guild.name}</div>
                                        <div className="text-xs text-zinc-500">Administrator</div>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5 my-1" />

                                <Link
                                    href="/dashboard"
                                    onClick={() => setIsServerMenuOpen(false)}
                                    className="flex items-center gap-2 px-2 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    <LayoutGrid size={16} />
                                    Switch Server
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Right: Actions & User */}
            <div className="flex items-center gap-4">
                {/* Search */}
                <div ref={searchContainerRef} className="relative hidden md:block">
                    <div className="flex items-center px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-zinc-400 text-sm w-64 hover:bg-white/10 transition-colors focus-within:border-primary/50 focus-within:text-white focus-within:w-72 focus-within:bg-black/40 duration-200">
                        <Search size={14} className="mr-2 shrink-0" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowResults(true);
                            }}
                            onFocus={() => setShowResults(true)}
                            placeholder="Search settings..."
                            className="bg-transparent border-none outline-none w-full text-sm placeholder:text-zinc-600"
                        />
                        <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-zinc-500">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </div>

                    {/* Search Results Dropdown */}
                    {showResults && searchQuery.trim() && (
                        <div className="absolute top-full right-0 mt-2 w-80 glass-card rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 p-2">
                            {filteredResults.length > 0 ? (
                                <div className="space-y-1">
                                    <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        Results
                                    </div>
                                    {filteredResults.slice(0, 5).map((result, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSearchSelect(result.href)}
                                            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="shrink-0 p-2 rounded-md bg-white/5 text-zinc-400 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                                                <SettingsIcon size={16} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-zinc-200 group-hover:text-white">
                                                    {result.title}
                                                </div>
                                                <div className="text-xs text-zinc-500 line-clamp-1">
                                                    {result.description}
                                                </div>
                                            </div>
                                            <ExternalLink size={12} className="ml-auto opacity-0 group-hover:opacity-100 text-zinc-500" />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 text-center text-zinc-500 text-sm">
                                    No results found.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="h-6 w-px bg-white/10 hidden md:block" />

                <button className="relative text-zinc-400 hover:text-white transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-black" />
                </button>

                {/* User Profile */}
                <div className="relative pl-2 border-l border-white/5">
                    <button
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="flex items-center gap-3 cursor-pointer hover:bg-white/5 py-1 px-2 rounded-full transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden border border-white/10 relative">
                            {user?.image ? (
                                <Image
                                    src={user.image}
                                    alt={user.name || "User"}
                                    fill
                                    className="object-cover"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full w-full bg-primary/20 text-primary font-bold">
                                    {user?.name?.charAt(0) || "U"}
                                </div>
                            )}
                        </div>
                        <div className="hidden md:block text-left">
                            <p className="text-sm font-medium text-white leading-none">{user?.name}</p>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mt-0.5">Admin</p>
                        </div>
                        <ChevronDown size={14} className="text-zinc-500 hidden md:block ml-1" />
                    </button>

                    {/* User Dropdown */}
                    {isUserMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
                            <div className="absolute top-full right-0 mt-2 w-56 glass-card rounded-xl shadow-xl z-50 p-1 animate-in fade-in slide-in-from-top-2">
                                <div className="px-2 py-2 border-b border-white/5 mb-1">
                                    <p className="text-sm font-medium text-white">{user?.name}</p>
                                    <p className="text-xs text-zinc-500 truncate">{user?.email || "User"}</p>
                                </div>
                                <button
                                    onClick={() => signOut()}
                                    className="w-full text-left flex items-center gap-2 px-2 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <LogOut size={16} />
                                    Log out
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
