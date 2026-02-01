"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGeneralSettings, resetEconomy } from "@/actions/settings-actions";
import { Loader2, Save, Trash2, AlertTriangle } from "lucide-react";
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
        <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Prefix */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Bot Prefix</label>
                        <input
                            type="text"
                            maxLength={5}
                            value={formData.prefix}
                            onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                            placeholder="!"
                        />
                        <p className="text-xs text-zinc-500">Maximum 5 characters.</p>
                    </div>

                    {/* Start Money */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Starting Balance</label>
                        <input
                            type="number"
                            min={0}
                            value={formData.startMoney}
                            onChange={(e) => handleNumberChange("startMoney", e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                        />
                    </div>

                    {/* Vote Reward */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Vote Reward</label>
                        <input
                            type="number"
                            min={0}
                            value={formData.voteReward}
                            onChange={(e) => handleNumberChange("voteReward", e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                        />
                        <p className="text-xs text-zinc-500">Reward for voting (every 12h).</p>
                    </div>

                    {/* Currency Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Currency Name</label>
                        <input
                            type="text"
                            maxLength={32}
                            value={formData.currencyName}
                            onChange={(e) => setFormData({ ...formData, currencyName: e.target.value })}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                            placeholder="Coins"
                        />
                    </div>

                    {/* Currency Emoji */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Currency Emoji</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono text-sm backdrop-blur-sm"
                                value={formData.currencyEmoji}
                                onChange={(e) => setFormData({ ...formData, currencyEmoji: e.target.value })}
                                placeholder="🪙 or <:copy:123...>"
                            />
                            <div className="flex items-center justify-center w-12 shrink-0 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
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
                                        <span className="text-xl truncate px-1">
                                            {formData.currencyEmoji || "🪙"}
                                        </span>
                                    );
                                })()}
                            </div>
                        </div>
                        <p className="text-xs text-zinc-500">Supports Unicode emojis or Discord custom emoji IDs.</p>
                    </div>
                </div>

                {/* Wallet & Bank Limits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Wallet Limit</label>
                        <input
                            type="number"
                            min={0}
                            placeholder="No Limit"
                            value={formData.walletLimit ?? ""}
                            onChange={(e) => handleNumberChange("walletLimit", e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                        />
                        <p className="text-xs text-zinc-500">Max cash in wallet.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Bank Limit</label>
                        <input
                            type="number"
                            min={0}
                            placeholder="No Limit"
                            value={formData.bankLimit ?? ""}
                            onChange={(e) => handleNumberChange("bankLimit", e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                        />
                        <p className="text-xs text-zinc-500">Max cash in bank.</p>
                    </div>
                </div>

                {/* Global Bet Limits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Global Min Bet</label>
                        <input
                            type="number"
                            min={0}
                            value={formData.minBet}
                            onChange={(e) => handleNumberChange("minBet", e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                        />
                        <p className="text-xs text-zinc-500">Default minimum bet for all games.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Global Max Bet</label>
                        <input
                            type="number"
                            min={0}
                            value={formData.maxBet}
                            onChange={(e) => handleNumberChange("maxBet", e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all backdrop-blur-sm"
                        />
                        <p className="text-xs text-zinc-500">Default maximum bet for all games.</p>
                    </div>
                </div>



            </div>

            {/* Log Channel */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Casino Log Channel</label>
                <div className="relative">
                    <select
                        value={formData.logChannelId || ""}
                        onChange={(e) => setFormData({ ...formData, logChannelId: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none backdrop-blur-sm"
                    >
                        <option value="">Select a channel...</option>
                        {channels.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                                #{channel.name}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>

                <div className="mt-2">
                    <p className="text-xs text-zinc-500 mb-1">Or paste Channel ID if not listed:</p>
                    <input
                        type="text"
                        placeholder="Channel ID"
                        value={formData.logChannelId || ""}
                        onChange={(e) => setFormData({ ...formData, logChannelId: e.target.value })}
                        className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-sm text-zinc-400 focus:text-white focus:outline-none focus:border-white/20 transition-all backdrop-blur-sm"
                    />
                </div>
            </div>

            {/* Chat Money Toggle */}
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                    <h3 className="text-white font-medium">Chat Money</h3>
                    <p className="text-sm text-zinc-400 mt-1">Earn currency by chatting in active channels.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, chatMoneyEnabled: !formData.chatMoneyEnabled })}
                    className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${formData.chatMoneyEnabled ? "bg-primary shadow-[0_0_10px_rgba(255,215,0,0.5)]" : "bg-zinc-700"
                        }`}
                >
                    <span
                        className={`absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${formData.chatMoneyEnabled ? "translate-x-5" : "translate-x-0"
                            }`}
                    />
                </button>
            </div>

            {/* Danger Zone */}
            <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-6 mt-8">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-red-400 font-bold flex items-center gap-2">
                            <AlertTriangle size={18} /> Danger Zone
                        </h3>
                        <p className="text-sm text-zinc-400 mt-1">Destructive actions that cannot be undone.</p>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-red-500/10 flex items-center justify-between">
                    <div>
                        <p className="text-white font-medium">Reset Economy</p>
                        <p className="text-xs text-zinc-500 mt-1">Deletes all wallets, banks, items, and resets user statistics for everyone.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowResetConfirm(true)}
                        className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center gap-2"
                    >
                        <Trash2 size={16} /> Reset
                    </button>
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
                            className="bg-zinc-900 border border-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl"
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
            {
                message && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-lg text-sm border ${message.type === "success"
                            ? "bg-green-500/10 border-green-500/20 text-green-400"
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}
                    >
                        {message.text}
                    </motion.div>
                )
            }

            <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-bold hover:brightness-110 transition-all shadow-[0_0_15px_rgba(255,215,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Save Changes
            </button>
        </form >
    );
}
