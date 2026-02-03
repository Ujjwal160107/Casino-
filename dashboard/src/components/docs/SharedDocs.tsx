import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";

export function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">{title}</h3>
            <div className="flex flex-col space-y-2 border-l border-white/10 pl-4 transition-all">
                {children}
            </div>
        </div>
    );
}

export function NavLink({ href, children, active = false }: { href: string; children: React.ReactNode; active?: boolean }) {
    return (
        <a
            href={href}
            className={`text-sm transition-colors block py-1 ${active ? "text-violet-400 font-medium" : "text-zinc-400 hover:text-violet-300"}`}
        >
            {children}
        </a>
    );
}

export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-3 mb-6 scroll-mt-32">
            <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                {icon}
            </div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>
    );
}

export function CommandCard({ cmd, args, desc }: { cmd: string; args?: string; desc: string }) {
    return (
        <div className="bg-white/5 border border-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group">
            <div className="font-mono text-sm flex-1">
                <span className="text-violet-400 font-bold group-hover:text-violet-300 transition-colors">{cmd}</span>
                {args && <span className="text-zinc-500 ml-2 text-xs">{args}</span>}
            </div>
            <p className="text-sm text-zinc-300 md:text-right md:max-w-lg">{desc}</p>
        </div>
    );
}

export function GameCard({ title, cmd, desc }: { title: string; cmd: string; desc: string }) {
    return (
        <GlassCard className="p-6 space-y-3 hover:border-violet-500/30 transition-colors">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <code className="block text-xs bg-black/30 p-2 rounded text-violet-300 font-mono">{cmd}</code>
            <p className="text-sm text-zinc-400">{desc}</p>
        </GlassCard>
    );
}
