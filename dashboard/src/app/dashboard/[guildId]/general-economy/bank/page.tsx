import { getBankSettings } from "@/actions/settings-actions";
import { BankConfigForm } from "@/components/dashboard/forms/BankConfigForm";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function BankConfigPage({ params }: PageProps) {
    const { guildId } = await params;
    const settings = await getBankSettings(guildId);

    return (
        <div className="max-w-5xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2 font-serif">Bank Configuration</h1>
                <p className="text-zinc-400">Configure interest rates, loan limits, and credit score policies.</p>
            </div>

            <BankConfigForm guildId={guildId} initialData={settings} />
        </div>
    );
}
