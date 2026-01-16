"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateGeneralSettings } from "@/actions/settings-actions";

interface GeneralSettingsProps {
    guildId: string;
    initialSettings: {
        prefix: string;
        startMoney: number;
        currencyName: string;
        currencyEmoji: string;
        chatMoneyEnabled: boolean;
        walletLimit: number | null;
        bankLimit: number | null;
    };
}

export function GeneralSettings({ guildId, initialSettings }: GeneralSettingsProps) {
    const [settings, setSettings] = useState(initialSettings);
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: name === "startMoney" ? parseInt(value) || 0 : value
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setStatus({ type: null, message: "" });

        const result = await updateGeneralSettings(guildId, settings);

        if (result.success) {
            setStatus({ type: "success", message: "Settings saved successfully!" });
            setTimeout(() => setStatus({ type: null, message: "" }), 3000);
        } else {
            setStatus({ type: "error", message: result.error || "Failed to save settings." });
        }
        setIsSaving(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-md"
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white font-serif tracking-wide">General Settings</h2>
                    <p className="text-zinc-500 text-sm mt-1">Configure basic server settings.</p>
                </div>
                {status.message && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${status.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                            }`}
                    >
                        {status.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {status.message}
                    </motion.div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Prefix */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500">Bot Prefix</label>
                    <input
                        type="text"
                        name="prefix"
                        value={settings.prefix}
                        onChange={handleChange}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all placeholder:text-zinc-700"
                        placeholder="!"
                        maxLength={5}
                    />
                    <p className="text-[10px] text-zinc-600">The symbol used to trigger commands (max 5 chars).</p>
                </div>

                {/* Starting Money */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500">Starting Balance</label>
                    <div className="relative">
                        <input
                            type="number"
                            name="startMoney"
                            value={settings.startMoney}
                            onChange={handleChange}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all font-mono"
                            placeholder="1000"
                            min={0}
                        />
                    </div>
                    <p className="text-[10px] text-zinc-600">Initial cash given to new members.</p>
                </div>

                {/* Currency Name */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500">Currency Name</label>
                    <input
                        type="text"
                        name="currencyName"
                        value={settings.currencyName}
                        onChange={handleChange}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all"
                        placeholder="Coins"
                        maxLength={32}
                    />
                </div>

                {/* Currency Emoji */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500">Currency Emoji</label>
                    <input
                        type="text"
                        name="currencyEmoji"
                        value={settings.currencyEmoji}
                        onChange={handleChange}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all text-xl"
                        placeholder="🪙"
                        maxLength={64}
                    />
                </div>

                {/* Wallet Limit */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500">Wallet Limit</label>
                    <input
                        type="number"
                        name="walletLimit"
                        value={settings.walletLimit ?? ""}
                        onChange={(e) => {
                            const val = e.target.value === "" ? null : parseInt(e.target.value);
                            setSettings(prev => ({ ...prev, walletLimit: val }));
                        }}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all font-mono"
                        placeholder="No Limit"
                        min={0}
                    />
                    <p className="text-[10px] text-zinc-600">Max cash in wallet (Empty for infinite).</p>
                </div>

                {/* Bank Limit */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500">Bank Limit</label>
                    <input
                        type="number"
                        name="bankLimit"
                        value={settings.bankLimit ?? ""}
                        onChange={(e) => {
                            const val = e.target.value === "" ? null : parseInt(e.target.value);
                            setSettings(prev => ({ ...prev, bankLimit: val }));
                        }}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all font-mono"
                        placeholder="No Limit"
                        min={0}
                    />
                    <p className="text-[10px] text-zinc-600">Max cash in bank (Empty for infinite).</p>
                </div>

                {/* Chat Money Toggle */}
                <div className="md:col-span-2 flex items-center justify-between p-4 bg-zinc-950 border border-white/10 rounded-xl">
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Chat Money</h3>
                        <p className="text-[10px] text-zinc-600">Earn currency by chatting in text channels.</p>
                    </div>
                    <button
                        onClick={() => setSettings(prev => ({ ...prev, chatMoneyEnabled: !prev.chatMoneyEnabled }))}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.chatMoneyEnabled ? "bg-yellow-500" : "bg-zinc-800"}`}
                    >
                        <motion.div
                            animate={{ x: settings.chatMoneyEnabled ? 26 : 2 }}
                            className="absolute top-1 left-0 bg-white w-4 h-4 rounded-full shadow-sm"
                        />
                    </button>
                </div>
            </div>

            <div className="mt-8 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(234,179,8,0.2)] hover:shadow-[0_0_25px_rgba(234,179,8,0.4)]"
                >
                    {isSaving ? (
                        <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                        <Save size={18} />
                    )}
                    Save Changes
                </button>
            </div>
        </motion.div>
    );
}
