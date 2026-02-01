import { EducationPanel } from "@/components/dashboard/education/EducationPanel";
import { getEducationSettings } from "@/actions/education-actions";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function EducationPage({ params }: PageProps) {
    const { guildId } = await params;
    const settings = await getEducationSettings(guildId);

    return (
        <div>
            <h1 className="text-3xl font-bold font-display text-white mb-2">Education Management</h1>
            <p className="text-zinc-400 mb-8 max-w-2xl">
                Configure global education settings, activity costs, and degree tuition fees.
            </p>

            <EducationPanel
                guildId={guildId}
                config={settings.config}
                degrees={settings.degrees}
            />
        </div>
    );
}
