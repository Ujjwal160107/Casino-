"use client";

import Link from "next/link";
import { Twitter, Instagram } from "lucide-react";

export function Footer() {
    return (
        <footer className="w-full bg-black/20 backdrop-blur-lg text-zinc-400 py-16 border-t border-white/5 relative z-10">
            <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
                {/* Brand Column */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/10 shadow-[0_0_10px_rgba(168,85,247,0.4)]">
                            <img src="/fortuna_icon.png" alt="Fortuna" className="w-full h-full object-cover" />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-wide">FORTUNA</h2>
                    </div>
                    <p className="text-sm">The ultimate economy and life simulation experience for your Discord server.</p>
                </div>

                {/* Resources Column */}
                <div className="space-y-4">
                    <h3 className="text-white font-semibold">Resources</h3>
                    <ul className="space-y-3 text-sm">
                        <li><Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
                        <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
                        <li><Link href="https://top.gg/bot/1371816936857669702" target="_blank" className="hover:text-white transition-colors">Vote</Link></li>
                    </ul>
                </div>

                {/* Legal Column */}
                <div className="space-y-4">
                    <h3 className="text-white font-semibold">Legal</h3>
                    <ul className="space-y-3 text-sm">
                        <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                        <li><Link href="/policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                    </ul>
                </div>

                {/* Connect Column */}
                <div className="space-y-4">
                    <h3 className="text-white font-semibold">Connect</h3>
                    <ul className="space-y-3 text-sm">
                        <li><Link href="https://discord.gg/Y5P44UCH2Y" target="_blank" className="hover:text-white transition-colors">Support Server</Link></li>
                    </ul>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 mt-16 text-center text-xs text-zinc-600">
                © {new Date().getFullYear()} Fortuna. All rights reserved.
            </div>
        </footer>
    );
}
