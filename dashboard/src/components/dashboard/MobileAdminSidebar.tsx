"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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
    RotateCw,
    X,
    LogOut
} from "lucide-react";
import { useState } from "react";
import type { DiscordGuild } from "@/lib/discord";
import { syncGuildData } from "@/actions/settings-actions";
import { toast } from "sonner";
import { signOut } from "next-auth/react";

interface MobileAdminSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    guild: DiscordGuild;
    user?: {
        name?: string | null;
        image?: string | null;
    };
}

export function MobileAdminSidebar({ isOpen, onClose, guild, user }: MobileAdminSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await syncGuildData(guild.id);
            if (res.success) {
                toast.success("Synced roles and channels from Discord.");
                router.refresh();
            } else {
                toast.error("Sync failed.");
            }
        } catch (error) {
            console.error(error);
            toast.error("Sync error.");
        } finally {
            setIsSyncing(false);
        }
    };

    const sections = [
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
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9998] md:hidden"
                    />

                    {/* Sidebar Drawer */}
                    <motion.div
                        initial={{ x: "-100%" }} // Slide from left
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-[#0a0a0a] border-r border-white/10 z-[9999] md:hidden flex flex-col shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <span className="text-xl font-bold text-white tracking-wider font-display">{guild.name}</span>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Navigation */}
                        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                            {/* Home & Sync */}
                            <div className="flex gap-2">
                                <Link
                                    href={`/dashboard/${guild.id}`}
                                    onClick={onClose}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all duration-200 border border-white/5 font-display",
                                        pathname === `/dashboard/${guild.id}`
                                            ? "bg-white/10 text-white"
                                            : "bg-white/5 text-zinc-300"
                                    )}
                                >
                                    <Home size={16} />
                                    Home
                                </Link>
                                <button
                                    onClick={handleSync}
                                    disabled={isSyncing}
                                    className="px-4 py-3 rounded-lg bg-white/5 border border-white/5 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                                >
                                    <RotateCw size={16} className={cn(isSyncing && "animate-spin")} />
                                </button>
                            </div>

                            {sections.map((section) => (
                                <div key={section.title} className="space-y-2">
                                    <h3 className="text-[10px] font-bold font-display text-zinc-500 uppercase tracking-widest px-2">
                                        {section.title}
                                    </h3>
                                    <div className="space-y-1">
                                        {section.items.map((item) => {
                                            const isActive = pathname === item.href;
                                            const Icon = item.icon;
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={onClose}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-200",
                                                        isActive
                                                            ? "bg-primary/10 text-primary font-medium"
                                                            : "text-zinc-400 hover:text-white hover:bg-white/5"
                                                    )}
                                                >
                                                    <Icon size={18} className={isActive ? "text-primary" : ""} />
                                                    {item.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/10 bg-black/20 space-y-3">
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-2 justify-center text-sm font-medium text-zinc-400 hover:text-white transition-colors py-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5"
                            >
                                &larr; Switch Server
                            </Link>

                            {user && (
                                <div className="pt-3 border-t border-white/5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 overflow-hidden">
                                            {user.image ? (
                                                <img src={user.image} alt={user.name || "User"} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                                                    {user.name?.[0]}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{user.name}</p>
                                            <p className="text-[10px] text-zinc-500 uppercase">Admin</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => signOut({ callbackUrl: "/" })}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <LogOut size={14} />
                                        Log Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
