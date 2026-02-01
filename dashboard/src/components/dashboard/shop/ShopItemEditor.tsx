"use client";

import { useState, useEffect } from "react";
import { upsertShopItem, deleteShopItem } from "@/actions/shop-actions";
import { Save, Trash2, Plus, X, ChevronDown, Sparkles, ShieldAlert, ShoppingBag, Zap } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { DurationInput } from "@/components/dashboard/ui/DurationInput";

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
    { label: "Remove Role", value: "REMOVE_ROLE" },
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
        emoji: "",
        expiresIn: null,
        usable: false,
        showInInventory: true,
        sellable: true,
        requirements: { roles: [], balance: 0 },
        effects: []
    });

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
            effects: [...(prev.effects || []), { type: "CUSTOM_MESSAGE", message: "", trigger: "BUY" }]
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
        try {
            const effectsToSave = (formData.effects || []).map((e: any) => ({
                ...e,
                trigger: e.trigger || "BUY"
            }));

            const payload = {
                ...formData,
                id: item?.id || "new",
                price: parseFloat(formData.price),
                stock: parseInt(formData.stock),
                effects: effectsToSave
            };

            const res = await upsertShopItem(guildId, payload);
            if (res.success) {
                toast.success("Item saved!");
                router.refresh();
                onClose();
            } else {
                toast.error(res.error || "Failed to save.");
            }
        } catch (error) {
            console.error("Failed to save item:", error);
            toast.error("Failed to save item.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!item || !confirm("Delete this item? This cannot be undone.")) return;
        setIsSaving(true);
        const res = await deleteShopItem(item.id, guildId);
        setIsSaving(false);
        if (res.success) {
            toast.success("Item deleted.");
            router.refresh();
            onClose();
        } else {
            toast.error(res.error || "Failed to delete.");
        }
    };

    // Input Helper
    const handleNumberChange = (field: string, val: string) => {
        if (val === "") {
            setFormData((prev: any) => ({ ...prev, [field]: "" }));
            return;
        }
        const num = parseInt(val);
        if (!isNaN(num)) setFormData((prev: any) => ({ ...prev, [field]: num }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-5xl overflow-hidden flex flex-col shadow-2xl relative max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center bg-zinc-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2 font-serif tracking-wide">
                            {item ? "Edit Item" : "Create New Item"}
                            <span className="text-primary text-sm px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 font-sans">
                                {item ? "Update" : "Draft"}
                            </span>
                        </h2>
                        <p className="text-zinc-400 text-sm mt-1">Configure item details, requirements, and effects.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={24} className="text-zinc-400" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">

                    {/* TOP GRID: Core Info */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        {/* Left: Basic Info (8 cols) */}
                        <div className="md:col-span-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Item Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => handleChange("name", e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-medium placeholder:text-zinc-700"
                                        placeholder="Ex: VIP Pass"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Price</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                                        <input
                                            type="number"
                                            value={formData.price}
                                            onChange={e => handleNumberChange("price", e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono placeholder:text-zinc-700"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => handleChange("description", e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none min-h-[100px] placeholder:text-zinc-700"
                                    placeholder="Describe what this item does..."
                                />
                            </div>
                        </div>

                        {/* Right: Visuals & Stock (4 cols) */}
                        <div className="md:col-span-4 space-y-6">
                            <div className="glass-card p-5 rounded-xl space-y-4">
                                <div className="flex gap-4">
                                    <div className="space-y-2 flex-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase">Emoji</label>
                                        <input
                                            type="text"
                                            value={formData.emoji || ""}
                                            onChange={e => handleChange("emoji", e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-center text-xl focus:outline-none focus:border-primary/50 transition-all"
                                            placeholder="🎫"
                                            maxLength={4}
                                        />
                                    </div>
                                    <div className="space-y-2 flex-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase">Preview</label>
                                        <div className="h-[42px] bg-black/40 border border-white/10 rounded-lg flex items-center justify-center">
                                            {formData.image ? (
                                                <img src={formData.image} className="h-6 w-6 object-contain" />
                                            ) : (
                                                <span className="text-zinc-700 text-xs">No Img</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Image URL</label>
                                    <input
                                        type="text"
                                        value={formData.image || ""}
                                        onChange={e => handleChange("image", e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700 truncated"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            {/* Stock Control */}
                            <div className="glass-card p-4 rounded-xl flex items-center justify-between">
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase block">Stock</label>
                                    <span className="text-xs text-zinc-400">{formData.stock === -1 ? "Unlimited" : formData.stock}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleChange("stock", formData.stock === -1 ? 0 : -1)}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${formData.stock === -1 ? "bg-primary/20 text-primary border-primary/30" : "bg-zinc-800 text-zinc-500 border-white/5"}`}
                                    >
                                        ∞
                                    </button>
                                    {formData.stock !== -1 && (
                                        <input
                                            type="number"
                                            value={formData.stock}
                                            onChange={e => handleNumberChange("stock", e.target.value)}
                                            className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-primary/50"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                    {/* BOTTOM GRID: Requirements & Effects */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* REQUIREMENTS PANEL */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <ShieldAlert size={18} className="text-red-400" />
                                    Requirements
                                </h3>
                                <div className="relative group">
                                    <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-zinc-300 transition-all flex items-center gap-1">
                                        <Plus size={14} /> Add Scale
                                    </button>
                                    {/* Simple dropdown for types */}
                                    <select
                                        onChange={(e) => {
                                            const type = e.target.value;
                                            if (!type) return;
                                            e.target.value = "";
                                            if (type === "ROLE") handleReqChange("roles", [...(formData.requirements?.roles || []), ""]);
                                            if (type === "ITEM") handleReqChange("items", [...(formData.requirements?.items || []), ""]);
                                            if (type === "BALANCE") handleReqChange("balance", 100);
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    >
                                        <option value="">+ Add</option>
                                        <option value="ROLE">Role</option>
                                        <option value="ITEM">Item</option>
                                        <option value="BALANCE">Balance</option>
                                    </select>
                                </div>
                            </div>

                            <div className="glass-card p-1 min-h-[200px] rounded-xl flex flex-col gap-2">
                                {((formData.requirements?.roles?.length || 0) + (formData.requirements?.items?.length || 0) + (formData.requirements?.balance ? 1 : 0)) === 0 && (
                                    <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic">
                                        No requirements set. Everyone can buy.
                                    </div>
                                )}

                                {/* Roles Render */}
                                {formData.requirements?.roles?.map((roleId: string, idx: number) => (
                                    <div key={`param-role-${idx}`} className="bg-white/5 border border-white/5 p-3 rounded-lg flex items-center gap-3 group">
                                        <div className="bg-red-500/20 p-1.5 rounded text-red-400"><ShieldAlert size={14} /></div>
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase block">Required Role</label>
                                            {roleId && roles.find(r => r.id === roleId) ? (
                                                <div className="text-sm text-zinc-200">{roles.find(r => r.id === roleId)?.name}</div>
                                            ) : (
                                                <select
                                                    value={roleId}
                                                    onChange={e => {
                                                        const newRoles = [...formData.requirements.roles];
                                                        newRoles[idx] = e.target.value;
                                                        handleReqChange("roles", newRoles);
                                                    }}
                                                    className="w-full bg-transparent text-sm text-zinc-200 border-none outline-none py-1 cursor-pointer"
                                                >
                                                    <option value="" className="bg-black">Select Role...</option>
                                                    {roles.map(r => <option key={r.id} value={r.id} className="bg-black">{r.name}</option>)}
                                                </select>
                                            )}
                                        </div>
                                        <button onClick={() => {
                                            const newRoles = formData.requirements.roles.filter((_: any, i: number) => i !== idx);
                                            handleReqChange("roles", newRoles);
                                        }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-zinc-400 hover:text-red-400">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}

                                {/* Balance */}
                                {formData.requirements?.balance > 0 && (
                                    <div className="bg-white/5 border border-white/5 p-3 rounded-lg flex items-center gap-3 group">
                                        <div className="bg-emerald-500/20 p-1.5 rounded text-emerald-400"><Zap size={14} /></div>
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase block">Min Balance</label>
                                            <input
                                                type="number"
                                                value={formData.requirements.balance}
                                                onChange={e => handleReqChange("balance", parseInt(e.target.value))}
                                                className="bg-transparent text-sm text-zinc-200 focus:outline-none w-full font-mono"
                                            />
                                        </div>
                                        <button onClick={() => handleReqChange("balance", 0)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-zinc-400 hover:text-red-400">
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* EFFECTS PANEL */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Sparkles size={18} className="text-amber-400" />
                                    Effects & Rewards
                                </h3>
                                <button
                                    onClick={addEffect}
                                    disabled={(formData.effects?.length || 0) >= 5}
                                    className="text-xs bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 text-primary px-3 py-1.5 rounded-full transition-all flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Plus size={14} /> Add Effect
                                </button>
                            </div>

                            <div className="glass-card p-1 min-h-[200px] rounded-xl flex flex-col gap-2 relative">
                                {(!formData.effects || formData.effects.length === 0) && (
                                    <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic">
                                        No effects configured.
                                    </div>
                                )}

                                {formData.effects?.map((effect: any, idx: number) => (
                                    <div key={idx} className="bg-white/5 border border-white/5 rounded-lg overflow-hidden group">
                                        {/* Effect Header */}
                                        <div className="flex items-center gap-3 p-3 bg-black/20 border-b border-white/5">
                                            <div className="bg-amber-500/20 p-1 rounded text-amber-400">
                                                <Sparkles size={12} />
                                            </div>

                                            {/* Trigger Select */}
                                            <div className="relative">
                                                <select
                                                    value={effect.trigger}
                                                    onChange={e => updateEffect(idx, "trigger", e.target.value)}
                                                    className="appearance-none bg-transparent text-[10px] uppercase font-bold text-zinc-400 focus:text-white focus:outline-none cursor-pointer pr-4 hover:bg-white/5 rounded px-1"
                                                >
                                                    <option value="BUY" className="bg-zinc-900">On Purchase</option>
                                                    <option value="USE" className="bg-zinc-900">On Use</option>
                                                </select>
                                                <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                                            </div>

                                            <div className="h-4 w-px bg-white/10" />

                                            {/* Type Select */}
                                            <div className="relative flex-1">
                                                <select
                                                    value={effect.type}
                                                    onChange={e => updateEffect(idx, "type", e.target.value)}
                                                    className="appearance-none bg-transparent text-xs font-medium text-white focus:outline-none cursor-pointer w-full"
                                                >
                                                    {EFFECT_TYPES.map(t => <option key={t.value} value={t.value} className="bg-zinc-900">{t.label}</option>)}
                                                </select>
                                            </div>

                                            <button onClick={() => removeEffect(idx)} className="text-zinc-600 hover:text-red-400 transition-colors">
                                                <X size={14} />
                                            </button>
                                        </div>

                                        {/* Effect Configuration Content */}
                                        <div className="p-3 bg-black/10">
                                            {effect.type === "CUSTOM_MESSAGE" && (
                                                <input
                                                    type="text"
                                                    value={effect.message}
                                                    onChange={e => updateEffect(idx, "message", e.target.value)}
                                                    placeholder="Message to send..."
                                                    className="w-full bg-transparent border-b border-white/10 text-sm py-1 focus:outline-none focus:border-primary/50 text-zinc-300 placeholder:text-zinc-700"
                                                />
                                            )}

                                            {(effect.type.includes("ROLE")) && (
                                                <div className="grid grid-cols-[1fr_auto] gap-2">
                                                    <select
                                                        value={effect.roleId || ""}
                                                        onChange={e => updateEffect(idx, "roleId", e.target.value)}
                                                        className="bg-transparent border-b border-white/10 text-sm py-1 focus:outline-none text-zinc-300 w-full"
                                                    >
                                                        <option value="" className="bg-black">Select Role...</option>
                                                        {roles.map(r => <option key={r.id} value={r.id} className="bg-black">{r.name}</option>)}
                                                    </select>
                                                    {(effect.type === "ROLE_TEMPORARY") && (
                                                        <DurationInput
                                                            value={effect.duration || 0}
                                                            onChange={val => updateEffect(idx, "duration", val)}
                                                        />
                                                    )}
                                                </div>
                                            )}

                                            {["MONEY", "XP_MULTIPLIER", "PAY_MULTIPLIER"].includes(effect.type) && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-zinc-500 uppercase font-bold">Amount / Multi</span>
                                                    <input
                                                        type="number"
                                                        value={effect.value || effect.amount || effect.multiplier || ""}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value);
                                                            if (effect.type === "MONEY") updateEffect(idx, "amount", val);
                                                            if (effect.type.includes("MULTIPLIER")) updateEffect(idx, "multiplier", val);
                                                        }}
                                                        className="flex-1 bg-transparent border-b border-white/10 text-sm py-1 focus:outline-none text-zinc-300 font-mono"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer Controls */}
                <div className="px-8 py-5 border-t border-white/10 bg-zinc-900/80 flex justify-between items-center backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.showInInventory ? "bg-primary" : "bg-zinc-700"}`} onClick={() => handleChange("showInInventory", !formData.showInInventory)}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.showInInventory ? "translate-x-4" : ""}`} />
                            </div>
                            <span className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors uppercase">Show in Inventory</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.usable ? "bg-primary" : "bg-zinc-700"}`} onClick={() => handleChange("usable", !formData.usable)}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.usable ? "translate-x-4" : ""}`} />
                            </div>
                            <span className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors uppercase">Usable Item</span>
                        </label>
                    </div>

                    <div className="flex items-center gap-3">
                        {item && (
                            <button onClick={handleDelete} className="px-4 py-2 rounded-lg hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors">
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="px-6 py-2 rounded-lg hover:bg-white/5 text-zinc-300 transition-colors font-medium">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-primary hover:brightness-110 text-primary-foreground px-8 py-2.5 rounded-lg font-bold shadow-[0_0_20px_rgba(255,215,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving ? <span className="animate-spin">⏳</span> : <Save size={18} />}
                            {item ? "Update Item" : "Create Item"}
                        </button>
                    </div>
                </div>

            </motion.div>
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
            `}</style>
        </div>
    );
}
