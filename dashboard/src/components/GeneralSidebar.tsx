"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Book, FileText, LifeBuoy, Shield, Users, Terminal, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { label: "Home", href: "/", icon: Home },
    { label: "Documents", href: "/docs", icon: Book },
    { label: "Commands", href: "/docs/commands", icon: Terminal },
    { label: "Terms of Service", href: "/terms", icon: FileText },
    { label: "Privacy Policy", href: "/policy", icon: Shield },
    { label: "Team", href: "/team", icon: Users },
    { label: "Changelog", href: "/changelog", icon: LifeBuoy },
];

export function GeneralSidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden lg:block sticky top-32 h-[calc(100vh-10rem)] overflow-y-auto">
            <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-white/10 text-white"
                                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <item.icon size={18} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
