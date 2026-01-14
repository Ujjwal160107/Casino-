"use client";

import { useState } from "react";
import { RewardEditor } from "./RewardEditor";
import { CommandEditor } from "./CommandEditor";
import { RobEditor } from "./RobEditor";
import { QuestEditor } from "./QuestEditor";
import { CasinoDropsEditor } from "./CasinoDropsEditor";
import { Crown, HandCoins, Heart, AlertTriangle, Shield, ScrollText, Timer } from "lucide-react";

interface IncomePanelProps {
    guildId: string;
    data: {
        rewards: any;
        commands: {
            beg: any;
            slut: any;
            crime: any;
        };
        rob: any;
        quests: any;
        drops: any[];
        roles: any[];
        channels: any[];
    };
}

export function IncomePanel({ guildId, data }: IncomePanelProps) {
    const [activeTab, setActiveTab] = useState<"rewards" | "beg" | "slut" | "crime" | "rob" | "quests" | "drops">("rewards");

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 border-b border-white/5 pb-1">
                <button
                    onClick={() => setActiveTab("rewards")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "rewards"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <Crown size={16} /> Rewards
                </button>
                <button
                    onClick={() => setActiveTab("beg")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "beg"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <HandCoins size={16} /> Beg
                </button>
                <button
                    onClick={() => setActiveTab("slut")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "slut"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <Heart size={16} /> Slut
                </button>
                <button
                    onClick={() => setActiveTab("crime")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "crime"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <AlertTriangle size={16} /> Crime
                </button>
                <button
                    onClick={() => setActiveTab("rob")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "rob"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <Shield size={16} /> Rob
                </button>
                <button
                    onClick={() => setActiveTab("quests")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "quests"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <ScrollText size={16} /> Quests
                </button>
                <button
                    onClick={() => setActiveTab("drops")}
                    className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "drops"
                        ? "bg-yellow-500 text-black"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                        }`}
                >
                    <Timer size={16} /> Drops
                </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {activeTab === "rewards" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <RewardEditor guildId={guildId} initialData={data.rewards} />
                    </div>
                )}

                {activeTab === "beg" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CommandEditor
                            guildId={guildId}
                            commandKey="beg"
                            label="Beg Command"
                            description="Configure payouts and messages for the !beg command."
                            initialData={data.commands.beg}
                        />
                    </div>
                )}

                {activeTab === "slut" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CommandEditor
                            guildId={guildId}
                            commandKey="slut"
                            label="Slut Command"
                            description="Configure high-risk 'slut' income command."
                            initialData={data.commands.slut}
                        />
                    </div>
                )}

                {activeTab === "crime" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CommandEditor
                            guildId={guildId}
                            commandKey="crime"
                            label="Crime Command"
                            description="Configure settings for !crime."
                            initialData={{
                                ...data.commands.crime,
                                jailTime: data.rob.jailTime,
                                jailFine: data.rob.jailFine
                            }}
                            isCrime={true}
                        />
                    </div>
                )}

                {activeTab === "rob" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <RobEditor
                            guildId={guildId}
                            initialData={data.rob}
                            availableRoles={data.roles || []}
                        />
                    </div>
                )}

                {activeTab === "quests" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <QuestEditor
                            guildId={guildId}
                            initialData={data.quests}
                        />
                    </div>
                )}

                {activeTab === "drops" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CasinoDropsEditor
                            guildId={guildId}
                            initialData={data.drops || []}
                            channels={data.channels || []}
                        />
                    </div>
                )}
            </div>
        </div >
    );
}
