import { PropertyManager } from "@/components/dashboard/properties/PropertyManager";
import { getProperties } from "@/actions/property-actions";

interface PropertyPageProps {
    params: Promise<{ guildId: string }>;
}

export default async function PropertyPage({ params }: PropertyPageProps) {
    const { guildId } = await params;
    const properties = await getProperties(guildId);

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6 font-serif">Property Management</h1>
            <PropertyManager guildId={guildId} initialProperties={properties} />
        </div>
    );
}
