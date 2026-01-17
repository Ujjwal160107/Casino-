import { getGameSettings } from "@/actions/game-actions";
import { GameConfigForm } from "@/components/dashboard/games/GameConfigForm";
import { redirect, notFound } from "next/navigation";

interface PageProps {
    params: {
        guildId: string;
        gameId: string;
    }
}

const GAME_NAMES: Record<string, string> = {
    blackjack: "Blackjack",
    roulette: "Roulette",
    slots: "Slots",
    coinflip: "Coinflip",
    cockfight: "Cockfight",
    russianRoulette: "Russian Roulette"
};

export default async function GameConfigPage({ params }: PageProps) {
    const { guildId, gameId } = params;
    const gameName = GAME_NAMES[gameId];

    if (!gameName) {
        return notFound();
    }

    const data = await getGameSettings(guildId, gameId);

    if (!data) {
        return <div className="p-8 text-white">Failed to load settings.</div>;
    }

    return (
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">{gameName}</h1>
                <p className="text-zinc-400">
                    Configure game-specific settings.
                </p>
            </div>

            <GameConfigForm
                guildId={guildId}
                gameKey={gameId}
                gameName={gameName}
                initialSettings={data.settings}
                globalLimits={{ min: data.globalmin, max: data.globalmax || 100000 }}
            />
        </div>
    );
    );
}
