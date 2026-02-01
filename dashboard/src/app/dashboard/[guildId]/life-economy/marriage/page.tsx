import { getMarriageConfig } from "@/actions/marriage-actions";
import { MarriagePanel } from "@/components/dashboard/marriage/MarriagePanel";
import { TextGlow } from "@/components/ui/TextGlow";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function MarriagePage({ params }: PageProps) {
    const { guildId } = await params;
    const config = await getMarriageConfig(guildId);

    return (
        <div className="space-y-6">
            <div>
                <TextGlow variant="white">
                    <h1 className="text-3xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
                        Marriage Settings
                    </h1>
                </TextGlow>
                <p className="text-zinc-400">Configure costs and rules for the marriage system.</p>
            </div>

            <MarriagePanel guildId={guildId} initialConfig={config} />
        </div>
    );
}
