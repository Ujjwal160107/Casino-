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
        <aside className="fixed left-0 top-0 h-screen w-64 glass-sidebar flex flex-col z-40 text-zinc-300">
            {/* Header */}
            <div className="p-6 border-b border-primary/10 flex items-center gap-3 bg-black/20">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-800 to-black shrink-0 overflow-hidden border border-primary/20 shadow-lg shadow-black/50">
                    {iconUrl ? (
                        <Image
                            src={iconUrl}
                            alt={guild.name}
                            width={48}
                            height={48}
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary font-bold text-xl font-serif">
                            {guild.name.charAt(0)}
                        </div>
                    )}
                </div>
                <div className="overflow-hidden">
                    <h2 className="text-white font-bold truncate text-sm font-serif tracking-wide">{guild.name}</h2>
                    <p className="text-[10px] text-primary uppercase tracking-[0.2em] font-bold opacity-80">Admin Panel</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {sections.map((section) => (
                    <div key={section.title}>
                        {section.title !== "Overview" && (
                            <button
                                onClick={() => toggleSection(section.title)}
                                className="flex items-center justify-between w-full text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3 hover:text-primary transition-colors px-2"
                            >
                                {section.title}
                                <motion.div
                                    animate={{ rotate: openSections[section.title] ? 0 : -90 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <ChevronDown size={12} />
                                </motion.div>
                            </button>
                        )}

                        <motion.div
                            initial={false}
                            animate={{ height: openSections[section.title] ? "auto" : 0, opacity: openSections[section.title] ? 1 : 0 }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-1 mb-4">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    const Icon = item.icon;

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 group overflow-hidden",
                                                isActive
                                                    ? "text-primary bg-primary/10 shadow-[0_0_15px_-3px_rgba(255,215,0,0.15)] border border-primary/20"
                                                    : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeTab"
                                                    className="absolute inset-0 bg-primary/5 rounded-lg"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}

                                            <Icon size={18} className={cn(
                                                "relative z-10 transition-colors duration-300",
                                                isActive ? "text-primary drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" : "text-zinc-600 group-hover:text-zinc-300"
                                            )} />
                                            <span className="relative z-10">{item.label}</span>

                                            {isActive && (
                                                <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(255,215,0,0.8)]" />
                                            )}
                                        </Link>
                                    )
                                })}
                            </div>
                        </motion.div>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-primary/10 bg-black/20 backdrop-blur-md">
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
