import { getGuild, getGuildMember } from "@/lib/discord";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { OverviewLogs } from "@/components/dashboard/OverviewLogs";
import Link from "next/link";
import { Settings, ShoppingBag, Briefcase, Dices, ArrowRight } from "lucide-react";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function DashboardOverviewPage({ params }: PageProps) {
    const session = await getServerSession(authOptions);
    const { guildId } = await params;
    const guild = await getGuild(guildId);

    // Fallback if guild fetch fails (handled in layout but good to be safe)
    if (!guild) return null;

    const commonPages = [
        {
            title: "General Configuration",
            description: "Manage prefix, currency, and core system settings.",
            icon: Settings,
            href: `/dashboard/${guildId}/general-economy/config`,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            border: "group-hover:border-blue-500/50"
        },
        {
            title: "Shop Items",
            description: "Create and manage items for your server's shop.",
            icon: ShoppingBag,
            href: `/dashboard/${guildId}/shop-misc/shop`,
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            border: "group-hover:border-purple-500/50"
        },
        {
            title: "Bank Settings",
            description: "Configure interest rates, limits, and credit scores.",
            icon: Briefcase,
            href: `/dashboard/${guildId}/general-economy/bank`,
            color: "text-green-400",
            bg: "bg-green-500/10",
            border: "group-hover:border-green-500/50"
        },
        {
            title: "Casino Games",
            description: "Adjust betting limits and game mechanics.",
            icon: Dices,
            href: `/dashboard/${guildId}/casino`,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            border: "group-hover:border-amber-500/50"
        }
    ];

    const member = session?.user?.id ? await getGuildMember(guildId, session.user.id) : null;
    // Fallback: Guild Nickname -> Global Display Name -> Username -> "User"
    const displayName = member?.nick || member?.user?.global_name || session?.user?.name || "User";

    return (
        <div className="space-y-10 mt-4">
            {/* Welcome Header */}
            <div className="space-y-2">
                <h1 className="text-4xl font-bold font-display text-white tracking-tight">
                    Welcome <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-amber-300 font-black drop-shadow-sm">{displayName}</span>,
                </h1>
                <p className="text-xl text-zinc-400 font-light">
                    find commonly used dashboard pages below.
                </p>
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {commonPages.map((page) => (
                    <div
                        key={page.title}
                        className={`group relative p-6 rounded-2xl glass-card transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${page.border}`}
                    >
                        {/* Glow Effect */}
                        <div className={`absolute top-0 right-0 w-32 h-32 ${page.bg} blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

                        <div className="relative z-10 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className={`p-3 rounded-xl ${page.bg} border border-white/5`}>
                                    <page.icon size={24} className={page.color} />
                                </div>
                            </div>

                            <h3 className="text-xl font-bold font-display text-white mb-2">{page.title}</h3>
                            <p className="text-zinc-400 text-sm mb-6 flex-1 pr-8">
                                {page.description}
                            </p>

                            <Link
                                href={page.href}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm font-medium text-white transition-colors w-fit group-hover:bg-white/10"
                            >
                                Open settings
                                <ArrowRight size={14} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            {/* Admin Activity Logs */}
            <div className="w-full">
                <OverviewLogs guildId={guildId} />
            </div>

            {/* Decorative/Info Section */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-white/5 relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-lg font-bold text-white mb-2">Need Help?</h3>
                        <p className="text-zinc-400 text-sm mb-4 max-w-md">
                            Join our support server for assistance with configuration, bug reports, and feature requests.
                        </p>
                        <a
                            href="https://discord.gg/Y5P44UCH2Y"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                            Join Support Server <ArrowRight size={14} />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
