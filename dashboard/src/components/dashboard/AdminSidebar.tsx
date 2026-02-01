"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    GraduationCap,
    Briefcase,
    Home,
    Heart,
    Coins,
    Settings,
    Dices,
    ChevronDown,
    ChevronRight,
    ShoppingBag
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DiscordGuild } from "@/lib/discord";

interface AdminSidebarProps {
    guild: DiscordGuild;
}

type NavItem = {
    label: string;
    href: string;
    icon: any;
    matches?: string[];
}

type NavSection = {
    title: string;
    items: NavItem[];
}

export function AdminSidebar({ guild }: AdminSidebarProps) {
    const pathname = usePathname();
    // Default open sections for better UX
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        "Overview": true,
        "General Economy": true,
        "Life Economy": false,
        "Casino": true,
        "Shop & Misc": false,
    });

    const toggleSection = (title: string) => {
        setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
    };

    const sections: NavSection[] = [
        {
            title: "Overview",
            items: [
                { label: "Overview", href: `/dashboard/${guild.id}`, icon: LayoutDashboard }
            ]
        },
        {
            title: "General Economy",
            items: [
                { label: "Income", href: `/dashboard/${guild.id}/general-economy/income`, icon: Coins },
                { label: "Bank", href: `/dashboard/${guild.id}/general-economy/bank`, icon: Briefcase },
                { label: "Configuration", href: `/dashboard/${guild.id}/general-economy/config`, icon: Settings },
            ]
        },
        {
            title: "Life Economy",
            items: [
                { label: "Education", href: `/dashboard/${guild.id}/life-economy/education`, icon: GraduationCap },
                { label: "Jobs", href: `/dashboard/${guild.id}/life-economy/job`, icon: Briefcase },
                { label: "Properties", href: `/dashboard/${guild.id}/life-economy/property`, icon: Home },
                { label: "Marriage", href: `/dashboard/${guild.id}/life-economy/marriage`, icon: Heart },
            ]
        },
        {
            title: "Casino",
            items: [
                { label: "Games & Stats", href: `/dashboard/${guild.id}/casino`, icon: Dices },
            ]
        },
        {
            title: "Shop & Misc",
            items: [
                { label: "Role Income", href: `/dashboard/${guild.id}/shop-misc/role-income`, icon: Coins },
                { label: "Shop Items", href: `/dashboard/${guild.id}/shop-misc/shop`, icon: ShoppingBag },
            ]
        },
    ];

    const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : null;

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 glass-sidebar flex flex-col z-40 text-zinc-300 font-sans">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-black/20">
                <div className="w-10 h-10 rounded-full bg-primary/10 shrink-0 overflow-hidden border border-white/5 flex items-center justify-center">
                    {iconUrl ? (
                        <Image
                            src={iconUrl}
                            alt={guild.name}
                            width={40}
                            height={40}
                            className="object-cover"
                        />
                    ) : (
                        <div className="text-primary font-bold text-lg">
                            {guild.name.charAt(0)}
                        </div>
                    )}
                </div>
                <div className="overflow-hidden">
                    <h2 className="text-white font-bold truncate text-sm tracking-wide">{guild.name}</h2>
                    <p className="text-[10px] text-primary uppercase tracking-[0.2em] font-bold opacity-80">Admin Panel</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {sections.map((section) => (
                    <div key={section.title} className="space-y-3">
                        {/* Sapphire Style Header: Small, Uppercase, Muted */}
                        {section.title !== "Overview" && (
                            <div className="flex items-center justify-between px-3">
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">
                                    {section.title}
                                </h3>
                                {/* Toggle removed for cleaner list look, or can be kept if preferred. 
                                    Sapphire usually lists all modules clearly. 
                                    Expanding all by default for cleaner 'list' view. */}
                            </div>
                        )}

                        <div className="space-y-1">
                            {section.items.map((item) => {
                                const isActive = pathname === item.href;
                                const Icon = item.icon;

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 group relative",
                                            isActive
                                                ? "text-white font-medium bg-white/5" // Active: Simple background highlight
                                                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                                        )}
                                    >
                                        {/* Active Indicator Bar on Left */}
                                        {isActive && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 bg-primary rounded-r-full" />
                                        )}

                                        <Icon size={18} className={cn(
                                            "shrink-0 transition-colors",
                                            isActive ? "text-primary dark:text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                                        )} />
                                        <span className="truncate">{item.label}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-black/20 backdrop-blur-md">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 justify-center text-xs font-medium text-zinc-500 hover:text-primary transition-colors py-2 rounded-md hover:bg-white/5"
                >
                    &larr; Switch Server
                </Link>
            </div>
        </aside>
    );
}
