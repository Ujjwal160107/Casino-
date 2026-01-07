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
    ShieldAlert,
    ChevronDown,
    ChevronRight
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
    matches?: string[]; // strings to match against pathname 
}

type NavSection = {
    title: string;
    items: NavItem[];
}

export function AdminSidebar({ guild }: AdminSidebarProps) {
    const pathname = usePathname();
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        "Life Economy": true,
        "General Economy": true,
    });

    const toggleSection = (title: string) => {
        setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
    };

    const sections: NavSection[] = [
        {
            title: "Overview",
            items: [
                { label: "Dashboard", href: `/dashboard/${guild.id}`, icon: LayoutDashboard, matches: [`/dashboard/${guild.id}`] }
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
            title: "General Economy",
            items: [
                { label: "Income", href: `/dashboard/${guild.id}/general-economy/income`, icon: Coins },
                { label: "Configuration", href: `/dashboard/${guild.id}/general-economy/config`, icon: Settings },
            ]
        },
        {
            title: "Casino",
            items: [
                { label: "Games & Stats", href: `/dashboard/${guild.id}/casino`, icon: Dices },
            ]
        },
        {
            title: "Moderation",
            items: [
                { label: "Logs & Warnings", href: `/dashboard/${guild.id}/moderation`, icon: ShieldAlert },
            ]
        }
    ];

    const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : null;

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-zinc-950 border-r border-white/5 flex flex-col z-40">
            {/* Header / Guild Info */}
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 overflow-hidden border border-white/10">
                    {iconUrl ? (
                        <Image
                            src={iconUrl}
                            alt={guild.name}
                            width={40}
                            height={40}
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                            {guild.name.charAt(0)}
                        </div>
                    )}
                </div>
                <div className="overflow-hidden">
                    <h2 className="text-white font-bold truncate text-sm font-serif tracking-wide">{guild.name}</h2>
                    <p className="text-xs text-yellow-500 uppercase tracking-widest font-semibold">Admin Panel</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {sections.map((section) => (
                    <div key={section.title}>
                        {section.title !== "Overview" && (
                            <button
                                onClick={() => toggleSection(section.title)}
                                className="flex items-center justify-between w-full text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 hover:text-zinc-300 transition-colors"
                            >
                                {section.title}
                                {openSections[section.title] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                        )}

                        {(section.title === "Overview" || openSections[section.title]) && (
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    const Icon = item.icon;

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                                                isActive
                                                    ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent"
                                            )}
                                        >
                                            <Icon size={18} className={cn(
                                                "transition-colors",
                                                isActive ? "text-yellow-500" : "text-zinc-600 group-hover:text-zinc-400"
                                            )} />
                                            {item.label}
                                        </Link>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </nav>

            {/* Footer / Back link */}
            <div className="p-4 border-t border-white/5">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 justify-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    &larr; Return to Server Selection
                </Link>
            </div>
        </aside>
    );
}
