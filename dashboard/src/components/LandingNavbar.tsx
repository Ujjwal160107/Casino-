"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { LayoutDashboard, Menu, X, LogOut, User } from "lucide-react";
import { useState, useEffect } from "react";
import { GlassCard } from "./ui/GlassCard";
import Image from "next/image";

interface LandingNavbarProps {
    user?: {
        name?: string | null;
        image?: string | null;
    };
}

export function LandingNavbar({ user }: LandingNavbarProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "py-4" : "py-6"
                }`}
        >
            <div className="max-w-7xl mx-auto px-6">
                <GlassCard
                    className="px-6 py-3 bg-black/10 backdrop-blur-md border-white/5 shadow-none transition-all duration-300 rounded-full"
                >
                    <div className="flex items-center justify-between w-full">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3 group cursor-pointer">
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10 shadow-[0_0_15px_rgba(168,85,247,0.4)] group-hover:shadow-[0_0_25px_rgba(168,85,247,0.6)] transition-all">
                                <img
                                    src="/fortuna_icon.png"
                                    alt="Fortuna"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <span className="text-xl font-bold tracking-wider text-white group-hover:text-primary transition-colors">FORTUNA</span>
                        </Link>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-6">
                            <div className="hidden md:flex items-center gap-6">
                                <Link href="/docs" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Documentation</Link>
                            </div>
                            <div className="h-4 w-[1px] bg-white/10 hidden md:block"></div>

                            {user ? (
                                <div className="relative">
                                    <button
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="flex items-center gap-3 focus:outline-none group pl-2"
                                    >
                                        <div className="text-right hidden sm:block">
                                            <p className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">{user.name}</p>
                                        </div>
                                        <div className="relative w-9 h-9 rounded-full p-0.5 bg-zinc-800 border border-zinc-600 group-hover:border-violet-500 transition-colors">
                                            {user.image ? (
                                                <Image
                                                    src={user.image}
                                                    width={36}
                                                    height={36}
                                                    alt="Profile"
                                                    className="rounded-full w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full rounded-full bg-zinc-700 flex items-center justify-center">
                                                    <span className="text-xs font-bold text-zinc-400">
                                                        {user.name?.charAt(0) || "?"}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    {/* Dropdown Menu */}
                                    {isDropdownOpen && (
                                        <>
                                            <div className="absolute right-0 top-full mt-4 w-56 bg-[#0f0f11] border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl z-50">
                                                <div className="p-4 border-b border-white/5">
                                                    <p className="text-sm font-bold text-white truncate">{user.name}</p>
                                                    <p className="text-xs text-zinc-500">Logged in via Discord</p>
                                                </div>
                                                <div className="p-2 space-y-1">
                                                    <Link
                                                        href="/dashboard"
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white rounded-lg transition-colors"
                                                    >
                                                        <LayoutDashboard size={16} />
                                                        Dashboard
                                                    </Link>
                                                    <button
                                                        onClick={() => signOut({ callbackUrl: "/" })}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors text-left"
                                                    >
                                                        <LogOut size={16} />
                                                        Sign Out
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Backdrop */}
                                            <div
                                                className="fixed inset-0 z-40"
                                                onClick={() => setIsDropdownOpen(false)}
                                            />
                                        </>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
                                    className="px-6 py-2 rounded-full border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/5 hover:text-white hover:border-white/20 transition-all cursor-pointer"
                                >
                                    Login
                                </button>
                            )}
                            <button
                                className="px-6 py-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-sm hover:brightness-110 transition-all shadow-lg hover:shadow-indigo-500/25 cursor-pointer"
                            >
                                Premium
                            </button>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </motion.nav>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="text-sm font-medium text-zinc-400 hover:text-primary transition-colors hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
            {children}
        </Link>
    );
}

function MobileNavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="text-lg font-medium text-zinc-200 hover:text-primary transition-colors block py-2">
            {children}
        </Link>
    );
}
