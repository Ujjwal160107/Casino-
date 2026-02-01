"use client";

import { useState } from "react";
import { updateBankSettings } from "@/actions/settings-actions";
import { Save, Plus, Trash2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface CreditTier {
    minScore: number;
    maxLoan: number;
    maxDays: number;
}

interface BankConfigFormProps {
    guildId: string;
    initialData: any;
}

export function BankConfigForm({ guildId, initialData }: BankConfigFormProps) {
    const [formData, setFormData] = useState({
        ...initialData,
        creditConfig: Array.isArray(initialData.creditConfig) ? initialData.creditConfig : []
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const addCreditTier = () => {
        setFormData((prev: any) => ({
            ...prev,
            creditConfig: [...prev.creditConfig, { minScore: 500, maxLoan: 10000, maxDays: 7 }]
        }));
    };

    const removeCreditTier = (index: number) => {
        setFormData((prev: any) => ({
            ...prev,
            creditConfig: prev.creditConfig.filter((_: any, i: number) => i !== index)
        }));
    };

    const updateCreditTier = (index: number, field: keyof CreditTier, value: number) => {
        const newConfig = [...formData.creditConfig];
        newConfig[index] = { ...newConfig[index], [field]: value };
        setFormData((prev: any) => ({ ...prev, creditConfig: newConfig }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await updateBankSettings(guildId, formData);
            if (res.success) {
                toast.success("Bank settings saved successfully!");
            } else {
                toast.error("Failed to save settings: " + res.error);
            }
        } catch (error) {
            toast.error("An unexpected error occurred.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8 max-w-5xl pb-20">

            {/* Interest Rates Section */}
            <section className="bg-black/20 border border-white/5 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-green-500 rounded-full"></span>
                    Interest Rates
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            Loan Interest (%)
                        </label>
                        <input
                            type="number"
                            value={formData.loanInterestRate === 0 ? "" : formData.loanInterestRate}
                            onChange={(e) => handleChange("loanInterestRate", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500/50 transition-colors"
                        />
                        <p className="text-xs text-zinc-600 mt-2">Daily interest charged on active loans.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            FD Interest (%)
                        </label>
                        <input
                            type="number"
                            value={formData.fdInterestRate === 0 ? "" : formData.fdInterestRate}
                            onChange={(e) => handleChange("fdInterestRate", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500/50 transition-colors"
                        />
                        <p className="text-xs text-zinc-600 mt-2">Flat interest for Fixed Deposits.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            RD Interest (%)
                        </label>
                        <input
                            type="number"
                            value={formData.rdInterestRate === 0 ? "" : formData.rdInterestRate}
                            onChange={(e) => handleChange("rdInterestRate", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500/50 transition-colors"
                        />
                        <p className="text-xs text-zinc-600 mt-2">Interest for Recurring Deposits.</p>
                    </div>
                </div>
            </section>

            {/* Limits & General Section */}
            <section className="bg-black/20 border border-white/5 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                    Global Limits
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            Bank Capacity
                        </label>
                        <input
                            type="number"
                            value={formData.bankLimit ?? ""}
                            onChange={(e) => handleChange("bankLimit", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            placeholder="Unlimited"
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <p className="text-xs text-zinc-600 mt-2">Max coins a user can store in bank.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            Max Active Loans
                        </label>
                        <input
                            type="number"
                            value={formData.maxActiveLoans === 0 ? "" : formData.maxActiveLoans}
                            onChange={(e) => handleChange("maxActiveLoans", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <p className="text-xs text-zinc-600 mt-2">Simultaneous loans a single user can hold.</p>
                    </div>
                </div>
            </section>

            {/* Credit Score Logic */}
            <section className="bg-black/20 border border-white/5 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                    Credit System
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase mb-2">Min Credit Score</label>
                        <input
                            type="number"
                            value={formData.minCreditScore === 0 ? "" : formData.minCreditScore}
                            onChange={(e) => handleChange("minCreditScore", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase mb-2">Max Credit Score</label>
                        <input
                            type="number"
                            value={formData.maxCreditScore === 0 ? "" : formData.maxCreditScore}
                            onChange={(e) => handleChange("maxCreditScore", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-green-400 uppercase mb-2">Repay Reward (+)</label>
                        <input
                            type="number"
                            value={formData.creditScoreReward === 0 ? "" : formData.creditScoreReward}
                            onChange={(e) => handleChange("creditScoreReward", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-red-400 uppercase mb-2">Late Penalty (-)</label>
                        <input
                            type="number"
                            value={formData.creditScorePenalty === 0 ? "" : formData.creditScorePenalty}
                            onChange={(e) => handleChange("creditScorePenalty", e.target.value === "" ? 0 : parseInt(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                    </div>
                </div>

                <div className="border-t border-white/5 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="space-y-1">
                            <h4 className="text-white font-semibold">Credit Tiers</h4>
                            <p className="text-sm text-zinc-400">Define loan eligibility based on credit score.</p>
                        </div>
                        <button
                            onClick={addCreditTier}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold uppercase transition-colors flex items-center gap-2"
                        >
                            <Plus size={14} /> Add Tier
                        </button>
                    </div>

                    {formData.creditConfig.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-white/10 rounded-lg">
                            <Info className="mx-auto text-zinc-600 mb-2" />
                            <p className="text-zinc-500 text-sm">No credit tiers defined. Default system limits will apply.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-zinc-500 uppercase px-2">
                                <div className="col-span-3">Min Score</div>
                                <div className="col-span-3">Max Loan</div>
                                <div className="col-span-3">Max Days</div>
                                <div className="col-span-1"></div>
                            </div>
                            <AnimatePresence>
                                {formData.creditConfig.map((tier: CreditTier, idx: number) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="grid grid-cols-12 gap-2 items-center bg-white/5 p-2 rounded-lg border border-white/5"
                                    >
                                        <div className="col-span-3">
                                            <input
                                                type="number"
                                                value={tier.minScore}
                                                onChange={(e) => updateCreditTier(idx, 'minScore', parseInt(e.target.value))}
                                                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number"
                                                value={tier.maxLoan}
                                                onChange={(e) => updateCreditTier(idx, 'maxLoan', parseInt(e.target.value))}
                                                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number"
                                                value={tier.maxDays}
                                                onChange={(e) => updateCreditTier(idx, 'maxDays', parseInt(e.target.value))}
                                                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                                            />
                                        </div>
                                        <div className="col-span-3 text-right">
                                            <button
                                                onClick={() => removeCreditTier(idx)}
                                                className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </section>

            {/* Floating Save Button */}
            <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                className="fixed bottom-6 right-6 z-50"
            >
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save size={18} />
                            Save Config
                        </>
                    )}
                </button>
            </motion.div>
        </div>
    );
}
