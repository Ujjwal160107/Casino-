import { getGuild } from "@/lib/discord";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function DashboardOverviewPage({ params }: PageProps) {
    const { guildId } = await params;
    const guild = await getGuild(guildId);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2 font-serif tracking-wide">Overview</h1>
                <p className="text-zinc-400">Welcome back to the command center for <span className="text-yellow-500 font-semibold">{guild?.name}</span>.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Total Members" value="--" icon="👥" />
                <StatCard title="Economy Value" value="$--" icon="💰" />
                <StatCard title="Active Gamblers" value="--" icon="🎲" />
            </div>

            {/* Recent Activity / Quick Actions Placeholders */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="p-6 rounded-xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 shadow-[inner_0_1px_0_0_rgba(255,255,255,0.1)]">
                    <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-zinc-950/40 border border-white/5 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:border-yellow-500/30 transition-all cursor-pointer backdrop-blur-sm shadow-sm">
                            Trigger Global Event
                        </div>
                        <div className="p-3 rounded-lg bg-zinc-950/40 border border-white/5 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:border-yellow-500/30 transition-all cursor-pointer backdrop-blur-sm shadow-sm">
                            Manage Ban List
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 shadow-[inner_0_1px_0_0_rgba(255,255,255,0.1)]">
                    <h3 className="text-lg font-bold text-white mb-4">System Status</h3>
                    <div className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                        <span className="text-zinc-200 font-medium">Bot is Online</span>
                    </div>
                    <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Uptime</span>
                            <span className="text-zinc-200 font-mono">99.9%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Latency</span>
                            <span className="text-zinc-200 font-mono">24ms</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: string }) {
    return (
        <div className="p-6 rounded-xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 hover:border-white/20 hover:from-white/15 hover:to-white/10 transition-all shadow-lg shadow-black/20 shadow-[inner_0_1px_0_0_rgba(255,255,255,0.1)] group cursor-default">
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-zinc-400 text-sm font-semibold uppercase tracking-wider group-hover:text-zinc-200 transition-colors">{title}</h3>
                <span className="text-2xl drop-shadow-md">{icon}</span>
            </div>
            <div className="text-3xl font-bold text-white font-mono drop-shadow-sm">{value}</div>
        </div>
    );
}
