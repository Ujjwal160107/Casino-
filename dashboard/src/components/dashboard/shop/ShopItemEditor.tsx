"use client";

import { useState } from "react";
import { upsertShopItem, deleteShopItem } from "@/actions/shop-actions";
import { Save, Trash2, Plus, X, Package, Shield, Zap, Clock, Image as ImageIcon, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

interface ShopItemEditorProps {
    guildId: string;
    item?: any; // If null, creating new
    roles: { id: string; name: string; color: number }[];
    onClose: () => void;
}

export function ShopItemEditor({ guildId, item, roles, onClose }: ShopItemEditorProps) {
    const router = useRouter();
    const [formData, setFormData] = useState(item || {
        name: "",
        description: "",
        price: 0,
        stock: -1,
        image: "",
        expiresIn: null, // Seconds
        usable: false,
        showInInventory: true,
        requirements: { roles: [], balance: 0 },
        onBuyActions: [] // { type: "MSG", value: "" }
    });
    const [activeTab, setActiveTab] = useState("general");
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleReqChange = (field: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            requirements: { ...prev.requirements, [field]: value }
        }));
    };

    const addAction = () => {
        setFormData((prev: any) => ({
            ...prev,
            onBuyActions: [...(prev.onBuyActions || []), { type: "MSG", value: "" }]
        }));
    };

    const updateAction = (idx: number, field: string, value: any) => {
        const newActions = [...(formData.onBuyActions || [])];
        newActions[idx] = { ...newActions[idx], [field]: value };
        setFormData((prev: any) => ({ ...prev, onBuyActions: newActions }));
    };

    const removeAction = (idx: number) => {
        setFormData((prev: any) => ({
            ...prev,
            onBuyActions: prev.onBuyActions.filter((_: any, i: number) => i !== idx)
        }));
    };

    const handleSave = async () => {
        if (!formData.name || formData.price < 0) {
            toast.error("Name and valid Price are required.");
            return;
        }

        setIsSaving(true);
        const res = await upsertShopItem(guildId, { ...formData, id: item?.id || "new" });
        setIsSaving(false);

        if (res.success) {
            toast.success("Item saved!");
            router.refresh();
            onClose();
        } else {
            toast.error(res.error || "Failed to save.");
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this item?")) return;
        const res = await deleteShopItem(item.id, guildId);
        if (res.success) {
            toast.success("Item deleted.");
            router.refresh();
            onClose();
        } else {
            toast.error("Failed to delete.");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-[#0f0f12] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
            >
                {/* Background Details */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-yellow-500/5 rounded-full blur-[100px] pointer-events-none" />

                {/* Header */}
                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/50 backdrop-blur-sm z-10">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-white font-serif tracking-tight flex items-center gap-3">
                            {item ? <EditIcon size={24} className="text-yellow-500" /> : <Package size={24} className="text-yellow-500" />}
                            {item ? "Edit Shop Item" : "Create New Item"}
                        </h2>
                        <p className="text-zinc-500 text-sm">Configure item details, requirements, and automation.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-8 gap-8 bg-black/20 z-10">
                    {[
                        { id: "general", label: "General Information", icon: Package },
                        { id: "reqs", label: "Requirements", icon: Shield },
                        { id: "actions", label: "Automation", icon: Zap },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-5 text-sm font-bold flex items-center gap-2.5 border-b-2 transition-all ${activeTab === tab.id
                                ? "border-yellow-500 text-yellow-500"
                                : "border-transparent text-zinc-500 hover:text-zinc-300"
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="p-8 overflow-y-auto flex-1 bg-black/20 text-zinc-300 z-10 custom-scrollbar">

                    {/* GENERAL TAB */}
                    {activeTab === "general" && (
                        <div className="space-y-8 max-w-4xl mx-auto">
                            {/* Basic Info Section */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8 space-y-8">
                                <h3 className="section-header">Basic Details</h3>
                                <div className="grid grid-cols-12 gap-8">
                                    <div className="col-span-8 space-y-3">
                                        <label className="label">Item Name</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => handleChange("name", e.target.value)}
                                            className="input-field text-lg font-bold py-3.5"
                                            placeholder="e.g. VIP Member Pass"
                                        />
                                    </div>
                                    <div className="col-span-4 space-y-3">
                                        <label className="label">Price</label>
                                        <div className="relative group">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold group-focus-within:text-yellow-500 transition-colors">$</span>
                                            <input
                                                type="number"
                                                value={formData.price}
                                                onChange={e => handleChange("price", parseInt(e.target.value))}
                                                className="input-field pl-8 font-mono py-3.5 text-lg"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-12 space-y-3">
                                        <label className="label">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={e => handleChange("description", e.target.value)}
                                            className="input-field min-h-[120px] leading-relaxed resize-none py-3"
                                            placeholder="Describe what this item does... (Markdown supported)"
                                        />
                                        <p className="text-right text-xs text-zinc-600">{formData.description.length}/1000</p>
                                    </div>
                                </div>
                            </div>

                            {/* Inventory & Stock Section */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8 space-y-6">
                                    <h3 className="section-header">Stock & Limits</h3>

                                    <div className="space-y-5">
                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <label className="label">Stock Available</label>
                                                <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Set to -1 for Infinite</span>
                                            </div>
                                            <input
                                                type="number"
                                                value={formData.stock}
                                                onChange={e => handleChange("stock", parseInt(e.target.value))}
                                                className={`input-field font-mono text-center text-lg py-3 ${formData.stock === -1 ? "text-green-400 border-green-500/30 bg-green-500/5 focus:border-green-500" : ""}`}
                                                placeholder="-1"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="label">Expires After (Sec)</label>
                                            <div className="relative">
                                                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                                <input
                                                    type="number"
                                                    value={formData.expiresIn || ""}
                                                    onChange={e => handleChange("expiresIn", e.target.value ? parseInt(e.target.value) : null)}
                                                    className="input-field pl-11 py-3"
                                                    placeholder="Optional (Permanent)"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8 space-y-6 flex flex-col">
                                    <h3 className="section-header">Configurations</h3>
                                    <div className="flex-1 flex flex-col justify-center gap-4">
                                        <label className="flex items-center justify-between cursor-pointer group bg-black/20 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-zinc-200 group-hover:text-white transition-colors">Usable Item</span>
                                                <span className="text-xs text-zinc-500 mt-1">Can be used via /use command</span>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" checked={formData.usable} onChange={e => handleChange("usable", e.target.checked)} className="peer sr-only" />
                                                <div className="w-12 h-7 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 transition-colors border border-white/10"></div>
                                            </div>
                                        </label>

                                        <label className="flex items-center justify-between cursor-pointer group bg-black/20 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-zinc-200 group-hover:text-white transition-colors">Inventory</span>
                                                <span className="text-xs text-zinc-500 mt-1">Visible in user inventory</span>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" checked={formData.showInInventory} onChange={e => handleChange("showInInventory", e.target.checked)} className="peer sr-only" />
                                                <div className="w-12 h-7 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-colors border border-white/10"></div>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Visuals */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8">
                                <h3 className="section-header">Asset & Visuals</h3>
                                <div className="mt-6 flex gap-8 items-start">
                                    <div className="flex-1 space-y-3">
                                        <label className="label">Image URL</label>
                                        <div className="relative">
                                            <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                                            <input
                                                type="text"
                                                value={formData.image || ""}
                                                onChange={e => handleChange("image", e.target.value)}
                                                className="input-field pl-12 py-3"
                                                placeholder="https://imgur.com/..."
                                            />
                                        </div>
                                        <p className="text-xs text-zinc-500 ml-1">Supports PNG, JPG, GIF & WebP</p>
                                    </div>
                                    <div className="w-32 h-32 bg-black/30 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-xl">
                                        {formData.image ? (
                                            <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center">
                                                <ImageIcon className="text-zinc-800 mx-auto mb-2" size={32} />
                                                <span className="text-[10px] text-zinc-700 font-bold uppercase">No Image</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* REQUIREMENTS TAB */}
                    {activeTab === "reqs" && (
                        <div className="space-y-8 max-w-4xl mx-auto">

                            {/* Financial Requirements */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8">
                                <h3 className="section-header mb-6">Financial Prerequisites</h3>
                                <div className="grid grid-cols-2 gap-8 items-start">
                                    <div className="space-y-3">
                                        <label className="label">Required Minimum Balance</label>
                                        <div className="relative group">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold group-focus-within:text-yellow-500 transition-colors">$</span>
                                            <input
                                                type="number"
                                                value={formData.requirements?.balance || 0}
                                                onChange={e => handleReqChange("balance", parseInt(e.target.value))}
                                                className="input-field pl-8 font-mono py-3"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-6 text-sm text-blue-300 leading-relaxed">
                                        <h4 className="font-bold mb-2 flex items-center gap-2"><Shield size={14} /> Usage Tip</h4>
                                        Use this for "High Net Worth" or exclusive items. This amount is checked but <strong>not deducted</strong>.
                                    </div>
                                </div>
                            </div>

                            {/* Role Requirements */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8">
                                <h3 className="section-header mb-6">Access Control</h3>

                                {/* Improved Role Selector UI */}
                                <div className="space-y-6">
                                    <div className="flex justify-between items-end">
                                        <p className="text-sm text-zinc-400">Select roles required to purchase this item.</p>
                                    </div>

                                    <div className="bg-black/20 border border-white/5 rounded-xl p-6 min-h-[200px]">
                                        <div className="flex flex-wrap gap-2.5">
                                            {roles.map(role => {
                                                const isSelected = formData.requirements?.roles?.includes(role.id);
                                                return (
                                                    <button
                                                        key={role.id}
                                                        onClick={() => {
                                                            const current = formData.requirements?.roles || [];
                                                            handleReqChange("roles", isSelected ? current.filter((id: string) => id !== role.id) : [...current, role.id]);
                                                        }}
                                                        className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all flex items-center gap-2.5 ${isSelected
                                                            ? "bg-yellow-500 text-black border-yellow-500 shadow-[0_0_15px_-3px_rgba(234,179,8,0.3)] transform scale-105"
                                                            : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-500"
                                                            }`}
                                                    >
                                                        {role.name}
                                                        {isSelected && <X size={12} className="ml-1 opacity-75" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {roles.length === 0 && (
                                            <div className="text-center text-zinc-600 italic mt-8">No roles found in this server.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ACTIONS TAB */}
                    {activeTab === "actions" && (
                        <div className="space-y-8 max-w-4xl mx-auto">
                            <div className="flex justify-between items-end border-b border-white/5 pb-6">
                                <div>
                                    <h3 className="section-header border-none pb-0">On Buy Automation</h3>
                                    <p className="text-zinc-500 text-sm mt-2">Actions to execute immediately when the item is purchased.</p>
                                </div>
                                <button onClick={addAction} className="bg-yellow-500 text-black border border-yellow-500 px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/10">
                                    <Plus size={16} /> Add Action
                                </button>
                            </div>

                            <AnimatePresence>
                                <div className="space-y-4">
                                    {formData.onBuyActions?.map((action: any, idx: number) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="bg-zinc-900/40 rounded-2xl border border-white/5 p-6 relative group hover:border-white/10 transition-colors"
                                        >
                                            <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-500 z-10">
                                                {idx + 1}
                                            </div>

                                            <div className="grid grid-cols-12 gap-6 items-start pl-4">
                                                <div className="col-span-4 space-y-3">
                                                    <label className="label">Action Type</label>
                                                    <div className="relative">
                                                        <select
                                                            value={action.type}
                                                            onChange={e => updateAction(idx, "type", e.target.value)}
                                                            className="input-field py-3 appearance-none"
                                                        >
                                                            <option value="MSG">Send Direct Message</option>
                                                            <option value="ADD_ROLE">Add Discord Role</option>
                                                            <option value="REMOVE_ROLE">Remove Discord Role</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
                                                    </div>
                                                </div>

                                                <div className="col-span-7 space-y-3">
                                                    <label className="label">Value / Content</label>
                                                    {action.type === "MSG" ? (
                                                        <input
                                                            type="text"
                                                            value={action.value}
                                                            onChange={e => updateAction(idx, "value", e.target.value)}
                                                            className="input-field py-3"
                                                            placeholder="Enter message..."
                                                        />
                                                    ) : (
                                                        <div className="relative">
                                                            <select
                                                                value={action.value}
                                                                onChange={e => updateAction(idx, "value", e.target.value)}
                                                                className="input-field py-3 appearance-none"
                                                            >
                                                                <option value="">Select Role...</option>
                                                                {roles.map(r => (
                                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="col-span-1 pt-9 flex justify-end">
                                                    <button
                                                        onClick={() => removeAction(idx)}
                                                        className="text-zinc-600 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </AnimatePresence>

                            {(!formData.onBuyActions || formData.onBuyActions.length === 0) && (
                                <div className="text-center py-20 bg-zinc-900/20 border border-dashed border-white/10 rounded-2xl">
                                    <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Zap className="text-zinc-600" size={24} />
                                    </div>
                                    <p className="text-zinc-500 font-medium">No automation actions configured.</p>
                                    <p className="text-zinc-600 text-sm mt-1 mb-6">Add actions to automate role assignment or messaging.</p>
                                    <button onClick={addAction} className="text-yellow-500 hover:text-yellow-400 text-sm font-bold border-b border-yellow-500/30 hover:border-yellow-500 transition-all">
                                        Add First Action
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-8 border-t border-white/5 bg-[#0f0f12] flex justify-between items-center z-10">
                    {item ? (
                        <button onClick={handleDelete} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-2 px-4 py-2.5 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20">
                            <Trash2 size={16} /> Delete Item
                        </button>
                    ) : <div></div>}

                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-6 py-3 text-zinc-400 hover:text-white font-bold text-sm transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-yellow-500 text-black px-8 py-3 rounded-lg font-bold hover:bg-yellow-400 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-yellow-500/10 transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isSaving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Save size={18} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </motion.div>

            <style jsx global>{`
                .label {
                    @apply block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5 ml-1;
                }
                .input-field {
                    @apply w-full bg-black/40 border border-white/10 hover:border-white/20 rounded-xl px-5 py-3 text-white focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all placeholder:text-zinc-700;
                }
                .section-header {
                    @apply text-xl font-bold text-white font-serif tracking-tight border-b border-white/5 pb-4;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}

function EditIcon({ size, className }: { size?: number, className?: string }) {
    return (
        <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
    );
}

