"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRoleIncomes } from "@/actions/income-actions";
import { Loader2, Plus, Save, Trash2, Clock, Coins, ShieldCheck, Zap, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DurationInput } from "@/components/dashboard/ui/DurationInput";

interface RoleIncome {
    roleId: string;
    amount: number;
    cooldown: number;
    incomeType: "COLLECTIBLE" | "AUTOMATIC";
}

interface RoleIncomeFormProps {
    guildId: string;
    initialIncomes: RoleIncome[];
    roles: { id: string; name: string; color: number }[];
    currencyEmoji?: string;
}

export function RoleIncomeForm({ guildId, initialIncomes, roles, currencyEmoji = "🪙" }: RoleIncomeFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [incomes, setIncomes] = useState<RoleIncome[]>(initialIncomes);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [activeTab, setActiveTab] = useState<"collectible" | "automatic">("collectible");

    const collectibles = incomes.filter(i => i.incomeType === "COLLECTIBLE");
    const automatics = incomes.filter(i => i.incomeType === "AUTOMATIC");

    const addIncome = (type: "COLLECTIBLE" | "AUTOMATIC") => {
        if (type === "COLLECTIBLE" && collectibles.length >= 20) return;
        if (type === "AUTOMATIC" && automatics.length >= 10) return;

        setIncomes([
            ...incomes,
            {
                roleId: roles[0]?.id || "",
                amount: 100,
                cooldown: 86400, // Default 24h
                incomeType: type
            }
        ]);
    };

    const removeIncome = (index: number, listType: "COLLECTIBLE" | "AUTOMATIC") => {
        let newIncomes = [...incomes];
        let count = 0;
        const targetIndex = newIncomes.findIndex(item => {
            if (item.incomeType === listType) {
                if (count === index) return true;
                count++;
            }
            return false;
        });

        if (targetIndex !== -1) {
            newIncomes.splice(targetIndex, 1);
            setIncomes(newIncomes);
        }
    };

    const updateIncome = (index: number, field: keyof RoleIncome, value: any, listType: "COLLECTIBLE" | "AUTOMATIC") => {
        let newIncomes = [...incomes];
        let count = 0;
        const targetIndex = newIncomes.findIndex(item => {
            if (item.incomeType === listType) {
                if (count === index) return true;
                count++;
            }
            return false;
        });

        if (targetIndex !== -1) {
            newIncomes[targetIndex] = { ...newIncomes[targetIndex], [field]: value };
            setIncomes(newIncomes);
        }
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        setMessage(null);
        try {
            const res = await updateRoleIncomes(guildId, incomes);
            if (res.success) {
                setMessage({ type: "success", text: "Role incomes updated successfully!" });
                router.refresh();
            } else {
                setMessage({ type: "error", text: res.error || "Failed to update." });
            }
        } catch (error) {
            setMessage({ type: "error", text: "Something went wrong." });
        }
        setIsLoading(false);
    };

    const renderSection = (title: string, description: string, type: "COLLECTIBLE" | "AUTOMATIC", items: RoleIncome[], limit: number) => (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5">
                <div>
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <p className="text-sm text-zinc-400">{description}</p>
                </div>
                <div className="text-sm font-mono text-zinc-500 bg-black/20 px-3 py-1 rounded-full border border-white/5">
                    {items.length} / {limit} Slots
                </div>
            </div>

            <div className="space-y-3">
                <AnimatePresence>
                    {items.map((income, idx) => (
                        <motion.div
                            key={`${type}-${idx}`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-black/20 p-4 rounded-lg border border-white/5"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
                                {/* Role Selection */}
                                <div className="lg:col-span-4 space-y-1">
                                    <label className="text-xs text-zinc-500">Role</label>
                                    <select
                                        value={income.roleId}
                                        onChange={(e) => updateIncome(idx, "roleId", e.target.value, type)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50 mb-2"
                                    >
                                        {roles.map(r => (
                                            <option key={r.id} value={r.id} style={{ color: r.color ? `#${r.color.toString(16)}` : 'white' }}>
                                                {r.name}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="Or Enter Role ID"
                                        value={income.roleId}
                                        onChange={(e) => updateIncome(idx, "roleId", e.target.value, type)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-400 font-mono focus:outline-none focus:border-yellow-500/50"
                                    />
                                </div>

                                {/* Amount */}
                                <div className="lg:col-span-3 space-y-1">
                                    <label className="text-xs text-zinc-500">Amount</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min={0}
                                            value={income.amount}
                                            onChange={(e) => updateIncome(idx, "amount", parseInt(e.target.value) || 0, type)}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                                        />
                                    </div>
                                </div>

                                {/* Duration Input */}
                                <div className="lg:col-span-4 space-y-1">
                                    <DurationInput
                                        label="Cooldown / Interval"
                                        value={income.cooldown}
                                        onChange={(val) => updateIncome(idx, "cooldown", val, type)}
                                    />
                                </div>

                                {/* Delete Button */}
                                <div className="lg:col-span-1 flex justify-end pt-6">
                                    <button
                                        onClick={() => removeIncome(idx, type)}
                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {items.length === 0 && (
                    <div className="text-center py-12 text-zinc-500 text-sm border border-dashed border-white/10 rounded-lg bg-white/5">
                        <div className="flex justify-center mb-2">
                            {type === "COLLECTIBLE" ? <Coins size={32} className="opacity-20" /> : <Zap size={32} className="opacity-20" />}
                        </div>
                        No active role incomes.
                    </div>
                )}

                {items.length < limit && (
                    <button
                        onClick={() => addIncome(type)}
                        className="w-full py-3 flex items-center justify-center gap-2 text-sm font-bold text-zinc-400 border border-dashed border-white/10 rounded-lg hover:border-yellow-500/50 hover:text-yellow-500 hover:bg-yellow-500/5 transition-all"
                    >
                        <Plus size={16} /> Add Slot
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Status Message */}
            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-4 rounded-lg border flex items-center gap-2 ${message.type === "success"
                            ? "bg-green-500/10 border-green-500/20 text-green-400"
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}
                    >
                        {message.type === "success" ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            <div>
                {/* Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-white/5 pb-1">
                    <button
                        onClick={() => setActiveTab("collectible")}
                        className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "collectible"
                            ? "bg-yellow-500 text-black"
                            : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                            }`}
                    >
                        <Coins size={16} /> Collectibles
                    </button>
                    <button
                        onClick={() => setActiveTab("automatic")}
                        className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === "automatic"
                            ? "bg-purple-500 text-white"
                            : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                            }`}
                    >
                        <Zap size={16} /> Automatic
                    </button>
                </div>

                {/* Content Area */}
                <div className="mt-6 min-h-[400px]">
                    {activeTab === "collectible" && renderSection(
                        "Collectible Configuration",
                        "Users must manually run /collect to claim these rewards.",
                        "COLLECTIBLE",
                        collectibles,
                        20
                    )}

                    {activeTab === "automatic" && renderSection(
                        "Automatic Configuration",
                        "Rewards are automatically deposited into user banks at the specified interval.",
                        "AUTOMATIC",
                        automatics,
                        10
                    )}
                </div>
            </div>

            <div className="flex justify-end pt-4 sticky bottom-6">
                <div className="bg-zinc-900/90 backdrop-blur-sm p-2 rounded-xl border border-white/10 shadow-2xl">
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="flex items-center gap-2 bg-yellow-500 text-black px-8 py-3 rounded-lg font-bold hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/20 disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
