"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { X, Home, Book, Terminal, FileText, Shield, Users, LifeBuoy, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user?: {
        name?: string | null;
        image?: string | null;
    };
}

const NAV_ITEMS = [
    { label: "Home", href: "/", icon: Home },
    { label: "Documents", href: "/docs", icon: Book },
    { label: "Commands", href: "/docs/commands", icon: Terminal },
    { label: "Terms of Service", href: "/terms", icon: FileText },
    { label: "Privacy Policy", href: "/policy", icon: Shield },
    { label: "Team", href: "/team", icon: Users },
    { label: "Changelog", href: "/changelog", icon: LifeBuoy },
];

export function MobileSidebar({ isOpen, onClose, user }: MobileSidebarProps) {
    const pathname = usePathname();

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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] lg:hidden"
                    />

                    {/* Sidebar Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-[#0a0a0a] border-l border-white/10 z-[9999] lg:hidden flex flex-col shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <span className="text-xl font-bold text-white tracking-wider">MENU</span>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Navigation Links */}
                        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
                            {NAV_ITEMS.map((item) => {
                                const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={onClose}
                                        className={cn(
                                            "flex items-center gap-4 px-4 py-3.5 rounded-xl text-base font-medium transition-all duration-200",
                                            isActive
                                                ? "bg-violet-500/10 text-white border border-violet-500/20"
                                                : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
                                        )}
                                    >
                                        <item.icon size={20} className={isActive ? "text-violet-400" : "text-zinc-500"} />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Footer / User Section */}
                        <div className="p-6 border-t border-white/10 bg-black/20">
                            {user ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden">
                                            {user.image ? (
                                                <img src={user.image} alt={user.name || "User"} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                                                    {user.name?.[0]}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium truncate">{user.name}</p>
                                            <p className="text-xs text-zinc-500">Logged in via Discord</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => signOut({ callbackUrl: "/" })}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-medium text-sm"
                                    >
                                        <LogOut size={16} />
                                        Sign Out
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => signIn("discord", { callbackUrl: "/" })}
                                    className="w-full py-3.5 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-colors"
                                >
                                    Login with Discord
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
