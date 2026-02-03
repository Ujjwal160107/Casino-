"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGeneralSettings, resetEconomy } from "@/actions/settings-actions";
import { Loader2, Save, Trash2, AlertTriangle, Settings, Hash, Lock, CircleDollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { DurationInput } from "../ui/DurationInput";
import { updateGlobalGameCooldown } from "@/actions/game-actions";

interface GeneralConfigFormProps {
    guildId: string;
    initialData: {
        prefix: string;
        startMoney: number;
        currencyName: string;
        currencyEmoji: string;
        chatMoneyEnabled: boolean;
        walletLimit: number | null;
        bankLimit: number | null;
        minBet?: number | null;
        maxBet?: number | null;
        logChannelId?: string | null;
        dropExpiration?: number;
        voteReward?: number;
    };
    channels?: { id: string; name: string }[];
}

export function GeneralConfigForm({ guildId, initialData, channels = [] }: GeneralConfigFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState<{
        prefix: string;
        startMoney: number | "";
        currencyName: string;
        currencyEmoji: string;
        chatMoneyEnabled: boolean;
        walletLimit: number | "" | null;
        bankLimit: number | "" | null;
        minBet: number | "";
        maxBet: number | "";
        logChannelId: string;
        dropExpiration: number;
        voteReward: number | "";
    }>({
        ...initialData,
        walletLimit: initialData.walletLimit ?? "",
        bankLimit: initialData.bankLimit ?? "",
        minBet: initialData.minBet ?? 100,
        maxBet: initialData.maxBet ?? 100000,
        logChannelId: initialData.logChannelId ?? "",
        startMoney: initialData.startMoney ?? 0,
        voteReward: initialData.voteReward ?? 5000,
        dropExpiration: initialData.dropExpiration ?? 60
    });
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // Helper for number inputs
    const handleNumberChange = (field: string, value: string) => {
        if (value === "") {
            setFormData(prev => ({ ...prev, [field]: "" }));
            return;
        }
        const num = parseInt(value);
        if (!isNaN(num)) {
            setFormData(prev => ({ ...prev, [field]: num }));
        }
    };

    const handleResetEconomy = async () => {
        setIsResetting(true);
        try {
            const result = await resetEconomy(guildId);
            if (result.success) {
                setMessage({ type: "success", text: "Economy has been reset successfully." });
                setShowResetConfirm(false);
                router.refresh();
            } else {
                setMessage({ type: "error", text: result.error || "Failed to reset economy." });
            }
        } catch (error) {
            setMessage({ type: "error", text: "An unexpected error occurred." });
        }
        setIsResetting(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        // sanitize data before sending: convert "" back to null or 0 depending on field logic
        const payload = {
            ...formData,
            walletLimit: formData.walletLimit === "" ? null : formData.walletLimit,
            bankLimit: formData.bankLimit === "" ? null : formData.bankLimit,
            minBet: formData.minBet === "" ? 0 : formData.minBet,
            maxBet: formData.maxBet === "" ? 0 : formData.maxBet,
            startMoney: formData.startMoney === "" ? 0 : formData.startMoney,
            voteReward: formData.voteReward === "" ? 0 : formData.voteReward,
        };

        try {
            const result = await updateGeneralSettings(guildId, payload);
            if (result.success) {
                setMessage({ type: "success", text: "Configuration saved successfully!" });
                router.refresh();
            } else {
                setMessage({ type: "error", text: result.error || "Failed to save configuration." });
            }
        } catch (error) {
            setMessage({ type: "error", text: "An unexpected error occurred." });
        } finally {
            setIsLoading(false);
        }
    };

    // Global Cooldown Logic (Standalone)
    const [globalCooldown, setGlobalCooldown] = useState("");
    const [cooldownLoading, setCooldownLoading] = useState(false);


    const handleSetGlobalCooldown = async () => {
        const val = parseInt(globalCooldown);
        if (isNaN(val) || val < 0) {
            // Basic alert or toast? Form handles errors via message state usually
            return;
        }

        setCooldownLoading(true);
        const res = await updateGlobalGameCooldown(guildId, val);
        setCooldownLoading(false);

        if (res.success) {
            setMessage({ type: "success", text: "Global Game Cooldown updated!" });
            setGlobalCooldown("");
            router.refresh();
        } else {
            setMessage({ type: "error", text: res.error || "Failed" });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">


            {/* SETTINGS CARD: General */}
            <div className="glass-card border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-white/5 bg-white/2">
                    <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                        <Settings size={20} className="text-zinc-300" />
                        General Settings
                    </h3>
                </div>

                <div className="divide-y divide-white/5">

                    {/* Prefix */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Bot Prefix</h4>
                            <p className="text-sm text-zinc-400 mt-1">The symbol used to trigger commands (legacy).</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="text"
                                maxLength={5}
                                value={formData.prefix}
                                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                                placeholder="!"
                            />
                        </div>
                    </div>

                    {/* Start Money */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Starting Balance</h4>
                            <p className="text-sm text-zinc-500 mt-1">Initial cash for new users.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={0}
                                value={formData.startMoney}
                                onChange={(e) => handleNumberChange("startMoney", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>

                    {/* Vote Reward */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Vote Reward</h4>
                            <p className="text-sm text-zinc-500 mt-1">Reward for voting (every 12h).</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={0}
                                value={formData.voteReward}
                                onChange={(e) => handleNumberChange("voteReward", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>

                    {/* Currency Name */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Currency Name</h4>
                            <p className="text-sm text-zinc-500 mt-1">The name of your server's currency.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="text"
                                maxLength={32}
                                value={formData.currencyName}
                                onChange={(e) => setFormData({ ...formData, currencyName: e.target.value })}
                                className="w-48 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-medium text-sm text-white"
                                placeholder="Coins"
                            />
                        </div>
                    </div>

                    {/* Currency Emoji */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Currency Emoji</h4>
                            <p className="text-sm text-zinc-500 mt-1">Symbol displayed next to amounts.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-right"
                                    value={formData.currencyEmoji}
                                    onChange={(e) => setFormData({ ...formData, currencyEmoji: e.target.value })}
                                    placeholder="🪙"
                                />
                                <div className="flex items-center justify-center w-10 shrink-0 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                                    {(() => {
                                        const customEmojiMatch = formData.currencyEmoji.match(/<?(a)?:?(\w+):(\d+)>?/);
                                        if (customEmojiMatch) {
                                            const isAnimated = customEmojiMatch[1] === "a";
                                            const id = customEmojiMatch[3];
                                            const url = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? "gif" : "png"}`;
                                            return (
                                                <img src={url} alt="currency" className="w-6 h-6 object-contain" />
                                            );
                                        }
                                        return (
                                            <span className="text-xl">
                                                {formData.currencyEmoji || "🪙"}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* SETTINGS CARD: Economy Limits */}
            <div className="glass-card border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-white/5 bg-white/2">
                    <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                        <Lock size={20} className="text-zinc-300" />
                        Economy Limits
                    </h3>
                </div>
                <div className="divide-y divide-white/5">
                    {/* Wallet Limit */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Wallet Limit</h4>
                            <p className="text-sm text-zinc-500 mt-1">Maximum cash a user can hold on hand.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={0}
                                placeholder="No Limit"
                                value={formData.walletLimit ?? ""}
                                onChange={(e) => handleNumberChange("walletLimit", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>

                    {/* Bank Limit */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Bank Limit</h4>
                            <p className="text-sm text-zinc-500 mt-1">Maximum cash a user can store in the bank.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={0}
                                placeholder="No Limit"
                                value={formData.bankLimit ?? ""}
                                onChange={(e) => handleNumberChange("bankLimit", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* SETTINGS CARD: Betting */}
            <div className="glass-card border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-white/5 bg-white/2">
                    <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                        <CircleDollarSign size={20} className="text-zinc-300" />
                        Betting Configuration
                    </h3>
                </div>
                <div className="divide-y divide-white/5">
                    {/* Min Bet */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Global Min Bet</h4>
                            <p className="text-sm text-zinc-500 mt-1">Minimum allowed bet across all games.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={0}
                                value={formData.minBet}
                                onChange={(e) => handleNumberChange("minBet", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>

                    {/* Max Bet */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Global Max Bet</h4>
                            <p className="text-sm text-zinc-500 mt-1">Maximum allowed bet across all games.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={0}
                                value={formData.maxBet}
                                onChange={(e) => handleNumberChange("maxBet", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* SETTINGS CARD: System Configuration */}
            <div className="glass-card border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-white/5 bg-white/2">
                    <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                        <Hash size={20} className="text-zinc-300" />
                        System Configuration
                    </h3>
                </div>
                <div className="divide-y divide-white/5">

                    {/* Log Channel */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Casino Log Channel</h4>
                            <p className="text-sm text-zinc-500 mt-1">Channel where casino transactions are logged.</p>
                        </div>
                        <div className="md:w-1/3 flex flex-col gap-2 justify-end">
                            <div className="relative">
                                <select
                                    value={formData.logChannelId || ""}
                                    onChange={(e) => setFormData({ ...formData, logChannelId: e.target.value })}
                                    className="w-full bg-white/5 border-black rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none text-sm text-right pr-8"
                                >
                                    <option value="">Select a channel...</option>
                                    {channels.map((channel) => (
                                        <option key={channel.id} value={channel.id}>
                                            #{channel.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                            {/* Manual ID Input fallback */}
                            <input
                                type="text"
                                placeholder="Or enter Channel ID"
                                value={formData.logChannelId || ""}
                                onChange={(e) => setFormData({ ...formData, logChannelId: e.target.value })}
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-zinc-500 focus:text-white focus:border-primary/30 transition-all text-right"
                            />
                        </div>
                    </div>

                    {/* Chat Money Toggle */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Chat Money</h4>
                            <p className="text-sm text-zinc-500 mt-1">Allow users to earn currency by chatting in active channels.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, chatMoneyEnabled: !formData.chatMoneyEnabled })}
                                className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${formData.chatMoneyEnabled ? "bg-primary shadow-[0_0_10px_rgba(255,215,0,0.3)]" : "bg-zinc-800 border border-white/10"
                                    }`}
                            >
                                <span
                                    className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${formData.chatMoneyEnabled ? "translate-x-6" : "translate-x-0"
                                        }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Drop Cooldown */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/2 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-zinc-100">Drop Cooldown</h4>
                            <p className="text-sm text-zinc-500 mt-1">Time in seconds before a drop disappears.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <input
                                type="number"
                                min={5}
                                value={formData.dropExpiration}
                                onChange={(e) => handleNumberChange("dropExpiration", e.target.value)}
                                className="w-32 bg-white/5 border-black rounded-lg px-4 py-2.5 text-right focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm text-white"
                            />
                        </div>
                    </div>

                </div>
            </div>

            {/* SETTINGS CARD: Danger Zone */}
            <div className="glass-card border border-red-500/20 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-red-500/10 bg-red-500/5">
                    <h3 className="text-lg font-bold text-red-500 flex items-center gap-2">
                        <AlertTriangle size={20} />
                        Danger Zone
                    </h3>
                </div>
                <div className="divide-y divide-red-500/10">
                    {/* Reset Economy */}
                    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-red-500/5 transition-colors">
                        <div className="md:w-2/3">
                            <h4 className="text-base font-medium text-white">Reset Economy</h4>
                            <p className="text-sm text-zinc-400 mt-1">Permanently delete all wallets, banks, items, and user stats.</p>
                        </div>
                        <div className="md:w-1/3 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(true)}
                                className="bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                            >
                                <Trash2 size={16} /> Reset
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {showResetConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-card backdrop-blur-md border border-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-white mb-2">Are you absolutely sure?</h3>
                            <p className="text-zinc-400 text-sm mb-6">
                                This action will permanently delete all economy data for this server. This includes wallets, bank accounts, inventories, loans, and all user statistics. <span className="text-red-400 font-bold">This cannot be undone.</span>
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowResetConfirm(false)}
                                    disabled={isResetting}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetEconomy}
                                    disabled={isResetting}
                                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500 transition-colors flex items-center gap-2"
                                >
                                    {isResetting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                    Yes, Reset Everything
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Status Message */}
            {message && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`fixed bottom-8 right-8 p-4 rounded-xl shadow-2xl border ${message.type === "success"
                        ? "bg-zinc-900/90 border-green-500/50 text-green-400"
                        : "bg-zinc-900/90 border-red-500/50 text-red-400"
                        } backdrop-blur-md z-50 font-medium`}
                >
                    {message.text}
                </motion.div>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-bold hover:brightness-110 transition-all shadow-[0_0_15px_rgba(255,215,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Save Changes
            </button>
        </form>
    );
}
