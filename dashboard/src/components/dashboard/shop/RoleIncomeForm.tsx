"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRoleIncomes } from "@/actions/income-actions";
import { Loader2, Plus, Save, Trash2, Clock, Coins, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
}

export function RoleIncomeForm({ guildId, initialIncomes, roles }: RoleIncomeFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [incomes, setIncomes] = useState<RoleIncome[]>(initialIncomes);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const collectibles = incomes.filter(i => i.incomeType === "COLLECTIBLE");
    const automatics = incomes.filter(i => i.incomeType === "AUTOMATIC");

    const addIncome = (type: "COLLECTIBLE" | "AUTOMATIC") => {
        if (type === "COLLECTIBLE" && collectibles.length >= 2) return;
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
        // We need to find the actual index in the main 'incomes' array
        // This is a bit tricky since we filter for display.
        // Easier way: logic to filter OUT the item being removed.
        // Since we don't have unique IDs for new items, let's just reconstruct.

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

    const renderSection = (title: string, description: string, type: "COLLECTIBLE" | "AUTOMATIC", items: RoleIncome[], limit: number, icon: any) => (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <p className="text-sm text-zinc-400">{description}</p>
                    </div>
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
                            className="grid grid-cols-12 gap-3 items-end bg-black/20 p-4 rounded-lg border border-white/5"
                        >
                            <div className="col-span-12 md:col-span-5 space-y-1">
                                <label className="text-xs text-zinc-500">Role</label>
                                <select
                                    value={income.roleId}
                                    onChange={(e) => updateIncome(idx, "roleId", e.target.value, type)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                                >
                                    {roles.map(r => (
                                        <option key={r.id} value={r.id} style={{ color: r.color ? `#${r.color.toString(16)}` : 'white' }}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-5 md:col-span-3 space-y-1">
                                <label className="text-xs text-zinc-500">Amount</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={0}
                                        value={income.amount}
                                        onChange={(e) => updateIncome(idx, "amount", parseInt(e.target.value) || 0, type)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">🪙</span>
                                </div>
                            </div>
                            <div className="col-span-5 md:col-span-3 space-y-1">
                                <label className="text-xs text-zinc-500">Cooldown (Sec)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={0}
                                        value={income.cooldown}
                                        onChange={(e) => updateIncome(idx, "cooldown", parseInt(e.target.value) || 0, type)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                                    />
                                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                </div>
                            </div>
                            <div className="col-span-2 md:col-span-1 flex justify-end pb-1">
                                <button
                                    onClick={() => removeIncome(idx, type)}
                                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {items.length === 0 && (
                    <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-white/10 rounded-lg">
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
        <div className="space-y-8 max-w-4xl">
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

            <div className="grid grid-cols-1 gap-8">
                {renderSection(
                    "Collectible Incomes",
                    "Users must manually run /collect to claim these rewards.",
                    "COLLECTIBLE",
                    collectibles,
                    2,
                    <Coins size={20} />
                )}

                {renderSection(
                    "Automatic Incomes",
                    "Rewards are automatically deposited into user banks every 24 hours.",
                    "AUTOMATIC",
                    automatics,
                    10,
                    <Clock size={20} />
                )}
            </div>

            <div className="flex justify-end pt-4">
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-yellow-500 text-black px-8 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/20 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Save Changes
                </button>
            </div>
        </div>
    );
}

function AlertTriangle(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </svg>
    )
}
