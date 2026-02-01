import { getIncomeSettings } from "@/actions/income-actions";

export const dynamic = "force-dynamic";

import { IncomePanel } from "@/components/dashboard/income/IncomePanel";
import { TextGlow } from "@/components/ui/TextGlow";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function IncomePage({ params }: PageProps) {
    const { guildId } = await params;
    const data = await getIncomeSettings(guildId);

    return (
        <div>
            <div className="mb-8">
                <TextGlow variant="white">
                    <h1 className="text-3xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 mb-2">
                        Income Settings
                    </h1>
                </TextGlow>
                <p className="text-zinc-400">Configure payouts, cooldowns, and rewards for economy commands.</p>
            </div>

            <IncomePanel guildId={guildId} data={data} />
        </div>
    );
}
