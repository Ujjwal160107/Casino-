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


                    {/* SEPARATOR */}
                    <div className="w-full h-px bg-zinc-700/30 my-6"></div>

                    {/* REQUIREMENTS BOX */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase">
                                REQUIREMENTS [{Math.max(0, 2 - ((formData.requirements?.roles?.length || 0) + (formData.requirements?.items?.length || 0) + (formData.requirements?.balance ? 1 : 0) + (formData.requirements?.netWorth ? 1 : 0)))} REMAINING]
                            </label>

                            <div className="relative">
                                <button
                                    disabled={((formData.requirements?.roles?.length || 0) + (formData.requirements?.items?.length || 0) + (formData.requirements?.balance ? 1 : 0) + (formData.requirements?.netWorth ? 1 : 0)) >= 2}
                                    className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                    <Plus size={14} /> Add Requirement
                                </button>
                                <select
                                    onChange={(e) => {
                                        const type = e.target.value;
                                        if (!type) return;
                                        e.target.value = ""; // Reset

                                        if (type === "BALANCE") {
                                            handleReqChange("balance", 100);
                                        } else if (type === "NETWORTH") {
                                            handleReqChange("netWorth", 1000);
                                        } else if (type === "ITEM") {
                                            handleReqChange("items", [...(formData.requirements?.items || []), ""]);
                                        } else if (type === "ROLE") {
                                            handleReqChange("roles", [...(formData.requirements?.roles || []), ""]);
                                        }
                                        // Role is handled via specific role selector usually, but here we trigger a mode? 
                                        // Actually easier to just have a "Add Role" entry that shows the role selector?
                                        // No, let's just use this dropdown to ADD a slot if needed, but for roles 
                                        // we usually pick the role directly. 
                                        // Let's make "ROLE" option just expand a role picker?
                                        // Simpler: If "ROLE" is picked, we don't add immediately. We just show a toast or nothing?
                                        // Better: The dropdown *is* the picker for types. 
                                        // For "ROLE", let's handle it by showing the role select in the list IF user chooses "ROLE"? 
                                        // No, that's complex.
                                        // Let's just add a null/placeholder for role? No.
                                        // Let's make the Add button open a small menu or formatted select?
                                        // Current approach: Select type.
                                        // If ROLE: We can't add a "blank" role easily without UI.
                                        // Let's skip ROLE here and handle it inside the renderer? 
                                        // No, the user wants to "ADD" 2 requirements.
                                        // Let's go with: Select Type -> adds default value.
                                        // For Role, we can't add default. 
                                        // Special case: If type is ROLE, we trigger a "mode" to show role selector?
                                        // Actually, let's just add a temporary "new_role" entry?
                                        // No, let's just use a separate "Add Role" mechanic or integrate it.
                                        // I'll make the role option open a native browser prompt? No.
                                        // I'll assume standard flow: The "Add Requirement" dropdown serves as the initiation.
                                        // If user picks ROLE, I will add generic "SELECT_ROLE" string to roles array? No, that breaks strict typing.
                                        // I will simply add a boolean `showRolePicker` to local state? Yes.
                                    }}
                                    disabled={((formData.requirements?.roles?.length || 0) + (formData.requirements?.items?.length || 0) + (formData.requirements?.balance ? 1 : 0) + (formData.requirements?.netWorth ? 1 : 0)) >= 2}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer bg-[#1e1f22] text-zinc-200"
                                >
                                    <option value="">Select Type...</option>
                                    <option value="ROLE">Role Requirement</option>
                                    <option value="ITEM">Item Requirement</option>
                                    <option value="BALANCE" disabled={!!formData.requirements?.balance}>Wallet Balance</option>
                                    <option value="NETWORTH" disabled={!!formData.requirements?.netWorth}>Net Worth</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-[#2b2d31] p-3 rounded-md border border-black/20 space-y-3">
                            <div className="space-y-3">
                                {/* ROLES */}
                                {formData.requirements?.roles?.map((roleId: string, idx: number) => (
                                    <div key={`req-role-${idx}`} className="grid grid-cols-[120px_1fr_auto] gap-4 items-center bg-[#1e1f22] p-2 rounded">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase">ROLE REQ</div>
                                        {roleId ? (
                                            <div className="text-sm text-zinc-300">
                                                {roles.find(r => r.id === roleId)?.name || "Unknown Role"}
                                            </div>
                                        ) : (
                                            <select
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        const newRoles = [...formData.requirements.roles];
                                                        newRoles[idx] = val;
                                                        handleReqChange("roles", newRoles);
                                                    }
                                                }}
                                                className="bg-[#1e1f22] text-sm text-zinc-200 focus:outline-none border border-white/10 rounded px-2 py-1"
                                            >
                                                <option value="">Select Role...</option>
                                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                        )}
                                        <button
                                            onClick={() => {
                                                const newRoles = formData.requirements.roles.filter((_: string, i: number) => i !== idx);
                                                handleReqChange("roles", newRoles);
                                            }}
                                            className="text-zinc-500 hover:text-red-400"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}

                                {/* ITEMS */}
                                {formData.requirements?.items?.map((item: string, idx: number) => (
                                    <div key={`req-item-${idx}`} className="grid grid-cols-[120px_1fr_auto] gap-4 items-center bg-[#1e1f22] p-2 rounded">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase">ITEM REQ</div>
                                        <input
                                            type="text"
                                            value={item}
                                            onChange={(e) => {
                                                const newItems = [...formData.requirements.items];
                                                newItems[idx] = e.target.value;
                                                handleReqChange("items", newItems);
                                            }}
                                            placeholder="Item Name (exact match)"
                                            className="bg-transparent text-sm text-zinc-200 focus:outline-none placeholder:text-zinc-600"
                                        />
                                        <button
                                            onClick={() => {
                                                const newItems = formData.requirements.items.filter((_: any, i: number) => i !== idx);
                                                handleReqChange("items", newItems);
                                            }}
                                            className="text-zinc-500 hover:text-red-400"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}

                                {/* BALANCE */}
                                {formData.requirements?.balance > 0 && (
                                    <div className="grid grid-cols-[120px_1fr_auto] gap-4 items-center bg-[#1e1f22] p-2 rounded">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase">MIN BALANCE</div>
                                        <input
                                            type="number"
                                            value={formData.requirements.balance}
                                            onChange={(e) => handleReqChange("balance", parseInt(e.target.value))}
                                            className="bg-transparent text-sm text-zinc-200 focus:outline-none placeholder:text-zinc-600"
                                        />
                                        <button
                                            onClick={() => handleReqChange("balance", 0)}
                                            className="text-zinc-500 hover:text-red-400"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}

                                {/* NET WORTH */}
                                {formData.requirements?.netWorth > 0 && (
                                    <div className="grid grid-cols-[120px_1fr_auto] gap-4 items-center bg-[#1e1f22] p-2 rounded">
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase">MIN NET WORTH</div>
                                        <input
                                            type="number"
                                            value={formData.requirements.netWorth}
                                            onChange={(e) => handleReqChange("netWorth", parseInt(e.target.value))}
                                            className="bg-transparent text-sm text-zinc-200 focus:outline-none placeholder:text-zinc-600"
                                        />
                                        <button
                                            onClick={() => handleReqChange("netWorth", 0)}
                                            className="text-zinc-500 hover:text-red-400"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}

                                {/* PENDING ROLE SELECTOR (Special Case) */}
                                {/* If we want to add a role but haven't selected it yet, we show this inline selector */}
                                {(!formData.requirements?.roles?.length || formData.requirements?.roles?.length < 2) && (
                                    <div className="hidden group-hover:block absolute">
                                        {/* This approach is hard. Let's just use the main dropdown value to trigger a modal or just specific select? */}
                                        {/* Alternative: The "Role Requirement" option in the main Select changes the Select ITSELF into a Role Select? No. */}
                                    </div>
                                )}
                            </div>

                            {/* SPECIAL ROLE ADDER IF TRIGGERED */}
                            {/* Hack: We put a hidden select over the main button for "ROLE" type? No, we used the main select. */}
                            {/* If user selected ROLE, we need to let them pick it. */}
                            {/* Let's render a temporary Role Picker at the bottom if we need to? */}
                            {/* Actually, let's just make the "Add Requirement" button purely for adding empty slots, and for Role, we interpret "ROLE" selection as "Show me a role picker". */}
                            {/* I will add a `showRolePicker` state to the component. */}
                        </div>
                    </div>

                    {/* Separator */}
                    <div className="w-full h-px bg-zinc-700/30 my-6"></div>

                    {/* DENY ROLES */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-400 uppercase">DENY ROLES (BLACKLIST)</label>
                        <p className="text-xs text-zinc-500">Users with these roles cannot buy this item.</p>

                        <div className="bg-[#2b2d31] p-3 rounded-md border border-black/20">
                            <div className="flex flex-wrap gap-2">
                                {formData.requirements?.denyRoles?.map((roleId: string) => {
                                    const role = roles.find(r => r.id === roleId);
                                    return role ? (
                                        <span key={role.id} className="bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] px-2 py-1 rounded flex items-center gap-2">
                                            {role.name}
                                            <button
                                                onClick={() => handleReqChange("denyRoles", formData.requirements.denyRoles.filter((id: string) => id !== roleId))}
                                                className="hover:text-red-100"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ) : null;
                                })}

                                <div className="relative">
                                    <button className="text-xs bg-[#1e1f22] text-zinc-400 px-2 py-1 rounded border border-white/5 hover:border-white/10 flex items-center gap-1">
                                        <Plus size={12} /> Add Role
                                    </button>
                                    <select
                                        onChange={(e) => {
                                            const roleId = e.target.value;
                                            if (roleId) {
                                                const current = formData.requirements?.denyRoles || [];
                                                if (!current.includes(roleId)) {
                                                    handleReqChange("denyRoles", [...current, roleId]);
                                                }
                                                e.target.value = "";
                                            }
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full bg-[#1e1f22] text-zinc-200"
                                    >
                                        <option value="">Select Role...</option>
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </div>
                            </div>
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
