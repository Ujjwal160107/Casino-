"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PropertyData } from "@/actions/property-actions";

interface PropertyFormProps {
    initialData?: PropertyData | null;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: PropertyData) => Promise<void>;
    isSubmitting: boolean;
}

const DEFAULT_DATA: PropertyData = {
    key: "",
    name: "",
    description: "",
    basePrice: 1000,
    incomePerCycle: 0,
    incomeCycleHours: 24,
    maxPerUser: 1,
    isPublic: true,
    imageUrl: ""
};

export function PropertyForm({ initialData, isOpen, onClose, onSubmit, isSubmitting }: PropertyFormProps) {
    const [formData, setFormData] = useState<PropertyData>(DEFAULT_DATA);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialData || DEFAULT_DATA);
        }
    }, [isOpen, initialData]);

    const handleChange = (field: keyof PropertyData, value: any) => {
        setFormData(prev => {
            const updates = { ...prev, [field]: value };

            // Auto-generate key from name if creating new and key hasn't been manually touched (simple heuristic)
            if (field === 'name' && !initialData && prev.key === prev.name.toLowerCase().replace(/[^a-z0-9]/g, "_")) {
                updates.key = (value as string).toLowerCase().replace(/[^a-z0-9]/g, "_");
            }
            return updates;
        });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                >
                    <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
                        <h2 className="text-xl font-bold text-white">
                            {initialData ? "Edit Property" : "Add New Property"}
                        </h2>
                        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="p-6 space-y-6">

                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Property Name</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => handleChange("name", e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50"
                                    placeholder="e.g. Penthouse"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Unique ID (Key)</label>
                                <input
                                    required
                                    type="text"
                                    disabled={!!initialData} // Lock key on edit
                                    value={formData.key}
                                    onChange={(e) => handleChange("key", e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 disabled:opacity-50 font-mono text-sm"
                                    placeholder="penthouse"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => handleChange("description", e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50 h-24"
                                placeholder="A luxurious penthouse in the city center..."
                            />
                        </div>

                        {/* Economics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Base Price</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.basePrice === 0 ? "" : formData.basePrice}
                                    onChange={(e) => handleChange("basePrice", e.target.value === "" ? 0 : parseInt(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Income / Cycle</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.incomePerCycle === 0 ? "" : formData.incomePerCycle}
                                    onChange={(e) => handleChange("incomePerCycle", e.target.value === "" ? 0 : parseInt(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Cycle (Hours)</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={formData.incomeCycleHours === 0 ? "" : formData.incomeCycleHours}
                                    onChange={(e) => handleChange("incomeCycleHours", e.target.value === "" ? 0 : parseInt(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50"
                                />
                            </div>
                        </div>

                        {/* Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Max Per User</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={formData.maxPerUser === 0 ? "" : formData.maxPerUser}
                                    onChange={(e) => handleChange("maxPerUser", e.target.value === "" ? 0 : parseInt(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50"
                                />
                            </div>
                            <div className="flex items-center gap-3 pt-6">
                                <input
                                    type="checkbox"
                                    id="isPublic"
                                    checked={formData.isPublic}
                                    onChange={(e) => handleChange("isPublic", e.target.checked)}
                                    className="w-5 h-5 rounded border-white/10 bg-black/40 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0"
                                />
                                <label htmlFor="isPublic" className="text-sm font-medium text-white cursor-pointer select-none">
                                    Publicly Purchasable
                                </label>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Image URL (Optional)</label>
                            <input
                                type="url"
                                value={formData.imageUrl || ""}
                                onChange={(e) => handleChange("imageUrl", e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500/50"
                                placeholder="https://..."
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-2.5 rounded-lg font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                {initialData ? "Save Changes" : "Create Property"}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
