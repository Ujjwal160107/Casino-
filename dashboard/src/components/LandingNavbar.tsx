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
                    className={`flex items-center justify-between px-6 py-4 ${isScrolled ? "bg-black/40 backdrop-blur-xl border-white/10" : "bg-transparent border-transparent shadow-none backdrop-blur-none"
                        }`}
                >
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-bold text-black">
                            F
                        </div>
                        <span className="text-xl font-bold tracking-wider text-white">FORTUNA</span>
                    </div>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-8">
                        <NavLink href="#features">Features</NavLink>
                        <NavLink href="#stats">Statistics</NavLink>
                        <NavLink href="#community">Community</NavLink>
                    </div>

                    {/* Action Button */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={() => signIn("discord")}
                            className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
                        >
                            Login
                        </button>
                        <button
                            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
                            className="px-5 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-primary hover:text-black transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(0,240,255,0.5)]"
                        >
                            Get Started
                        </button>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden text-white"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X /> : <Menu />}
                    </button>
                </GlassCard>
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-0 right-0 p-4 md:hidden"
                >
                    <GlassCard className="flex flex-col gap-4 p-6 bg-black/90 backdrop-blur-xl border-white/10">
                        <MobileNavLink href="#features">Features</MobileNavLink>
                        <MobileNavLink href="#stats">Statistics</MobileNavLink>
                        <MobileNavLink href="#community">Community</MobileNavLink>
                        <div className="h-px bg-white/10 my-2" />
                        <button
                            onClick={() => signIn("discord")}
                            className="w-full py-3 text-center font-semibold text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                            Login
                        </button>
                        <button
                            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
                            className="w-full py-3 text-center font-bold bg-primary text-black rounded-lg hover:bg-white transition-colors"
                        >
                            Get Started
                        </button>
                    </GlassCard>
                </motion.div>
            )}
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
