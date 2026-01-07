"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings, LayoutDashboard } from "lucide-react";
import { useState } from "react";

interface DashboardNavbarProps {
    user?: {
        name?: string | null;
        image?: string | null;
    };
}

export function DashboardNavbar({ user }: DashboardNavbarProps) {
    return (
        <motion.header
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="sticky top-0 z-50 w-full px-6 py-4"
        >
            <div className="max-w-7xl mx-auto">
                <div className="relative bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-3xl rounded-full px-6 py-3 flex items-center justify-between shadow-[0_0_40px_-10px_rgba(255,255,255,0.1)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),_inset_0_-1px_0_0_rgba(255,255,255,0.05)]">
                    {/* Brand / Logo */}
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-full border-2 border-yellow-600/50 shadow-md overflow-hidden">
                            <Image
                                src="/bot_pfp.png"
                                alt="Fortuna Bot"
                                fill
                                className="object-cover"
                            />
                        </div>
                        <span className="text-xl font-bold text-white hidden sm:block font-serif tracking-wider">
                            FORTUNA
                        </span>
                    </div>

                    {/* Navigation Items (Center) */}
                    <nav className="hidden md:flex items-center gap-8">
                        <NavLink href="/dashboard" icon={LayoutDashboard} label="Servers" active />
                        {/* Add more links here later */}
                    </nav>

                    {/* User Profile */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-zinc-200">{user?.name || "Player"}</p>
                                <p className="text-xs text-yellow-500/80 uppercase tracking-wider">Admin</p>
                            </div>

                            <div className="relative group cursor-pointer">
                                <div className="relative w-11 h-11 rounded-full p-0.5 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 transition-colors">
                                    {user?.image ? (
                                        <Image
                                            src={user.image}
                                            width={44}
                                            height={44}
                                            alt="Profile"
                                            className="rounded-full w-full h-full object-cover border-2 border-zinc-900"
                                        />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-900">
                                            <span className="text-lg font-bold text-zinc-400">
                                                {user?.name?.charAt(0) || "?"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.header>
    );
}

function NavLink({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active?: boolean }) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-yellow-400 ${active ? "text-white" : "text-zinc-400"
                }`}
        >
            <Icon size={16} className={active ? "text-yellow-500" : "text-zinc-500"} />
            {label}
        </Link>
    );
}
