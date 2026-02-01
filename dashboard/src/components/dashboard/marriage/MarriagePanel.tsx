"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Save, AlertCircle, CheckCircle2, Heart, HeartCrack, Clock, Coins } from "lucide-react";
import { updateMarriageConfig } from "@/actions/marriage-actions";
import { DurationInput } from "@/components/dashboard/ui/DurationInput";

interface MarriagePanelProps {
    guildId: string;
    initialConfig: {
        marriageEnabled: boolean;
        marriageCost: number;
        divorceCost: number;
        marriageCooldown: number;
        currencyEmoji: string;
    };
}

export function MarriagePanel({ guildId, initialConfig }: MarriagePanelProps) {
    const [config, setConfig] = useState(initialConfig);
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : (parseInt(value) || 0)
        }));
    };

    const handleDurationChange = (val: number) => {
        setConfig(prev => ({ ...prev, marriageCooldown: val }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setStatus({ type: null, message: "" });

        const result = await updateMarriageConfig(guildId, config);

        if (result.success) {
            setStatus({ type: "success", message: "Marriage settings saved!" });
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
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-xl font-bold text-white font-serif tracking-wide flex items-center gap-2">
                        <Heart className="text-pink-500" size={24} />
                        Marriage Configuration
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1">Manage love, relationships, and divorce fees.</p>
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

            {/* Enable/Disable Toggle */}
            <div className="mb-8 p-4 bg-zinc-950/50 border border-white/10 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.marriageEnabled ? "bg-pink-500/20 text-pink-400" : "bg-zinc-800 text-zinc-500"}`}>
                        <Heart size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Enable Marriage System</h3>
                        <p className="text-[10px] text-zinc-500">Allow users to propose and marry.</p>
                    </div>
                </div>
                <button
                    onClick={() => setConfig(prev => ({ ...prev, marriageEnabled: !prev.marriageEnabled }))}
                    className={`w-12 h-6 rounded-full transition-colors relative ${config.marriageEnabled ? "bg-pink-500" : "bg-zinc-700"}`}
                >
                    <motion.div
                        animate={{ x: config.marriageEnabled ? 26 : 2 }}
                        className="absolute top-1 left-0 bg-white w-4 h-4 rounded-full shadow-sm"
                    />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Marriage Cost */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                        <Coins size={12} /> Marriage Cost
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            name="marriageCost"
                            value={config.marriageCost === 0 ? "" : config.marriageCost}
                            onChange={(e) => setConfig({ ...config, marriageCost: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all font-mono"
                            min={0}
                            disabled={!config.marriageEnabled}
                        />
                    </div>
                    <p className="text-[10px] text-zinc-600">Fee to propose/marry.</p>
                </div>

                {/* Divorce Cost */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                        <HeartCrack size={12} /> Divorce Cost
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            name="divorceCost"
                            value={config.divorceCost === 0 ? "" : config.divorceCost}
                            onChange={(e) => setConfig({ ...config, divorceCost: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all font-mono"
                            min={0}
                            disabled={!config.marriageEnabled}
                        />
                    </div>
                    <p className="text-[10px] text-zinc-600">Fee to dissolve a marriage.</p>
                </div>

                {/* Cooldown */}
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                        <Clock size={12} /> Remarry Cooldown
                    </label>
                    <div className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2">
                        <DurationInput
                            value={config.marriageCooldown}
                            onChange={handleDurationChange}
                            disabled={!config.marriageEnabled}
                            label=""
                        />
                    </div>
                    <p className="text-[10px] text-zinc-600">Wait time after divorce before remarriage.</p>
                </div>
            </div>

            <div className="mt-8 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-pink-500 hover:bg-pink-400 text-white font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(236,72,153,0.2)] hover:shadow-[0_0_25px_rgba(236,72,153,0.4)]"
                >
                    {isSaving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Save size={18} />
                    )}
                    Save Changes
                </button>
            </div>
        </motion.div>
    );
}
