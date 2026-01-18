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
                className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white font-serif">{item ? "Edit Item" : "New Item"}</h2>
                        <p className="text-zinc-400 text-sm">Configure item details, requirements, and actions.</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-6 gap-6 bg-zinc-900/30">
                    {[
                        { id: "general", label: "General", icon: Package },
                        { id: "reqs", label: "Requirements", icon: Shield },
                        { id: "actions", label: "Actions", icon: Zap },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === tab.id
                                    ? "border-yellow-500 text-yellow-500"
                                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto flex-1 bg-black/20">

                    {/* GENERAL TAB */}
                    {activeTab === "general" && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="label">Item Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => handleChange("name", e.target.value)}
                                        className="input-field"
                                        placeholder="Ex: VIP Pass"
                                    />
                                </div>
                                <div>
                                    <label className="label">Price</label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={e => handleChange("price", parseInt(e.target.value))}
                                        className="input-field"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label">Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => handleChange("description", e.target.value)}
                                    className="input-field min-h-[80px]"
                                    placeholder="What does this item do?"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="label">Stock (-1 for Unlimited)</label>
                                    <input
                                        type="number"
                                        value={formData.stock}
                                        onChange={e => handleChange("stock", parseInt(e.target.value))}
                                        className="input-field"
                                    />
                                </div>
                                <div>
                                    <label className="label">Expiration (Seconds, Optional)</label>
                                    <div className="relative">
                                        <Clock className="absolute left-3 top-2.5 text-zinc-500" size={16} />
                                        <input
                                            type="number"
                                            value={formData.expiresIn || ""}
                                            onChange={e => handleChange("expiresIn", e.target.value ? parseInt(e.target.value) : null)}
                                            className="input-field pl-10"
                                            placeholder="Permanent"
                                        />
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-1">Item will be removed from inventory after this time.</p>
                                </div>
                            </div>

                            <div>
                                <label className="label">Image URL (Optional)</label>
                                <div className="flex gap-4">
                                    <div className="relative flex-1">
                                        <ImageIcon className="absolute left-3 top-2.5 text-zinc-500" size={16} />
                                        <input
                                            type="text"
                                            value={formData.image || ""}
                                            onChange={e => handleChange("image", e.target.value)}
                                            className="input-field pl-10"
                                            placeholder="https://imgur.com/..."
                                        />
                                    </div>
                                    {formData.image && (
                                        <img src={formData.image} alt="Preview" className="w-10 h-10 rounded object-cover border border-white/10" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-8 pt-4 border-t border-white/5">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.usable ? "bg-green-500 border-green-500" : "border-zinc-600 group-hover:border-zinc-500"}`}>
                                        {formData.usable && <div className="w-2 h-2 bg-black rounded-full" />}
                                    </div>
                                    <input type="checkbox" checked={formData.usable} onChange={e => handleChange("usable", e.target.checked)} className="hidden" />
                                    <span className="text-zinc-300 font-medium">Usable</span>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.showInInventory ? "bg-blue-500 border-blue-500" : "border-zinc-600 group-hover:border-zinc-500"}`}>
                                        {formData.showInInventory && <div className="w-2 h-2 bg-black rounded-full" />}
                                    </div>
                                    <input type="checkbox" checked={formData.showInInventory} onChange={e => handleChange("showInInventory", e.target.checked)} className="hidden" />
                                    <span className="text-zinc-300 font-medium">Show in Inventory</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* REQUIREMENTS TAB */}
                    {activeTab === "reqs" && (
                        <div className="space-y-6">
                            <div>
                                <label className="label">Required Balance</label>
                                <input
                                    type="number"
                                    value={formData.requirements?.balance || 0}
                                    onChange={e => handleReqChange("balance", parseInt(e.target.value))}
                                    className="input-field"
                                />
                                <p className="text-xs text-zinc-500 mt-1">User must have this much money to buy (not deducted, just checked).</p>
                            </div>

                            <div>
                                <label className="label">Required Roles</label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 bg-black/20 rounded-lg border border-white/5">
                                    {roles.map(role => {
                                        const isSelected = formData.requirements?.roles?.includes(role.id);
                                        return (
                                            <button
                                                key={role.id}
                                                onClick={() => {
                                                    const current = formData.requirements?.roles || [];
                                                    handleReqChange("roles", isSelected ? current.filter((id: string) => id !== role.id) : [...current, role.id]);
                                                }}
                                                className={`px-3 py-2 text-xs font-bold rounded text-left truncate transition-all ${isSelected
                                                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                                                        : "text-zinc-400 hover:bg-white/5 border border-transparent"
                                                    }`}
                                            >
                                                {role.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ACTIONS TAB */}
                    {activeTab === "actions" && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-white font-bold">On Buy Actions</h3>
                                    <p className="text-zinc-500 text-xs">Events triggered when the user purchases this item.</p>
                                </div>
                                <button onClick={addAction} className="btn-secondary text-xs py-1.5 px-3">
                                    <Plus size={14} /> Add Action
                                </button>
                            </div>

                            <AnimatePresence>
                                {formData.onBuyActions?.map((action: any, idx: number) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="bg-white/5 rounded-lg border border-white/5 p-4 space-y-3 relative group"
                                    >
                                        <button
                                            onClick={() => removeAction(idx)}
                                            className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                        >
                                            <Trash2 size={14} />
                                        </button>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="col-span-1">
                                                <label className="label text-[10px]">Action Type</label>
                                                <select
                                                    value={action.type}
                                                    onChange={e => updateAction(idx, "type", e.target.value)}
                                                    className="input-field text-sm py-1.5"
                                                >
                                                    <option value="MSG">Send Message</option>
                                                    <option value="ADD_ROLE">Add Role</option>
                                                    <option value="REMOVE_ROLE">Remove Role</option>
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="label text-[10px]">Value</label>
                                                {action.type === "MSG" ? (
                                                    <input
                                                        type="text"
                                                        value={action.value}
                                                        onChange={e => updateAction(idx, "value", e.target.value)}
                                                        className="input-field text-sm py-1.5"
                                                        placeholder="Message content..."
                                                    />
                                                ) : (
                                                    <select
                                                        value={action.value}
                                                        onChange={e => updateAction(idx, "value", e.target.value)}
                                                        className="input-field text-sm py-1.5"
                                                    >
                                                        <option value="">Select Role...</option>
                                                        {roles.map(r => (
                                                            <option key={r.id} value={r.id}>{r.name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {(!formData.onBuyActions || formData.onBuyActions.length === 0) && (
                                <div className="text-center py-10 text-zinc-600 border border-dashed border-white/10 rounded-lg">
                                    No actions configured.
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-zinc-900/50 flex justify-between">
                    {item ? (
                        <button onClick={handleDelete} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={16} /> Delete Item
                        </button>
                    ) : <div></div>}

                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white font-bold text-sm">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-yellow-500 text-black px-6 py-2 rounded-lg font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Save size={16} />}
                            Save Item
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
