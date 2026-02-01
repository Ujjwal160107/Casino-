import { getAdminData } from "@/actions/admin-actions";
import { AdminPanel } from "@/components/dashboard/admin/AdminPanel";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function ConfigPage({ params }: PageProps) {
    const { guildId } = await params;
    const adminData = await getAdminData(guildId);

    return (
        <div className="max-w-5xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold font-display text-white mb-2">Configuration & Admin Panel</h1>
                <p className="text-zinc-400">Manage all aspect of your server's economy, permissions, and game modules.</p>
            </div>

            <AdminPanel guildId={guildId} data={adminData} />
        </div>
    );
}
