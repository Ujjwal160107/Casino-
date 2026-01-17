import { getGameSettings } from "@/actions/game-actions";
import { GamesPanel } from "@/components/dashboard/games/GamesPanel";
import { Dices, Crown, LayoutGrid, Coins, Sword, Skull } from "lucide-react";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

const GAMES = [
    { key: "blackjack", name: "Blackjack", icon: Crown },
    { key: "roulette", name: "Roulette", icon: Dices },
    { key: "slots", name: "Slots", icon: LayoutGrid },
    { key: "coinflip", name: "Coinflip", icon: Coins },
    { key: "cockfight", name: "Cockfight", icon: Sword },
    { key: "russianRoulette", name: "Russian Roulette", icon: Skull },
];

export default async function CasinoPage({ params }: PageProps) {
    const { guildId } = await params;

    // Fetch settings for all games parallelly
    // Note: getGameSettings returns { settings, globalmax, globalmin }
    // We can optimize this by fetching config ONCE if getGameSettings accepted more args, 
    // but for now 6 calls is acceptable or we can just fetch config once here.
    // Actually, let's just loop.

    const gamesData = await Promise.all(
        GAMES.map(async (game) => {
            const data = await getGameSettings(guildId, game.key);
            return {
                ...game,
                settings: data?.settings || { minBet: 0, maxBet: 0, cooldown: 0, enabled: true },
                // data might be null if failed, handle gracefully
                globalLimits: { min: data?.globalmin ?? 0, max: data?.globalmax ?? 100000 }
            };
        })
    );

    // Assume global limits are same for all since they come from same guild config return
    const globalLimits = gamesData[0]?.globalLimits || { min: 0, max: 100000 };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2 font-serif">Games & Stats</h1>
                <p className="text-zinc-400">Configure individual game settings, limits, and availability.</p>
            </div>

            <GamesPanel
                guildId={guildId}
                games={gamesData}
                globalLimits={globalLimits}
            />
        </div>
    );
}
