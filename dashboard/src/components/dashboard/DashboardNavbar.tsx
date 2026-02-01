"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Bell, Search, Menu, LogOut, LayoutGrid, Settings as SettingsIcon } from "lucide-react";
import { type DiscordGuild } from "@/lib/discord";
import { type Session } from "next-auth";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DashboardNavbarProps {
    guild: DiscordGuild;
    user: Session["user"];
}

export function DashboardNavbar({ guild, user }: DashboardNavbarProps) {
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();

    // In a real app, this would be the actual bot avatar URL
    const botAvatarUrl = "https://cdn.discordapp.com/avatars/121709476043695245/456789.png"; // Placeholder or use branding

    const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : null;

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        // Basic search routing - strictly for demonstration as requested "functionable"
        // Ideally opens a Command Palette (CMDK)
        console.log("Searching for:", searchQuery);
        // Could router.push(`/dashboard/${guild.id}/search?q=${searchQuery}`)
    };

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[#09090b] border-b border-white/5 z-50 flex items-center justify-between px-4 md:px-6">
            {/* Left: Branding & Mobile Menu */}
            <div className="flex items-center gap-4">
                <button className="md:hidden text-zinc-400 hover:text-white">
                    <Menu size={24} />
                </button>

                <Link href="/dashboard" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 relative rounded-full overflow-hidden border border-white/10 shadow-[0_0_15px_rgba(255,215,0,0.2)] group-hover:shadow-[0_0_25px_rgba(255,215,0,0.4)] transition-all">
                        {/* Replace with actual Fortuna Avatar URL if available, else standard fallback */}
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center font-bold text-primary">F</div>
                        {/* <Image src={botAvatarUrl} alt="Fortuna" fill className="object-cover" /> */}
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
                            <div className="absolute top-full left-0 mt-2 w-64 bg-[#111] border border-white/10 rounded-xl shadow-xl z-50 p-2 animate-in fade-in slide-in-from-top-2">
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
                <form onSubmit={handleSearch} className="hidden md:flex items-center px-3 py-1.5 bg-zinc-900 border border-white/5 rounded-full text-zinc-500 text-sm w-64 hover:border-white/10 transition-colors focus-within:border-primary/30 focus-within:text-white">
                    <Search size={14} className="mr-2 shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search settings..."
                        className="bg-transparent border-none outline-none w-full text-sm placeholder:text-zinc-600"
                    />
                    <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-zinc-500">
                        <span className="text-xs">⌘</span>K
                    </kbd>
                </form>

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
                            <div className="absolute top-full right-0 mt-2 w-56 bg-[#111] border border-white/10 rounded-xl shadow-xl z-50 p-1 animate-in fade-in slide-in-from-top-2">
                                <div className="px-2 py-2 border-b border-white/5 mb-1">
                                    <p className="text-sm font-medium text-white">{user?.name}</p>
                                    <p className="text-xs text-zinc-500 truncate">{user?.email || "User"}</p>
                                </div>
                                <button className="w-full text-left flex items-center gap-2 px-2 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                                    <SettingsIcon size={16} />
                                    User Settings
                                </button>
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
