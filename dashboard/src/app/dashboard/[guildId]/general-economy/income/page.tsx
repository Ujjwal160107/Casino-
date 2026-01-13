import { getIncomeSettings } from "@/actions/income-actions";

export const dynamic = "force-dynamic";

import { IncomePanel } from "@/components/dashboard/income/IncomePanel";

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
                <h1 className="text-3xl font-bold text-white mb-2 font-serif">Income Settings</h1>
                <p className="text-zinc-400">Configure payouts, cooldowns, and rewards for economy commands.</p>
            </div>

            <IncomePanel guildId={guildId} data={data} />
        </div>
    );
}
