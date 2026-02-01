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
                <h1 className="text-3xl font-bold text-white mb-2 font-serif tracking-wide flex items-center gap-2">
                    <span className="w-2 h-8 bg-primary rounded-full inline-block"></span>
                    Overview
                </h1>
                <p className="text-zinc-400">Welcome back to the command center for <span className="text-primary font-semibold">{guild?.name}</span>.</p>
            </div>

            {/* General Settings Config */}
            <div className="mb-8 p-1 glass-card rounded-2xl">
                <div className="p-6 md:p-8">
                    <GeneralConfigForm guildId={guildId} initialData={settings} channels={channels} />
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: string }) {
    return (
        <div className="p-6 rounded-xl glass-card transition-all shadow-lg hover:shadow-[0_0_20px_rgba(255,215,0,0.1)] group cursor-default relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                {/* Decorative background icon could go here if we had the Lucide icon itself */}
            </div>
            <div className="flex items-start justify-between mb-4 relative z-10">
                <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest group-hover:text-primary transition-colors">{title}</h3>
                <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">{icon}</span>
            </div>
            <div className="text-3xl font-bold text-white font-mono drop-shadow-sm relative z-10">{value}</div>
        </div>
    );
}
