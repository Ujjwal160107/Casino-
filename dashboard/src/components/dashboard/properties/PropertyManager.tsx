"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Home, BarChart2, Clock, Users } from "lucide-react";
import { motion } from "framer-motion";
import { PropertyForm } from "./PropertyForm";
import { PropertyData, deleteProperty, upsertProperty } from "@/actions/property-actions";
import { useRouter } from "next/navigation";

interface PropertyManagerProps {
    guildId: string;
    initialProperties: PropertyData[];
}

export function PropertyManager({ guildId, initialProperties }: PropertyManagerProps) {
    const router = useRouter();
    const [properties, setProperties] = useState<PropertyData[]>(initialProperties);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<PropertyData | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreate = () => {
        setEditingProperty(null);
        setIsFormOpen(true);
    };

    const handleEdit = (property: PropertyData) => {
        setEditingProperty(property);
        setIsFormOpen(true);
    };

    const handleSubmit = async (data: PropertyData) => {
        setIsSubmitting(true);
        try {
            const result = await upsertProperty(guildId, data);
            if (result.success) {
                setIsFormOpen(false);
                router.refresh();
                // Optimistic update could go here, but router.refresh() handles sync
            } else {
                alert(result.error || "Failed to save property");
            }
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this property? This action cannot be undone.")) return;

        try {
            const result = await deleteProperty(guildId, id);
            if (result.success) {
                router.refresh();
            } else {
                alert(result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Failed to delete property");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center glass-card p-6 rounded-xl border border-white/5">
                <div>
                    <h2 className="text-xl font-bold text-white">Active Listings</h2>
                    <p className="text-sm text-zinc-400">Manage real estate available for purchase on the server.</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold hover:bg-yellow-400 transition-colors"
                >
                    <Plus size={18} />
                    Add Property
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map((property) => (
                    <motion.div
                        key={property.key}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group relative glass-card border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-colors"
                    >
                        {property.imageUrl && (
                            <div className="h-48 w-full bg-zinc-800 relative">
                                <img src={property.imageUrl} alt={property.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
                            </div>
                        )}
                        {!property.imageUrl && (
                            <div className="h-48 w-full bg-white/5 flex items-center justify-center relative">
                                <Home size={48} className="text-zinc-700" />
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
                            </div>
                        )}

                        <div className="p-5 relative -mt-12 md:-mt-16 z-10">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-lg font-bold text-white shadow-sm">{property.name}</h3>
                                {property.isPublic ? (
                                    <span className="bg-green-500/10 text-green-400 text-xs px-2 py-0.5 rounded border border-green-500/20">Public</span>
                                ) : (
                                    <span className="bg-zinc-500/10 text-zinc-400 text-xs px-2 py-0.5 rounded border border-zinc-500/20">Private</span>
                                )}
                            </div>

                            <p className="text-sm text-zinc-400 line-clamp-2 min-h-[2.5em] mb-4">{property.description}</p>

                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between py-2 border-t border-white/5">
                                    <span className="text-zinc-500 flex items-center gap-2">
                                        <Home size={14} /> Price
                                    </span>
                                    <span className="font-mono text-yellow-500">{property.basePrice.toLocaleString("en-US")}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-t border-white/5">
                                    <span className="text-zinc-500 flex items-center gap-2">
                                        <BarChart2 size={14} /> Income
                                    </span>
                                    <span className="font-mono text-green-400">+{property.incomePerCycle.toLocaleString("en-US")}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-t border-white/5">
                                    <span className="text-zinc-500 flex items-center gap-2">
                                        <Clock size={14} /> Cycle
                                    </span>
                                    <span className="text-white">{property.incomeCycleHours} Hours</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-t border-white/5">
                                    <span className="text-zinc-500 flex items-center gap-2">
                                        <Users size={14} /> Max/User
                                    </span>
                                    <span className="text-white">{property.maxPerUser}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => handleEdit(property)}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white/5 text-white py-2 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
                                >
                                    <Pencil size={14} /> Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(property.id!)}
                                    className="w-10 h-9 flex items-center justify-center bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ))}

                {properties.length === 0 && (
                    <div className="col-span-full py-12 text-center text-zinc-500 border-2 border-dashed border-white/5 rounded-xl">
                        <Home size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No properties found.</p>
                        <button onClick={handleCreate} className="text-yellow-500 hover:underline mt-2">Create your first property</button>
                    </div>
                )}
            </div>

            <PropertyForm
                isOpen={isFormOpen}
                initialData={editingProperty}
                onClose={() => setIsFormOpen(false)}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
