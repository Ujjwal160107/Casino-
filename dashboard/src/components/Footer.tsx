"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

export function Footer() {
    return (
        <footer className="w-full bg-[#0a0a0a] border-t border-white/10 relative z-50 pt-10 pb-6">
            <div className="max-w-7xl mx-auto px-6">

                {/* Main Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 mb-10">

                    {/* Brand Column (2 cols wide) */}
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-2xl font-bold text-white tracking-wide">FORTUNA</h2>
                        <p className="text-zinc-500 text-sm leading-relaxed max-w-xs">
                            The ultimate economy and casino experience for your Discord server. Level up your community today.
                        </p>
                        <div className="flex items-center gap-4 pt-2">
                            <SocialIcon href="https://discord.gg/Y5P44UCH2Y" icon={<MessageCircle size={18} />} />
                        </div>
                    </div>

                    {/* Spacer (1 col) - optional for layout balance */}
                    <div className="hidden lg:block lg:col-span-1"></div>

                    {/* Resources */}
                    <div>
                        <h3 className="text-white font-bold mb-4">Resources</h3>
                        <ul className="space-y-2">
                            <FooterLink href="/premium">Premium</FooterLink>
                            <FooterLink href="https://top.gg/bot/1371816936857669702?s=0825a328ae527">Vote</FooterLink>
                            <FooterLink href="https://discord.gg/Y5P44UCH2Y">Support</FooterLink>
                            <FooterLink href="/docs">Documentation</FooterLink>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div>
                        <h3 className="text-white font-bold mb-4">Legal</h3>
                        <ul className="space-y-2">
                            <FooterLink href="/terms">Terms</FooterLink>
                            <FooterLink href="/policy">Privacy</FooterLink>
                            <FooterLink href="/refund">Refund</FooterLink>
                        </ul>
                    </div>

                    {/* Connect */}
                    <div>
                        <h3 className="text-white font-bold mb-4">Connect</h3>
                        <ul className="space-y-2">
                            <FooterLink href="https://discord.gg/Y5P44UCH2Y">Discord</FooterLink>

                        </ul>
                    </div>

                </div>

                {/* Bottom Bar */}
                <div className="border-t border-white/10 pt-8 flex flex-col items-center justify-center text-center">
                    <p className="text-zinc-600 text-sm">
                        &copy; {new Date().getFullYear()} FORTUNA. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
    const isExternal = href.startsWith("http");
    const Component = isExternal ? "a" : Link;

    return (
        <li>
            <Component
                href={href}
                {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-zinc-500 hover:text-white transition-colors text-sm font-medium"
            >
                {children}
            </Component>
        </li>
    );
}

function SocialIcon({ href, icon }: { href: string; icon: React.ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-white transition-colors p-2 bg-white/5 rounded-full hover:bg-white/10"
        >
            {icon}
        </a>
    );
}
