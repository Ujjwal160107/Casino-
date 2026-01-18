"use client";

import { useState } from "react";
import { upsertShopItem, deleteShopItem } from "@/actions/shop-actions";
import { Save, Trash2, Plus, X, Crown, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

interface ShopItemEditorProps {
    guildId: string;
    item?: any;
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
        expiresIn: null,
        usable: false,
        showInInventory: true,
        sellable: true,
        requirements: { roles: [], balance: 0 },
        // Expanded structure for actions to include metadata (duration, etc)
        onBuyActions: []
    });
    // Dummy state for the footer toggle shown in screenshot
    const [updateInventory, setUpdateInventory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

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

    // Role Requirements Adapter (Visual only -> Logic)
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

                    {/* INVENTORY ITEM TOGGLE */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase">INVENTORY ITEM</label>
                            <p className="text-xs text-zinc-500">If item is placed into the users inventory when bought.</p>
                        </div>
                        <button
                            onClick={() => handleChange("showInInventory", !formData.showInInventory)}
                            className={`w-11 h-6 rounded-full relative transition-colors ${formData.showInInventory ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.showInInventory ? "translate-x-5" : ""}`} />
                        </button>
                    </div>

                    {/* USABLE TOGGLE */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase">USABLE</label>
                            <p className="text-xs text-zinc-500">If the item is able to be used or not (a collectable).</p>
                        </div>
                        <button
                            onClick={() => handleChange("usable", !formData.usable)}
                            className={`w-11 h-6 rounded-full relative transition-colors ${formData.usable ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.usable ? "translate-x-5" : ""}`} />
                        </button>
                    </div>

                    {/* SELLABLE TOGGLE */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase">SELLABLE</label>
                            <p className="text-xs text-zinc-500">If the item is able to be sold to other users.</p>
                        </div>
                        <button
                            onClick={() => handleChange("sellable", !formData.sellable)}
                            className={`w-11 h-6 rounded-full relative transition-colors ${formData.sellable !== false ? "bg-[#5865f2]" : "bg-[#80848e]"}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.sellable !== false ? "translate-x-5" : ""}`} />
                        </button>
                    </div>

                    {/* EXPIRY */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-400 uppercase">EXPIRY DATE</label>
                        <p className="text-xs text-zinc-500">Set a date & time if this item should be automatically deleted.</p>
                        <div className="bg-[#1e1f22] rounded-[4px] p-1">
                            <input
                                type="number"
                                value={formData.expiresIn || ""}
                                onChange={e => handleChange("expiresIn", e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full bg-transparent border-none text-zinc-200 text-sm p-2.5 focus:outline-none placeholder:text-zinc-600"
                                placeholder="Seconds (Example: 86400)"
                            />
                        </div>
                    </div>


                    {/* REQUIREMENTS BOX */}
                    <div className="mt-8">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">REQUIREMENTS [{showRoleReqUI ? "0" : "1"} REMAINING]</label>
                                {/* Premium Badge Removed as requested */}
                            </div>
                            <button
                                onClick={() => setShowRoleReqUI(true)}
                                className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
                            >
                                Add Requirement
                            </button>
                        </div>
                        <p className="text-xs text-zinc-500 mb-3">Requirements can be validated when members buy or use this item.</p>

                        <div className="bg-[#2b2d31] p-3 rounded-md border border-black/20 space-y-3">
                            {showRoleReqUI ? (
                                <div className="grid grid-cols-[150px_160px_1fr] gap-4 items-start">
                                    {/* Requirement Type */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase">REQUIREMENT</label>
                                        <div className="relative bg-[#1e1f22] rounded p-2">
                                            <span className="text-zinc-200 text-xs">Role</span>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                                        </div>
                                    </div>

                                    {/* Validate On */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase">VALIDATE ON</label>
                                        <div className="space-y-1 mt-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <div className="w-4 h-4 bg-[#5865f2] rounded flex items-center justify-center">
                                                    <Check size={12} className="text-white" />
                                                </div>
                                                <span className="text-zinc-300 text-xs">/item buy</span>
                                            </label>
                                            <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                                                <div className="w-4 h-4 border border-zinc-600 rounded"></div>
                                                <span className="text-zinc-500 text-xs">/item use</span>
                                            </label>
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
                                                        if (!current.includes(val)) handleReqChange("roles", [...current, val]);
                                                    }
                                                }}
                                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
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
                                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center ml-1">
                                                <Plus size={14} className="text-zinc-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-xs text-zinc-600 italic">No active requirements. Click "Add Requirement" to configure.</div>
                            )}
                        </div>
                    </div>


                    {/* ACTIONS BOX */}
                    <div className="mt-8">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase">ACTIONS [{5 - (formData.onBuyActions?.length || 0)} REMAINING]</label>
                                {/* Premium Badge Removed */}
                            </div>
                            <button
                                onClick={addAction}
                                className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
                            >
                                Add Action
                            </button>
                        </div>
                        <p className="text-xs text-zinc-500 mb-3">Actions can be triggered when members buy or use this item.</p>

                        <div className="bg-[#2b2d31] p-3 rounded-md border border-black/20 space-y-3">
                            {formData.onBuyActions?.length > 0 ? (
                                <div className="space-y-4">
                                    {formData.onBuyActions.map((action: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-[150px_160px_1fr] gap-4 items-start relative pb-4 border-b border-black/10 last:border-0 last:pb-0">
                                            <button onClick={() => removeAction(idx)} className="absolute -right-2 -top-2 text-zinc-600 hover:text-red-400">
                                                <X size={14} />
                                            </button>

                                            {/* Action Type */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">ACTION</label>
                                                <div className="relative bg-[#1e1f22] rounded p-2">
                                                    <select
                                                        value={action.type}
                                                        onChange={e => updateAction(idx, "type", e.target.value)}
                                                        className="w-full bg-transparent text-zinc-200 text-xs appearance-none focus:outline-none"
                                                    >
                                                        <option value="MSG">Send Message</option>
                                                        <option value="ADD_ROLE">Add Role</option>
                                                        <option value="REMOVE_ROLE">Remove Role</option>
                                                        <option value="ADD_TEMP_ROLE">Add Temp Role</option>
                                                        {/* Future features can be added here */}
                                                    </select>
                                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
                                                </div>
                                            </div>

                                            {/* Execute On */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">EXECUTE ON</label>
                                                <div className="space-y-1 mt-1">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <div className="w-4 h-4 bg-[#5865f2] rounded flex items-center justify-center">
                                                            <Check size={12} className="text-white" />
                                                        </div>
                                                        <span className="text-zinc-300 text-xs">/item buy</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                                                        <div className="w-4 h-4 border border-zinc-600 rounded"></div>
                                                        <span className="text-zinc-500 text-xs">/item use</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Value / Message / Role / Duration */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase">
                                                    {action.type === "MSG" ? "MESSAGE" : "ROLE"}
                                                </label>
                                                <div className="bg-[#1e1f22] rounded p-1 relative space-y-2">
                                                    {action.type === "MSG" ? (
                                                        <>
                                                            <textarea
                                                                value={action.value}
                                                                onChange={e => updateAction(idx, "value", e.target.value)}
                                                                className="w-full bg-transparent border-none text-zinc-200 text-xs p-2 focus:outline-none placeholder:text-zinc-600 resize-none min-h-[80px]"
                                                                placeholder="Enter message..."
                                                            />
                                                            <div className="absolute bottom-1 right-2 text-[10px] text-zinc-500 font-mono">
                                                                {action.value.length}/1000
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="relative">
                                                            <select
                                                                value={action.value}
                                                                onChange={e => updateAction(idx, "value", e.target.value)}
                                                                className="w-full bg-transparent text-zinc-200 text-xs p-2 appearance-none focus:outline-none"
                                                            >
                                                                <option value="">Select Role...</option>
                                                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                            </select>
                                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
                                                        </div>
                                                    )}

                                                    {/* TEMP ROLE DURATION INPUT */}
                                                    {action.type === "ADD_TEMP_ROLE" && (
                                                        <div className="border-t border-zinc-700/30 pt-1 mt-1">
                                                            <input
                                                                type="number"
                                                                value={action.duration || ""}
                                                                onChange={e => updateAction(idx, "duration", parseInt(e.target.value))}
                                                                className="w-full bg-transparent text-zinc-300 text-xs p-1 focus:outline-none"
                                                                placeholder="Duration in seconds (e.g. 3600)"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-xs text-zinc-600 italic">No actions configured.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-[#1e1f22] px-6 py-4 flex justify-between items-center text-xs mt-auto border-t border-black/10">
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">UPDATE INVENTORY ITEMS</span>
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
                                title="Delete Item"
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
