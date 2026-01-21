"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGeneralSettings, resetEconomy } from "@/actions/settings-actions";
import { Loader2, Save, Trash2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { DurationInput } from "../ui/DurationInput";

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
    };
    channels?: { id: string; name: string }[];
}

export function GeneralConfigForm({ guildId, initialData, channels = [] }: GeneralConfigFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        ...initialData,
        walletLimit: initialData.walletLimit ?? null,
        bankLimit: initialData.bankLimit ?? null,
        minBet: initialData.minBet ?? 100,
        maxBet: initialData.maxBet ?? 100000,
        logChannelId: initialData.logChannelId ?? "",
        dropExpiration: initialData.dropExpiration ?? 60
    });
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

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

        try {
            const result = await updateGeneralSettings(guildId, formData);
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
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
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
                            onChange={(e) => setFormData({ ...formData, startMoney: parseInt(e.target.value) || 0 })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
                        />
                    </div>

                    {/* Currency Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Currency Name</label>
                        <input
                            type="text"
                            maxLength={32}
                            value={formData.currencyName}
                            onChange={(e) => setFormData({ ...formData, currencyName: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
                            placeholder="Coins"
                        />
                    </div>

                    {/* Currency Emoji */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Currency Emoji</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all font-mono text-sm"
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
                            onChange={(e) => setFormData({ ...formData, walletLimit: e.target.value ? parseInt(e.target.value) : null })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
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
                            onChange={(e) => setFormData({ ...formData, bankLimit: e.target.value ? parseInt(e.target.value) : null })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
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
                            value={formData.minBet || 0}
                            onChange={(e) => setFormData({ ...formData, minBet: parseInt(e.target.value) || 0 })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
                        />
                        <p className="text-xs text-zinc-500">Default minimum bet for all games.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Global Max Bet</label>
                        <input
                            type="number"
                            min={0}
                            value={formData.maxBet || 0}
                            onChange={(e) => setFormData({ ...formData, maxBet: parseInt(e.target.value) || 0 })}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all"
                        />
                        <p className="text-xs text-zinc-500">Default maximum bet for all games.</p>
                    </div>
                </div>

                {/* Drop Expiration */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-white mb-2">Money Settings</h3>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Drop Expiration</label>
                        <DurationInput
                            value={formData.dropExpiration || 60}
                            onChange={(val) => setFormData({ ...formData, dropExpiration: val })}
                        />
                        <p className="text-xs text-zinc-500">How long money drops last before disappearing.</p>
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
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 transition-all appearance-none"
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
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-zinc-400 focus:text-white focus:outline-none focus:border-white/20 transition-all"
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
                    className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${formData.chatMoneyEnabled ? "bg-yellow-500" : "bg-zinc-700"
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
                className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-2.5 rounded-lg font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Save Changes
            </button>
        </form >
    );
}
