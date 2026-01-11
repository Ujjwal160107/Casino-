"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { GlassCard } from "./ui/GlassCard";

export function LandingNavbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
                                className="px-6 py-2 rounded-full border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/5 hover:text-white hover:border-white/20 transition-all cursor-pointer"
                            >
                                Login
                            </button>
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
