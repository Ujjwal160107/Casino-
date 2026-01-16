import { getMarriageConfig } from "@/actions/marriage-actions";
import { MarriagePanel } from "@/components/dashboard/marriage/MarriagePanel";

interface PageProps {
    params: {
        guildId: string;
    };
}

export default async function MarriagePage({ params }: PageProps) {
    const config = await getMarriageConfig(params.guildId);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white font-serif">Marriage Settings</h1>
                <p className="text-zinc-400">Configure costs and rules for the marriage system.</p>
            </div>

            <MarriagePanel guildId={params.guildId} initialConfig={config} />
        </div>
    );
}
