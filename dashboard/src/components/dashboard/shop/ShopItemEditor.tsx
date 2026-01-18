"use client";

import { useState, useEffect } from "react";
import { upsertShopItem, deleteShopItem } from "@/actions/shop-actions";
import { Save, Trash2, Plus, X, Crown, ChevronDown, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

interface ShopItemEditorProps {
    guildId: string;
    item?: any;
    roles: { id: string; name: string; color: number }[];
    onClose: () => void;
}

const EFFECT_TYPES = [
    { label: "Send Message", value: "CUSTOM_MESSAGE" },
    { label: "Add Role (Perm)", value: "ROLE_PERMANENT" },
    { label: "Add Role (Temp)", value: "ROLE_TEMPORARY" },
    { label: "Give Money", value: "MONEY" },
    { label: "XP Multiplier", value: "XP_MULTIPLIER" },
    { label: "Level Boost", value: "LEVEL_BOOST" },
    { label: "Stat Boost (Chicken)", value: "STAT_BOOST" },
    { label: "Stress Reduction", value: "STRESS_REDUCE" },
    { label: "Death Save", value: "DEATH_SAVE" },
    { label: "Exam Boost", value: "EXAM_BOOST" },
    { label: "Pay Multiplier", value: "PAY_MULTIPLIER" },
    { label: "Cooldown Reduction", value: "COOLDOWN_REDUCTION" },
];

export function ShopItemEditor({ guildId, item, roles, onClose }: ShopItemEditorProps) {
    const router = useRouter();
    const [formData, setFormData] = useState(item || {
        name: "",
        description: "",
        price: 0,
        stock: -1,
        image: "",
        expiresIn: null,
        usable: false,
        showInInventory: true,
        sellable: true,
        requirements: { roles: [], balance: 0 },
        // We will map 'effects' to this UI. 
        // Note: The backend schema has 'effects' (JSON) and 'onBuyActions' (JSON). 
        // 'effects' is used by effectService.ts. 'onBuyActions' is legacy or simple trigger.
        // We will write to 'effects' for all these functional items.
        effects: []
    });

    // Initial migration/shim if item has old 'onBuyActions' but no 'effects' and we want to edit them
    useEffect(() => {
        if (item?.onBuyActions?.length > 0 && (!item.effects || item.effects.length === 0)) {
            // Simple mapping for migration if needed, but strictly we are editing 'effects' now.
            // setFormData(prev => ({ ...prev, effects: item.onBuyActions.map(...) }))
        }
    }, [item]);

    const [isSaving, setIsSaving] = useState(false);
    const [updateInventory, setUpdateInventory] = useState(false);

    // Helpers
    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleReqChange = (field: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            requirements: { ...prev.requirements, [field]: value }
        }));
    };

    const addEffect = () => {
        setFormData((prev: any) => ({
            ...prev,
            effects: [...(prev.effects || []), { type: "CUSTOM_MESSAGE", message: "" }]
        }));
    };

    const updateEffect = (idx: number, field: string, value: any) => {
        const newEffects = [...(formData.effects || [])];
        newEffects[idx] = { ...newEffects[idx], [field]: value };
        setFormData((prev: any) => ({ ...prev, effects: newEffects }));
    };

    const removeEffect = (idx: number) => {
        setFormData((prev: any) => ({
            ...prev,
            effects: prev.effects.filter((_: any, i: number) => i !== idx)
        }));
    };

    const handleSave = async () => {
        if (!formData.name || formData.price < 0) {
            toast.error("Name and valid Price are required.");
            return;
        }

        setIsSaving(true);
        // Ensure legacy fields are synced or cleared if moving to effects system?
        // For safely, we send both if the backend logic relies on 'effects' for functional items.
        const payload = {
            ...formData,
            id: item?.id || "new",
            // If item has effects, it likely should be CONSUMABLE or ROLE type for logic to trigger?
            // The user didn't ask to change types explicitly, but 'effects' usually imply use/buy logic.
        };

        const res = await upsertShopItem(guildId, payload);
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
        if (!confirm("Delete this item? This cannot be undone.")) return;
        setIsSaving(true);
        const res = await deleteShopItem(item.id, guildId);
        setIsSaving(false);
        if (res.success) {
            toast.success("Item deleted.");
            router.refresh();
            onClose();
        } else {
            toast.error("Failed to delete.");
        }
    };

    const hasRoleReq = formData.requirements?.roles?.length > 0;
    const [showRoleReqUI, setShowRoleReqUI] = useState(hasRoleReq);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-[#313338] rounded-md w-full max-w-3xl overflow-hidden flex flex-col shadow-2xl relative"
            >
                {/* Content Area */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 max-h-[75vh]">
                    {/* NAME */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-400 uppercase">NAME</label>
                        <p className="text-xs text-zinc-500">Give this item a name (between 3 and 100 characters).</p>
                        <div className="bg-[#1e1f22] rounded-[4px] p-1">
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => handleChange("name", e.target.value)}
                                className="w-full bg-transparent border-none text-zinc-200 text-sm p-2.5 focus:outline-none placeholder:text-zinc-600 font-medium"
                                placeholder="My Cool Item"
                            />
                        </div>
                    </div>

                    {/* PRICE */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-400 uppercase">PRICE</label>
                        <p className="text-xs text-zinc-500">Set a price to purchase this item.</p>
                        <div className="bg-[#1e1f22] rounded-[4px] p-1">
                            <input
                                type="number"
                                value={formData.price}
                                onChange={e => handleChange("price", parseInt(e.target.value))}
                                className="w-full bg-transparent border-none text-zinc-200 text-sm p-2.5 focus:outline-none placeholder:text-zinc-600 font-medium font-mono"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    {/* DESCRIPTION */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-400 uppercase">DESCRIPTION</label>
                        <p className="text-xs text-zinc-500">Set a description to describe what this item is or does.</p>
                        <div className="bg-[#1e1f22] rounded-[4px] p-1 relative">
                            <textarea
                                value={formData.description}
                                onChange={e => handleChange("description", e.target.value)}
                                className="w-full bg-transparent border-none text-zinc-200 text-sm p-2.5 focus:outline-none placeholder:text-zinc-600 resize-none min-h-[120px]"
                                placeholder="Item description..."
                            />
                            <div className="absolute bottom-2 right-2 text-[10px] text-zinc-500 font-mono">
                                {formData.description.length}/1000
                            </div>
                        </div>
                    </div>

                    {/* ICON */}
                    <div className="grid grid-cols-[1fr_auto] gap-6 items-end">
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase">ICON</label>
                            <p className="text-xs text-zinc-500">Select a default emoji or paste a Discord emoji link.</p>
                            <div className="bg-[#1e1f22] rounded-[4px] p-1">
                                <input
                                    type="text"
                                    value={formData.image || ""}
                                    onChange={e => handleChange("image", e.target.value)}
                                    className="w-full bg-transparent border-none text-zinc-200 text-sm p-2.5 focus:outline-none placeholder:text-zinc-600"
                                    placeholder="https://cdn.discordapp.com/..."
                                />
                            </div>
                        </div>
                        <div className="space-y-2 flex flex-col items-center">
                            <label className="text-[11px] font-bold text-zinc-500 uppercase">PREVIEW</label>
                            <div className="w-[80px] h-[80px] bg-[#2b2d31] rounded-lg flex items-center justify-center border border-zinc-700/30">
                                {formData.image ? (
                                    <img src={formData.image} alt="" className="w-12 h-12 object-contain" />
                                ) : (
                                    <span className="text-4xl font-bold text-zinc-600">?</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-px bg-zinc-700/30 my-2"></div>

                    {/* TOGGLES ROW */}
                    <div className="space-y-4">
                        {/* STOCK */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">STOCK REMAINING</label>
                                <p className="text-xs text-zinc-500">Set the amount of stock available.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase">UNLIMITED</span>
                                <button
                                    onClick={() => handleChange("stock", formData.stock === -1 ? 0 : -1)}
                                    className={`w-11 h-6 rounded-full relative transition-colors ${formData.stock === -1 ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.stock === -1 ? "translate-x-5" : ""}`} />
                                </button>
                            </div>
                        </div>
                        {formData.stock !== -1 && (
                            <div className="bg-[#1e1f22] rounded-[4px] p-1 mt-2">
                                <input
                                    type="number"
                                    value={formData.stock}
                                    onChange={e => handleChange("stock", parseInt(e.target.value))}
                                    className="w-full bg-transparent border-none text-zinc-200 text-sm p-2.5 focus:outline-none placeholder:text-zinc-600 font-mono"
                                />
                            </div>
                        )}

                        {/* OTHER TOGGLES */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">INVENTORY ITEM</label>
                                <p className="text-xs text-zinc-500">Show in user's inventory.</p>
                            </div>
                            <button
                                onClick={() => handleChange("showInInventory", !formData.showInInventory)}
                                className={`w-11 h-6 rounded-full relative transition-colors ${formData.showInInventory ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.showInInventory ? "translate-x-5" : ""}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">USABLE</label>
                                <p className="text-xs text-zinc-500">Can be used via /use command.</p>
                            </div>
                            <button
                                onClick={() => handleChange("usable", !formData.usable)}
                                className={`w-11 h-6 rounded-full relative transition-colors ${formData.usable ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.usable ? "translate-x-5" : ""}`} />
                            </button>
                        </div>
                    </div>


                    {/* REQUIREMENTS BOX */}
                    <div className="mt-8">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">REQUIREMENTS [{Math.max(0, 2 - (formData.requirements?.roles?.length || 0))} REMAINING]</label>
                            </div>
                            <button
                                onClick={() => setShowRoleReqUI(true)}
                                disabled={formData.requirements?.roles?.length >= 2}
                                className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Add Requirement
                            </button>
                        </div>

                        <div className="bg-[#2b2d31] p-3 rounded-md border border-black/20 space-y-3">
                            {showRoleReqUI || formData.requirements?.roles?.length > 0 ? (
                                <div className="grid grid-cols-[150px_1fr] gap-4 items-start">
                                    {/* Requirement Type */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase">REQUIREMENT</label>
                                        <div className="relative bg-[#1e1f22] rounded p-2">
                                            <span className="text-zinc-200 text-xs text-left block w-full">Role</span>
                                        </div>
                                    </div>

                                    {/* Roles Selector */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase">ROLES</label>
                                        <div className="bg-[#1e1f22] rounded min-h-[36px] p-1 flex flex-wrap gap-1 relative group">
                                            <select
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        const current = formData.requirements?.roles || [];
                                                        if (current.length >= 2) {
                                                            toast.error("Max 2 role requirements allowed.");
                                                            return;
                                                        }
                                                        if (!current.includes(val)) handleReqChange("roles", [...current, val]);
                                                    }
                                                }}
                                                disabled={formData.requirements?.roles?.length >= 2}
                                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10 disabled:cursor-not-allowed"
                                            >
                                                <option value="">Add Role...</option>
                                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>

                                            {formData.requirements?.roles?.map((roleId: string) => {
                                                const role = roles.find(r => r.id === roleId);
                                                return role ? (
                                                    <span key={role.id} className="bg-[#2b2d31] text-zinc-300 text-[11px] px-2 py-0.5 rounded flex items-center gap-1 z-20 relative">
                                                        {role.name}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReqChange("roles", formData.requirements.roles.filter((id: string) => id !== roleId));
                                                            }}
                                                            className="hover:text-red-400 bg-black/20 rounded-full p-0.5"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </span>
                                                ) : null;
                                            })}
                                            {(!formData.requirements?.roles || formData.requirements.roles.length < 2) && (
                                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center ml-1">
                                                    <Plus size={14} className="text-zinc-500" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-xs text-zinc-600 italic">No active requirements. Click "Add Requirement" to configure.</div>
                            )}
                        </div>
                    </div>


                    {/* ACTIONS/EFFECTS BOX */}
                    <div className="mt-8">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">EFFECTS & ACTIONS [{Math.max(0, 5 - (formData.effects?.length || 0))} REMAINING]</label>
                            </div>
                            <button
                                onClick={() => {
                                    if ((formData.effects?.length || 0) >= 5) {
                                        toast.error("Max 5 effects allowed.");
                                        return;
                                    }
                                    addEffect();
                                }}
                                disabled={(formData.effects?.length || 0) >= 5}
                                className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Add Effect
                            </button>
                        </div>
                        <p className="text-xs text-zinc-500 mb-3">Effects are triggered when the item is Used (activatable items) or Bought (instant items).</p>

                        <div className="bg-[#2b2d31] p-3 rounded-md border border-black/20 space-y-3">
                            {formData.effects?.length > 0 ? (
                                <div className="space-y-4">
                                    {formData.effects.map((effect: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-[180px_1fr] gap-4 items-start relative pb-4 border-b border-black/10 last:border-0 last:pb-0">
                                            <button onClick={() => removeEffect(idx)} className="absolute -right-2 -top-2 text-zinc-600 hover:text-red-400">
                                                <X size={14} />
                                            </button>

                                            {/* Effect Type */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">EFFECT TYPE</label>
                                                <div className="relative bg-[#1e1f22] rounded p-2">
                                                    <select
                                                        value={effect.type}
                                                        onChange={e => updateEffect(idx, "type", e.target.value)}
                                                        className="w-full bg-[#1e1f22] text-zinc-200 text-xs appearance-none focus:outline-none"
                                                    >
                                                        {EFFECT_TYPES.map(t => (
                                                            <option key={t.value} value={t.value}>{t.label}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
                                                </div>
                                            </div>

                                            {/* Dynamic Inputs based on type */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">CONFIGURATION</label>
                                                <div className="bg-[#1e1f22] rounded p-2 space-y-2">

                                                    {/* ROLE SELECTOR */}
                                                    {(effect.type === "ROLE_PERMANENT" || effect.type === "ROLE_TEMPORARY") && (
                                                        <div className="relative">
                                                            <select
                                                                value={effect.roleId || ""}
                                                                onChange={e => updateEffect(idx, "roleId", e.target.value)}
                                                                className="w-full bg-[#1e1f22] text-zinc-200 text-xs p-1 focus:outline-none"
                                                            >
                                                                <option value="">Select Role...</option>
                                                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* DURATION INPUT */}
                                                    {["ROLE_TEMPORARY", "XP_MULTIPLIER", "DEATH_SAVE", "EXAM_BOOST", "PAY_MULTIPLIER", "COOLDOWN_REDUCTION"].includes(effect.type) && (
                                                        <input
                                                            type="number"
                                                            value={effect.duration || ""}
                                                            onChange={e => updateEffect(idx, "duration", parseInt(e.target.value))}
                                                            className="w-full bg-transparent text-zinc-300 text-xs p-1 focus:outline-none border-b border-zinc-700/50"
                                                            placeholder="Duration (seconds)"
                                                        />
                                                    )}

                                                    {/* MULTIPLIER / VALUE / AMOUNT */}
                                                    {["XP_MULTIPLIER", "PAY_MULTIPLIER", "LEVEL_BOOST", "MONEY", "STRESS_REDUCE", "EXAM_BOOST", "COOLDOWN_REDUCTION"].includes(effect.type) && (
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={effect.value || effect.amount || effect.multiplier || ""}
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value);
                                                                if (effect.type === "MONEY" || effect.type === "STRESS_REDUCE") updateEffect(idx, "amount", val);
                                                                else if (effect.type === "LEVEL_BOOST") updateEffect(idx, "levels", val);
                                                                else if (effect.type === "XP_MULTIPLIER") updateEffect(idx, "multiplier", val);
                                                                else updateEffect(idx, "value", val);
                                                            }}
                                                            className="w-full bg-transparent text-zinc-300 text-xs p-1 focus:outline-none border-b border-zinc-700/50"
                                                            placeholder="Amount / Multiplier"
                                                        />
                                                    )}

                                                    {/* STAT BOOST SPECIFIC */}
                                                    {effect.type === "STAT_BOOST" && (
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={effect.stat || ""}
                                                                onChange={e => updateEffect(idx, "stat", e.target.value)}
                                                                className="w-1/2 bg-transparent text-zinc-300 text-xs p-1 focus:outline-none border-b border-zinc-700/50"
                                                                placeholder="Stat Name (e.g. strength)"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={effect.amount || ""}
                                                                onChange={e => updateEffect(idx, "amount", parseInt(e.target.value))}
                                                                className="w-1/2 bg-transparent text-zinc-300 text-xs p-1 focus:outline-none border-b border-zinc-700/50"
                                                                placeholder="Amount"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* CUSTOM MESSAGE */}
                                                    {effect.type === "CUSTOM_MESSAGE" && (
                                                        <textarea
                                                            value={effect.message || ""}
                                                            onChange={e => updateEffect(idx, "message", e.target.value)}
                                                            className="w-full bg-transparent border-none text-zinc-200 text-xs p-1 focus:outline-none placeholder:text-zinc-600 resize-none min-h-[60px]"
                                                            placeholder="Message content..."
                                                        />
                                                    )}

                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-xs text-zinc-600 italic">No effects configured.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-[#1e1f22] px-6 py-4 flex justify-between items-center text-xs mt-auto border-t border-black/10">
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">UPDATE INVENTORY</span>
                        <button
                            onClick={() => setUpdateInventory(!updateInventory)}
                            className={`w-9 h-5 rounded-full relative transition-colors ${updateInventory ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                        >
                            <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${updateInventory ? "translate-x-4" : ""}`} />
                        </button>
                    </div>

                    <div className="flex gap-3 items-center">
                        {item && (
                            <button
                                onClick={handleDelete}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 p-2 rounded mr-2 transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                        <button onClick={onClose} className="hover:underline text-zinc-300 font-medium px-4">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-[#248046] hover:bg-[#1a6334] text-white px-6 py-2 rounded-[3px] font-medium transition-colors disabled:opacity-50 text-sm"
                        >
                            {isSaving ? "Saving..." : (item ? "Save" : "Create")}
                        </button>
                    </div>
                </div>

            </motion.div>
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #2b2d31; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1b1e; rounded: 4px; }
            `}</style>
        </div>
    );
}
