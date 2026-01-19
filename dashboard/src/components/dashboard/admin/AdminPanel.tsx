"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GeneralConfigForm } from "../forms/GeneralConfigForm";
import { GlobalDisables } from "./GlobalDisables";
import { GranularPermissions } from "./GranularPermissions";
import { CasinoChannels } from "./CasinoChannels";
import { StockMarketConfig } from "./StockMarketConfig";
import { ChatMoneyConfig } from "./ChatMoneyConfig";
import { FactoryResetZone } from "./FactoryResetZone";
import { Settings, Ban, Lock, Hash, TrendingUp, MessageSquare, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AdminPanelProps {
    guildId: string;
    data: {
        config: any;
        permissions: any[];
        stocks: any[];
    };
}

const TABS = [
    { id: "general", label: "General", icon: Settings },
    { id: "chat", label: "Chat Money", icon: MessageSquare },
    { id: "disables", label: "Disables", icon: Ban },
    { id: "perms", label: "Permissions", icon: Lock },
    { id: "channels", label: "Channels", icon: Hash },
    { id: "stocks", label: "Stocks", icon: TrendingUp },
    { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export function AdminPanel({ guildId, data }: AdminPanelProps) {
    const [activeTab, setActiveTab] = useState("general");

    return (
        <div className="space-y-6">
            {/* Tabs Navigation */}
            <div className="flex flex-wrap gap-2 border-b border-white/5 pb-2">
                {TABS.map(tab => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                isActive
                                    ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === "general" && (
                        <GeneralConfigForm
                            guildId={guildId}
                            initialData={{
                                prefix: data.config.prefix || "!",
                                startMoney: data.config.startMoney || 1000,
                                currencyName: data.config.currencyName || "Coins",
                                currencyEmoji: data.config.currencyEmoji || "🪙",
                                chatMoneyEnabled: data.config.chatMoneyEnabled ?? false,
                                walletLimit: data.config.walletLimit ?? null,
                                bankLimit: data.config.bankLimit ?? null
                            }}
                        />
                    )}

                    {activeTab === "chat" && (
                        <ChatMoneyConfig
                            guildId={guildId}
                            config={{
                                min: data.config.chatMoneyMin || 10,
                                max: data.config.chatMoneyMax || 50,
                                interval: data.config.chatMoneyInterval || 60,
                                channels: data.config.chatMoneyChannels || []
                            }}
                        />
                    )}

                    {activeTab === "disables" && (
                        <GlobalDisables
                            guildId={guildId}
                            disabledCommands={data.config.disabledCommands || []}
                        />
                    )}

                    {activeTab === "perms" && (
                        <GranularPermissions
                            guildId={guildId}
                            permissions={data.permissions}
                        />
                    )}

                    {activeTab === "channels" && (
                        <CasinoChannels
                            guildId={guildId}
                            channels={data.config.casinoChannels || []}
                        />
                    )}

                    {activeTab === "stocks" && (
                        <StockMarketConfig
                            guildId={guildId}
                            stocks={data.stocks}
                            refreshRate={data.config.stockRefreshRate || 600}
                        />
                    )}

                    {activeTab === "danger" && (
                        <FactoryResetZone guildId={guildId} />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
