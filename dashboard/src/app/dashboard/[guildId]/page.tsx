import { getGuild, getGuildChannels } from "@/lib/discord";
import { getGeneralSettings } from "@/actions/settings-actions";
import { GeneralConfigForm } from "@/components/dashboard/forms/GeneralConfigForm";


interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function DashboardOverviewPage({ params }: PageProps) {
    const { guildId } = await params;
    const [guild, settings, channels] = await Promise.all([
        getGuild(guildId),
        getGeneralSettings(guildId),
        getGuildChannels(guildId)
    ]);

    return (

        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2 font-serif tracking-wide">Overview</h1>
                <p className="text-zinc-400">Welcome back to the command center for <span className="text-yellow-500 font-semibold">{guild?.name}</span>.</p>
            </div>

            {/* General Settings Config */}
            <div className="mb-8">
                <GeneralConfigForm guildId={guildId} initialData={settings} channels={channels} />
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
