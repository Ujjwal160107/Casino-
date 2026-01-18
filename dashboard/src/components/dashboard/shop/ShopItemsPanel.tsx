"use client";

import { useState } from "react";
import { ShopItemEditor } from "@/components/dashboard/shop/ShopItemEditor";
import { Plus, Edit2, Package, Shield, Zap } from "lucide-react";
import { motion } from "framer-motion";

interface ShopItemsPanelProps {
    guildId: string;
    items: any[];
    roles: any[];
    currencyEmoji: string;
}

export function ShopItemsPanel({ guildId, items, roles, currencyEmoji }: ShopItemsPanelProps) {
    const [editingItem, setEditingItem] = useState<any>(null);
    const [isCreating, setIsCreating] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Package className="text-yellow-500" />
                        Manage Items
                    </h2>
                    <p className="text-sm text-zinc-400">Create, edit, and organize shop inventory.</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2"
                >
                    <Plus size={18} /> New Item
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-black/20 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all group relative overflow-hidden"
                    >
                        {item.image && (
                            <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none transform translate-x-8 -translate-y-8 rotate-12">
                                <img src={item.image} alt="" className="w-full h-full object-cover rounded-full" />
                            </div>
                        )}

                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${item.stock === 0 ? "bg-red-500" : "bg-green-500"}`} />
                                <h3 className="font-bold text-white text-lg font-serif">{item.name}</h3>
                            </div>
                            <button
                                onClick={() => setEditingItem(item)}
                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                        </div>

                        <p className="text-sm text-zinc-500 line-clamp-2 mb-4 h-10">{item.description}</p>

                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 mb-4">
                            <div className="flex items-center gap-1.5">
                                <span className="text-yellow-500 font-bold">{currencyEmoji} {item.price}</span>
                            </div>
                            <div className="flex items-center gap-1.5 justify-end">
                                <span>Stock: {item.stock === -1 ? "∞" : item.stock}</span>
                            </div>
                        </div>

                        <div className="flex gap-2 border-t border-white/5 pt-3">
                            {(item.requirements?.roles?.length > 0 || item.requirements?.balance > 0) && (
                                <div className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                                    <Shield size={10} /> Reqs
                                </div>
                            )}
                            {(item.onBuyActions?.length > 0) && (
                                <div className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                                    <Zap size={10} /> Actions
                                </div>
                            )}
                            {item.usable && (
                                <div className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                                    Use
                                </div>
                            )}
                        </div>

                    </motion.div>
                ))}

                {items.length === 0 && (
                    <div className="col-span-full border border-dashed border-white/10 rounded-xl p-12 text-center text-zinc-500">
                        <Package size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No items in shop yet.</p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="mt-4 text-yellow-500 hover:text-yellow-400 text-sm font-bold"
                        >
                            Create your first item
                        </button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {(editingItem || isCreating) && (
                <ShopItemEditor
                    guildId={guildId}
                    item={editingItem}
                    roles={roles}
                    onClose={() => {
                        setEditingItem(null);
                        setIsCreating(false);
                    }}
                />
            )}
        </div>
    );
}
