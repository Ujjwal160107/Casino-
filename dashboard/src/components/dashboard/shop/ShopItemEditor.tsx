"use client";

import { useState } from "react";
import { upsertShopItem, deleteShopItem } from "@/actions/shop-actions";
import { Save, Trash2, Plus, X, Package, Shield, Zap, Clock, Image as ImageIcon } from "lucide-react";
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
                className="bg-[#0f0f12] border border-white/10 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white font-serif tracking-tight">{item ? "Edit Shop Item" : "Create Shop Item"}</h2>
                        <p className="text-zinc-500 text-sm mt-1">Configure item details, requirements, and automation.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-8 gap-8 bg-black/20">
                    {[
                        { id: "general", label: "General Details", icon: Package },
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
                <div className="p-8 overflow-y-auto flex-1 bg-black/20 text-zinc-300">

                    {/* GENERAL TAB */}
                    {activeTab === "general" && (
                        <div className="space-y-8 max-w-4xl mx-auto">
                            {/* Basic Info Section */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-6 space-y-6">
                                <h3 className="section-header">Basic Information</h3>
                                <div className="grid grid-cols-12 gap-6">
                                    <div className="col-span-8 space-y-2">
                                        <label className="label">Item Name</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => handleChange("name", e.target.value)}
                                            className="input-field py-3 text-lg font-bold"
                                            placeholder="e.g. VIP Member Pass"
                                        />
                                    </div>
                                    <div className="col-span-4 space-y-2">
                                        <label className="label">Price</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={formData.price}
                                                onChange={e => handleChange("price", parseInt(e.target.value))}
                                                className="input-field py-3 font-mono"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-12 space-y-2">
                                        <label className="label">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={e => handleChange("description", e.target.value)}
                                            className="input-field min-h-[100px] leading-relaxed resize-none"
                                            placeholder="Describe what this item does..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Inventory & Stock Section */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-6 space-y-6">
                                <h3 className="section-header">Inventory & Stock</h3>
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="label">Stock Limit</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    value={formData.stock}
                                                    onChange={e => handleChange("stock", parseInt(e.target.value))}
                                                    className="input-field font-mono"
                                                    placeholder="-1 for infinite"
                                                />
                                                <div className="flex items-center text-xs text-zinc-500 whitespace-nowrap px-2">
                                                    (-1 = ∞)
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="label">Expiration Duration</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-2.5 text-zinc-500" size={16} />
                                                <input
                                                    type="number"
                                                    value={formData.expiresIn || ""}
                                                    onChange={e => handleChange("expiresIn", e.target.value ? parseInt(e.target.value) : null)}
                                                    className="input-field pl-10"
                                                    placeholder="Seconds (Optional)"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="label">Item Features</label>
                                        <div className="space-y-3 p-4 bg-black/20 rounded-lg border border-white/5">
                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-zinc-400 group-hover:text-white transition-colors text-sm">Usable Item</span>
                                                <div className="relative">
                                                    <input type="checkbox" checked={formData.usable} onChange={e => handleChange("usable", e.target.checked)} className="peer sr-only" />
                                                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                                </div>
                                            </label>
                                            <div className="h-px bg-white/5 w-full" />
                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-zinc-400 group-hover:text-white transition-colors text-sm">Show in Inventory</span>
                                                <div className="relative">
                                                    <input type="checkbox" checked={formData.showInInventory} onChange={e => handleChange("showInInventory", e.target.checked)} className="peer sr-only" />
                                                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Visuals */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-6">
                                <h3 className="section-header">Visuals</h3>
                                <div className="mt-4 flex gap-6 items-start">
                                    <div className="flex-1 space-y-2">
                                        <label className="label">Image URL</label>
                                        <div className="relative">
                                            <ImageIcon className="absolute left-3 top-3 text-zinc-500" size={16} />
                                            <input
                                                type="text"
                                                value={formData.image || ""}
                                                onChange={e => handleChange("image", e.target.value)}
                                                className="input-field pl-10"
                                                placeholder="https://imgur.com/..."
                                            />
                                        </div>
                                    </div>
                                    <div className="w-24 h-24 bg-black/30 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                        {formData.image ? (
                                            <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon className="text-zinc-700" size={32} />
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
                            <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-6">
                                <h3 className="section-header mb-4">Financial Requirements</h3>
                                <div className="grid grid-cols-2 gap-8 items-center">
                                    <div>
                                        <label className="label block mb-2">Required Balance Check</label>
                                        <input
                                            type="number"
                                            value={formData.requirements?.balance || 0}
                                            onChange={e => handleReqChange("balance", parseInt(e.target.value))}
                                            className="input-field"
                                            placeholder="0"
                                        />
                                        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                                            The user must have at least this amount in their wallet/bank to purchase.
                                            This is <strong className="text-zinc-300">not deducted</strong> (use Price for deduction).
                                        </p>
                                    </div>
                                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-4 text-sm text-blue-300">
                                        <p>💡 Use this for "High Net Worth" items that require status proof.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Role Requirements */}
                            <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-6">
                                <h3 className="section-header mb-6">Access Control</h3>

                                {/* Header Row */}
                                <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-white/5 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                    <div className="col-span-3">Requirement</div>
                                    <div className="col-span-3">Validate On</div>
                                    <div className="col-span-6">Roles</div>
                                </div>

                                {/* Requirement Row (Mimicking Screenshot) */}
                                <div className="grid grid-cols-12 gap-4 px-4 py-4 bg-black/20 rounded-lg border border-white/5 items-start">
                                    {/* Column 1: Type */}
                                    <div className="col-span-3 pt-2">
                                        <div className="bg-zinc-800 text-white text-sm px-3 py-1.5 rounded border border-white/10 w-full flex justify-between items-center">
                                            Role
                                        </div>
                                    </div>

                                    {/* Column 2: Context */}
                                    <div className="col-span-3 pt-2 space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center text-white">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            </div>
                                            <span className="text-sm text-white font-medium">/item buy</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer opacity-50 select-none">
                                            <div className="w-5 h-5 border border-zinc-600 rounded"></div>
                                            <span className="text-sm text-zinc-500">/item use</span>
                                        </label>
                                    </div>

                                    {/* Column 3: Role Selector */}
                                    <div className="col-span-6">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                className="w-full text-left p-3 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm flex items-center justify-between group relative"
                                            >
                                                <span>+ Add Role Requirement</span>
                                                <Plus size={16} />

                                                {/* Dropdown (Simplified for layout, functionality via grid below) */}
                                            </button>
                                        </div>

                                        {/* Selected Roles Area */}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {roles.map(role => {
                                                const isSelected = formData.requirements?.roles?.includes(role.id);
                                                return (
                                                    <button
                                                        key={role.id}
                                                        onClick={() => {
                                                            const current = formData.requirements?.roles || [];
                                                            handleReqChange("roles", isSelected ? current.filter((id: string) => id !== role.id) : [...current, role.id]);
                                                        }}
                                                        className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-2 ${isSelected
                                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                            : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                                                            }`}
                                                    >
                                                        {role.name}
                                                        {isSelected && <X size={12} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ACTIONS TAB */}
                    {activeTab === "actions" && (
                        <div className="space-y-6 max-w-4xl mx-auto">
                            <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                <div>
                                    <h3 className="section-header">On Buy Automation</h3>
                                    <p className="text-zinc-500 text-sm mt-1">Actions to execute immediately when the item is purchased.</p>
                                </div>
                                <button onClick={addAction} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all">
                                    <Plus size={16} /> Add Action
                                </button>
                            </div>

                            <AnimatePresence>
                                <div className="space-y-4">
                                    {formData.onBuyActions?.map((action: any, idx: number) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, scale: 0.98 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.98 }}
                                            className="bg-zinc-900/40 rounded-xl border border-white/5 p-6 relative group hover:border-white/10 transition-colors"
                                        >
                                            <div className="grid grid-cols-12 gap-6 items-start">
                                                <div className="col-span-1 flex justify-center pt-3 text-zinc-600">
                                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-mono text-xs">
                                                        {idx + 1}
                                                    </div>
                                                </div>

                                                <div className="col-span-4 space-y-2">
                                                    <label className="label">Action Type</label>
                                                    <select
                                                        value={action.type}
                                                        onChange={e => updateAction(idx, "type", e.target.value)}
                                                        className="input-field py-2.5"
                                                    >
                                                        <option value="MSG">Send Direct Message</option>
                                                        <option value="ADD_ROLE">Add Discord Role</option>
                                                        <option value="REMOVE_ROLE">Remove Discord Role</option>
                                                    </select>
                                                </div>

                                                <div className="col-span-6 space-y-2">
                                                    <label className="label">Value / Content</label>
                                                    {action.type === "MSG" ? (
                                                        <input
                                                            type="text"
                                                            value={action.value}
                                                            onChange={e => updateAction(idx, "value", e.target.value)}
                                                            className="input-field py-2.5"
                                                            placeholder="Enter message..."
                                                        />
                                                    ) : (
                                                        <select
                                                            value={action.value}
                                                            onChange={e => updateAction(idx, "value", e.target.value)}
                                                            className="input-field py-2.5"
                                                        >
                                                            <option value="">Select Role...</option>
                                                            {roles.map(r => (
                                                                <option key={r.id} value={r.id}>{r.name}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>

                                                <div className="col-span-1 pt-9 flex justify-end">
                                                    <button
                                                        onClick={() => removeAction(idx)}
                                                        className="text-zinc-600 hover:text-red-400 p-2 rounded hover:bg-red-500/10 transition-colors"
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
                                <div className="text-center py-16 bg-zinc-900/20 border border-dashed border-white/10 rounded-xl">
                                    <Zap className="mx-auto text-zinc-700 mb-4" size={32} />
                                    <p className="text-zinc-500">No automation actions configured.</p>
                                    <button onClick={addAction} className="mt-4 text-yellow-500 hover:text-yellow-400 text-sm font-bold">
                                        Add First Action
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-8 border-t border-white/5 bg-zinc-900/50 flex justify-between items-center backdrop-blur-md">
                    {item ? (
                        <button onClick={handleDelete} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={18} /> Delete Item
                        </button>
                    ) : <div></div>}

                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-6 py-2.5 text-zinc-400 hover:text-white font-bold text-sm transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-yellow-500 text-black px-8 py-2.5 rounded-lg font-bold hover:bg-yellow-400 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-yellow-500/10 transform hover:scale-105"
                        >
                            {isSaving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Save size={18} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </motion.div>

            <style jsx global>{`
                .label {
                    @apply block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5;
                }
                .input-field {
                    @apply w-full bg-black/50 border border-white/20 hover:border-white/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all placeholder:text-zinc-700;
                }
                .section-header {
                    @apply text-lg font-bold text-white font-serif tracking-tight border-b border-white/5 pb-2;
                }
            `}</style>
        </div>
    );
}
