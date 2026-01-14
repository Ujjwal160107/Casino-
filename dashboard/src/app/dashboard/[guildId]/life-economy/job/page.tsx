import { getJobSettings } from "@/actions/job-actions";
import { JobsConfigForm } from "@/components/dashboard/forms/JobsConfigForm";

export default async function JobPage({ params }: { params: Promise<{ guildId: string }> }) {
    const resolvedParams = await params;
    const settings = await getJobSettings(resolvedParams.guildId);

    const initialData = settings || {
        jobCooldown: 3600,
        jobSectorBasePay: {},
        jobRelaxControllers: {},
        jobXpReqs: {},
        jobShiftReqs: {},
        defaultSectorPay: {
            "tech": 1500,
            "medical": 2000,
            "business": 1800,
            "legal": 2200,
            "service": 1200,
            "trade": 1600,
            "freelance": 1000
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6 font-serif">Job Management</h1>
            <div className="mb-6">
                <p className="text-zinc-400">Manage job listings, salary brackets, and work requirements.</p>
            </div>

            <JobsConfigForm guildId={resolvedParams.guildId} initialData={initialData} />
        </div>
    );
}
