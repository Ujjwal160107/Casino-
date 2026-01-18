import { getShopItems } from "@/actions/shop-actions";
import { getGeneralSettings } from "@/actions/settings-actions";
import { getGuildRoles } from "@/lib/discord";
import { ShopItemsPanel } from "@/components/dashboard/shop/ShopItemsPanel";

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
                <h1 className="text-3xl font-bold text-white mb-2 font-serif">Shop Configuration</h1>
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
