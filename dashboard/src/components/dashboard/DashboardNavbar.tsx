"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Bell, Search, Menu } from "lucide-react";
import { type DiscordGuild } from "@/lib/discord";
import { type Session } from "next-auth";

interface DashboardNavbarProps {
    guild: DiscordGuild;
    user: Session["user"];
}

export function DashboardNavbar({ guild, user }: DashboardNavbarProps) {
    const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : null;

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[#09090b] border-b border-white/5 z-50 flex items-center justify-between px-4 md:px-6">
            {/* Left: Branding & Mobile Menu */}
            <div className="flex items-center gap-4">
                <button className="md:hidden text-zinc-400 hover:text-white">
                    <Menu size={24} />
                </button>

                <Link href="/dashboard" className="flex items-center gap-2 group">
                    <div className="w-8 h-8 bg-gradient-to-br from-primary to-yellow-600 rounded-lg flex items-center justify-center text-black font-bold text-lg shadow-[0_0_15px_rgba(255,215,0,0.3)] group-hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all duration-300">
                        F
                    </div>
                    <span className="font-bold text-xl tracking-tight text-white hidden sm:block">
                        FORTUNA <span className="text-primary text-xs align-top opacity-80">ADMIN</span>
                    </span>
                </Link>

                {/* Vertical Divider */}
                <div className="h-6 w-px bg-white/10 hidden md:block mx-2" />

                {/* Server Context (Sapphire Style) */}
                <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer group">
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
                </div>
            </div>

            {/* Right: Actions & User */}
            <div className="flex items-center gap-4">
                {/* Search - Decorative for now */}
                <div className="hidden md:flex items-center px-3 py-1.5 bg-zinc-900 border border-white/5 rounded-full text-zinc-500 text-sm w-64 hover:border-white/10 transition-colors cursor-text">
                    <Search size={14} className="mr-2" />
                    <span>Search settings...</span>
                    <span className="ml-auto text-xs px-1.5 py-0.5 bg-white/5 rounded text-zinc-600">Ctrl K</span>
                </div>

                <div className="h-6 w-px bg-white/10 hidden md:block" />

                <button className="relative text-zinc-400 hover:text-white transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-black" />
                </button>

                {/* User Profile */}
                <div className="flex items-center gap-3 pl-2 border-l border-white/5">
                    <div className="flex items-center gap-2 cursor-pointer hover:bg-white/5 py-1 px-2 rounded-full transition-colors">
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
                    </div>
                </div>
            </div>
        </header>
    );
}
