import { PropertyManager } from "@/components/dashboard/properties/PropertyManager";
import { getProperties } from "@/actions/property-actions";
import { TextGlow } from "@/components/ui/TextGlow";

interface PropertyPageProps {
    params: Promise<{ guildId: string }>;
}

export default async function PropertyPage({ params }: PropertyPageProps) {
    const { guildId } = await params;
    const properties = await getProperties(guildId);

    return (
        <div>
            <TextGlow variant="white">
                <h1 className="text-3xl font-bold font-display text-white mb-6">
                    Property Management
                </h1>
            </TextGlow>
            <PropertyManager guildId={guildId} initialProperties={properties} />
        </div>
    );
}
