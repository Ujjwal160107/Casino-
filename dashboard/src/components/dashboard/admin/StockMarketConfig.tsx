"use client";

import { useState } from "react";
import { createStock, updateStock, deleteStock, updateStockRefreshRate } from "@/actions/admin-actions";
import { Loader2, Plus, Trash2, Edit2, Save, X, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DurationInput } from "../ui/DurationInput";

interface Stock {
    id: string;
    symbol: string;
    name: string;
    currentPrice: number;
    volatility: number;
}

interface StockMarketConfigProps {
    guildId: string;
    stocks: Stock[];
    refreshRate: number;
}

export function StockMarketConfig({ guildId, stocks, refreshRate }: StockMarketConfigProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Forms
    const [rateInput, setRateInput] = useState(Math.floor(refreshRate / 60));
    const [addForm, setAddForm] = useState({ symbol: "", name: "", price: 100, vol: 5 });
    const [editForm, setEditForm] = useState({ price: 0, vol: 0 });

    const handleUpdateRate = async () => {
        setIsLoading(true);
        try {
            await updateStockRefreshRate(guildId, rateInput * 60);
            toast.success("Market refresh rate updated!");
            router.refresh();
        } catch {
            toast.error("Failed to update rate");
        }
        setIsLoading(false);
    };

    const handleAddStock = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await createStock(guildId, addForm.symbol, addForm.name, addForm.price, addForm.vol);
            toast.success("Stock created successfully!");
            setAddForm({ symbol: "", name: "", price: 100, vol: 5 });
            setIsAdding(false);
            router.refresh();
        } catch {
            toast.error("Failed to create stock");
        }
        setIsLoading(false);
    };

    const startEdit = (stock: Stock) => {
        setEditingId(stock.id);
        setEditForm({ price: stock.currentPrice, vol: stock.volatility });
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setIsLoading(true);
        try {
            await updateStock(guildId, editingId, editForm.price, editForm.vol);
            toast.success("Stock updated!");
            setEditingId(null);
            router.refresh();
        } catch {
            toast.error("Failed to update stock");
        }
        setIsLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        setIsLoading(true);
        try {
            await deleteStock(guildId, id);
            toast.success("Stock deleted");
            router.refresh();
        } catch {
            toast.error("Failed to delete stock");
        }
        setIsLoading(false);
    };

    return (
        <div className="space-y-8">
            {/* Refresh Rate Config */}
            <div className="glass-card border border-white/5 rounded-xl p-6 flex items-end gap-4">
                <div className="flex-1 space-y-2">
                    <DurationInput
                        value={rateInput * 60} // Convert mins to seconds for display
                        onChange={(secs) => setRateInput(Math.floor(secs / 60))}
                        label="Market Refresh Rate"
                    />
                </div>
                <button
                    onClick={handleUpdateRate}
                    disabled={isLoading}
                    className="bg-yellow-500 text-black px-6 py-2 rounded-lg hover:bg-yellow-400 h-[42px] font-bold transition-colors disabled:opacity-50"
                >
                    Update Rate
                </button>
            </div>

            {/* Stocks List Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
                    <TrendingUp className="text-green-500" /> Market Listings
                </h3>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold hover:bg-yellow-400"
                >
                    <Plus size={18} /> Add Stock
                </button>
            </div>

            {/* Add Stock Form */}
            {isAdding && (
                <form onSubmit={handleAddStock} className="bg-white/5 p-6 rounded-xl border border-green-500/30 animate-in slide-in-from-top-2">
                    <h4 className="font-bold font-display text-white mb-4">New Listing</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <input
                            placeholder="Symbol (BTC)"
                            value={addForm.symbol}
                            onChange={e => setAddForm({ ...addForm, symbol: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                            required maxLength={5}
                        />
                        <input
                            placeholder="Name (Bitcoin)"
                            value={addForm.name}
                            onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                            required
                        />
                        <input
                            type="number"
                            placeholder="Price"
                            value={addForm.price === 0 ? "" : addForm.price}
                            onChange={e => setAddForm({ ...addForm, price: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                            className="bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                            required
                        />
                        <input
                            type="number"
                            placeholder="Volatility %"
                            value={addForm.vol === 0 ? "" : addForm.vol}
                            onChange={e => setAddForm({ ...addForm, vol: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                            className="bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-zinc-400">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-6 py-2 bg-green-500 text-black rounded font-bold">Create</button>
                    </div>
                </form>
            )}

            {/* Stocks Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {stocks.map(stock => (
                    <div key={stock.id} className="glass-card border border-white/5 rounded-xl p-4 flex justify-between items-center">
                        {editingId === stock.id ? (
                            <div className="flex-1 flex gap-2 items-center">
                                <div className="space-y-1">
                                    <div className="text-xs text-zinc-500">Price</div>
                                    <input
                                        type="number"
                                        value={editForm.price === 0 ? "" : editForm.price}
                                        onChange={e => setEditForm({ ...editForm, price: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs text-zinc-500">Vol %</div>
                                    <input
                                        type="number"
                                        value={editForm.vol === 0 ? "" : editForm.vol}
                                        onChange={e => setEditForm({ ...editForm, vol: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white"
                                    />
                                </div>
                                <button onClick={saveEdit} className="p-2 bg-yellow-500 text-black rounded hover:bg-yellow-400"><Save size={16} /></button>
                                <button onClick={() => setEditingId(null)} className="p-2 bg-zinc-800 text-zinc-400 rounded"><X size={16} /></button>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white text-lg">{stock.symbol}</span>
                                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{stock.name}</span>
                                </div>
                                <div className="flex gap-4 mt-2 text-sm text-zinc-400 font-mono">
                                    <span>${stock.currentPrice}</span>
                                    <span className={stock.volatility > 10 ? "text-red-400" : "text-green-400"}>
                                        Vol: {stock.volatility}%
                                    </span>
                                </div>
                            </div>
                        )}

                        {editingId !== stock.id && (
                            <div className="flex gap-2">
                                <button onClick={() => startEdit(stock)} className="p-2 text-zinc-500 hover:text-white"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(stock.id)} className="p-2 text-zinc-500 hover:text-red-500"><Trash2 size={16} /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div >
    );
}
