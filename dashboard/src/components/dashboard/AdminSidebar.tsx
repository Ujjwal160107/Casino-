"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    LayoutDashboard,
    GraduationCap,
    Briefcase,
    Home,
    Heart,
    Coins,
    Settings,
    Dices,
    ShoppingBag,
    RotateCw
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DiscordGuild } from "@/lib/discord";
import { syncGuildData } from "@/actions/settings-actions";
import { toast } from "sonner";

interface AdminSidebarProps {
    guild: DiscordGuild;
}

type NavItem = {
    label: string;
    href: string;
    icon: any;
}

type NavSection = {
    title: string;
    items: NavItem[];
}

export function AdminSidebar({ guild }: AdminSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await syncGuildData(guild.id);
            if (res.success) {
                toast.success("Synced roles and channels from Discord.");
                router.refresh(); // Client-side refresh to update current view data
            } else {
                toast.error("Sync failed.");
            }
        } catch (error) {
            toast.error("Sync error.");
        } finally {
            setIsSyncing(false);
        }
    };

    const sections: NavSection[] = [
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

    return (
        <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 glass-sidebar flex flex-col z-40 text-white font-sans border-r border-white/5">

            {/* Top Stats / Connectivity - Optional, maybe Server Status? */}
            {/* <div className="h-1 bg-gradient-to-r from-primary to-transparent" /> */}

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">

                {/* Home & Sync Section */}
                <div className="flex gap-2">
                    <Link
                        href={`/dashboard/${guild.id}`}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 border border-white/5 font-display",
                            pathname === `/dashboard/${guild.id}`
                                ? "bg-white/10 text-white shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                                : "glass-card text-white hover:text-white hover:bg-white/5"
                        )}
                    >
                        <Home size={16} />
                        Home
                    </Link>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="px-3 py-2.5 rounded-lg glass-card border border-white/5 text-white hover:text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
                        title="Sync Roles & Channels"
                    >
                        <RotateCw size={16} className={cn(isSyncing && "animate-spin")} />
                    </button>
                </div>

                <div className="h-px bg-white/5 mx-2" />

                {sections.map((section) => (
                    <div key={section.title} className="space-y-2">
                        <div className="flex items-center justify-between px-3">
                            <h3 className="text-[10px] font-bold font-display text-white uppercase tracking-widest leading-none">
                                {section.title}
                            </h3>
                        </div>

                        <div className="space-y-0.5">
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
                                                ? "text-white font-medium bg-white/5"
                                                : "text-zinc-100 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        {isActive && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 bg-primary rounded-r-full" />
                                        )}

                                        <Icon size={18} className={cn(
                                            "shrink-0 transition-colors",
                                            isActive ? "text-primary dark:text-primary" : "text-zinc-300 group-hover:text-white"
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
            <div className="p-4 border-t border-white/5 bg-white/5 backdrop-blur-md">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 justify-center text-xs font-medium text-zinc-300 hover:text-primary transition-colors py-2 rounded-md hover:bg-white/5"
                >
                    &larr; Switch Server
                </Link>
            </div>
        </aside>
    );
}
