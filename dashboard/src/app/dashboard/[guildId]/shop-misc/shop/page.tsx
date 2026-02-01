import { getShopItems } from "@/actions/shop-actions";
import { getGeneralSettings } from "@/actions/settings-actions";
import { getGuildRoles } from "@/lib/discord";
import { ShopItemsPanel } from "@/components/dashboard/shop/ShopItemsPanel";
import { TextGlow } from "@/components/ui/TextGlow";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function ShopItemsPage({ params }: PageProps) {
    const { guildId } = await params;

    const [items, roles, config] = await Promise.all([
        getShopItems(guildId),
        getGuildRoles(guildId),
        getGeneralSettings(guildId)
    ]);

    return (
        <div className="space-y-8 max-w-7xl">
            <div>
                <TextGlow variant="white">
                    <h1 className="text-3xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 mb-2">
                        Shop Configuration
                    </h1>
                </TextGlow>
                <p className="text-zinc-400">Create items, set prices, and configure requirements.</p>
            </div>

            <ShopItemsPanel
                guildId={guildId}
                items={items}
                roles={roles.map(r => ({ id: r.id, name: r.name, color: r.color }))}
                currencyEmoji={config.currencyEmoji}
            />
        </div>
    );
}
