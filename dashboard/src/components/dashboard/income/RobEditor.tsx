"use client";

import { useState } from "react";
import { updateRobSettings } from "@/actions/income-actions";
import { Loader2, Save, Shield, Plus, X, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { DurationInput } from "../ui/DurationInput";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "../../ui/Switch";

interface Role {
    id: string;
    name: string;
    color: number;
}

interface RobConfig {
    robSuccessPct: number;
    robFinePct: number;
    robCooldown: number;
    robImmuneRoles: string[];
    jailTime?: number;
    jailFine?: number;
    enabled?: boolean;
}

interface RobEditorProps {
    guildId: string;
    initialData: RobConfig;
    availableRoles: Role[];
}

export function RobEditor({ guildId, initialData, availableRoles }: RobEditorProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState(initialData);
    const [searchRole, setSearchRole] = useState("");

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await updateRobSettings(guildId, formData);
            if (result.success) {
                toast.success("Rob settings updated successfully!");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to update settings.");
            }
        } catch (error) {
            toast.error("Failed to update settings.");
        }
        setIsLoading(false);
    };

    const toggleRole = (roleId: string) => {
        if (formData.enabled === false) return;
        setFormData(prev => {
            const exists = prev.robImmuneRoles.includes(roleId);
            if (exists) {
                return { ...prev, robImmuneRoles: prev.robImmuneRoles.filter(id => id !== roleId) };
            } else {
                return { ...prev, robImmuneRoles: [...prev.robImmuneRoles, roleId] };
            }
        });
        setSearchRole("");
    };

    const handleManualAdd = () => {
        if (!searchRole) return;
        // Basic validation for snowflake ID roughly
        if (/^\d{17,20}$/.test(searchRole)) {
            toggleRole(searchRole);
            toast.success(`Allocated ID ${searchRole} as immune.`);
        } else {
            toast.error("Invalid Role ID format.");
        }
    };

    const handleToggle = (checked: boolean) => {
        setFormData({ ...formData, enabled: checked });
    };

    // Filter roles for dropdown
    const filteredRoles = availableRoles.filter(r =>
        r.name.toLowerCase().includes(searchRole.toLowerCase()) &&
        !formData.robImmuneRoles.includes(r.id)
    ).slice(0, 10); // Limit to 10 suggestions

    return (
        <div className={`glass-card border border-white/5 rounded-xl p-6 relative transition-opacity ${formData.enabled === false ? 'opacity-70' : ''}`}>
            {!formData.enabled && (
                <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center pointer-events-none">
                    <span className="bg-black/80 px-4 py-2 rounded text-red-400 font-bold uppercase tracking-widest border border-red-500/20 transform -rotate-12">
                        Robbery Disabled
                    </span>
                </div>
            )}

            <div className="flex items-start justify-between mb-6 relative z-20 pointer-events-auto">
                <div>
                    <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider flex items-center gap-2">
                        <Shield size={18} className="text-blue-400" />
                        Robbery Settings
                    </h3>
                    <p className="text-sm text-zinc-400">Configure robbery mechanics and immunity.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 uppercase">
                        {formData.enabled !== false ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                        checked={formData.enabled !== false}
                        onCheckedChange={handleToggle}
                    />
                </div>
            </div>

            {/* Config Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="space-y-2">
                    <label className="text-xs text-white font-bold uppercase tracking-wider">Success Rate %</label>
                    <input
                        type="number"
                        min={1} max={100}
                        value={formData.robSuccessPct === 0 ? "" : formData.robSuccessPct}
                        onChange={(e) => setFormData({ ...formData, robSuccessPct: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        disabled={formData.enabled === false}
                    />
                    <p className="text-[10px] text-zinc-400">Base chance to successfully rob someone.</p>
                </div>
                <div className="space-y-2">
                    <label className="text-xs text-white font-bold uppercase tracking-wider">Fine Penalty %</label>
                    <input
                        type="number"
                        min={0} max={100}
                        value={formData.robFinePct === 0 ? "" : formData.robFinePct}
                        onChange={(e) => setFormData({ ...formData, robFinePct: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        disabled={formData.enabled === false}
                    />
                    <p className="text-[10px] text-zinc-400">Percent of wallet lost if caught.</p>
                </div>
                <div className="space-y-2">
                    <DurationInput
                        value={formData.robCooldown}
                        onChange={(val) => setFormData({ ...formData, robCooldown: val })}
                        label="Robbery Cooldown"
                        disabled={formData.enabled === false}
                    />
                </div>
            </div>

            {/* Jail Consequences */}
            <div className="mb-6 border-t border-white/5 pt-4">
                <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Shield size={14} /> Jail Consequences
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-white font-bold uppercase tracking-wider">Bail Amount (Fine)</label>
                        <input
                            type="number"
                            min={0}
                            value={formData.jailFine === 0 ? "" : formData.jailFine}
                            onChange={(e) => setFormData({ ...formData, jailFine: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                            className="w-full bg-white/5 border border-white/10 rounded px-4 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                            placeholder="1000"
                            disabled={formData.enabled === false}
                        />
                        <p className="text-[10px] text-zinc-400">Cost to bail out instantly.</p>
                    </div>
                    <div className="space-y-1">
                        <DurationInput
                            value={formData.jailTime || 0}
                            onChange={(val) => setFormData({ ...formData, jailTime: val })}
                            label="Jail Time"
                            disabled={formData.enabled === false}
                        />
                        <p className="text-[10px] text-zinc-400">Time spent in jail.</p>
                    </div>
                </div>
            </div>

            <hr className="border-white/5 my-6" />

            {/* Immune Roles Section */}
            <div className="space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Immune Roles</h4>
                <p className="text-xs text-zinc-200 -mt-2">Users with these roles cannot be robbed.</p>

                {/* Role Input / Dropdown */}
                <div className="relative max-w-md">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-3 text-zinc-500" />
                            <input
                                type="text"
                                value={searchRole}
                                onChange={(e) => setSearchRole(e.target.value)}
                                placeholder="Search role or paste ID..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                                disabled={formData.enabled === false}
                            />
                        </div>
                        <button
                            onClick={handleManualAdd}
                            disabled={!searchRole || formData.enabled === false}
                            className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 disabled:opacity-50"
                            title="Add ID"
                        >
                            <Plus size={18} />
                        </button>
                    </div>

                    {/* Results Dropdown */}
                    {searchRole && filteredRoles.length > 0 && formData.enabled !== false && (
                        <div className="absolute top-full left-0 right-0 mt-2 glass-card border border-white/10 rounded-lg shadow-xl overflow-hidden z-20">
                            {filteredRoles.map(role => (
                                <button
                                    key={role.id}
                                    onClick={() => toggleRole(role.id)}
                                    className="w-full text-left px-4 py-2 hover:bg-white/5 text-sm text-zinc-300 flex items-center gap-2"
                                >
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: role.color ? `#${role.color.toString(16)}` : '#99aab5' }}
                                    />
                                    {role.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Roles Tags */}
                <div className="flex flex-wrap gap-2 mt-4">
                    <AnimatePresence>
                        {formData.robImmuneRoles.map(roleId => {
                            const role = availableRoles.find(r => r.id === roleId);
                            return (
                                <motion.div
                                    key={roleId}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-full pl-3 pr-1 py-1 text-xs text-zinc-300"
                                >
                                    {role ? (
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: role.color ? `#${role.color.toString(16)}` : '#99aab5' }}
                                        />
                                    ) : (
                                        <div className="w-2 h-2 rounded-full bg-zinc-500" />
                                    )}
                                    <span className="font-medium">{role ? role.name : roleId}</span>
                                    <button
                                        onClick={() => toggleRole(roleId)}
                                        className="p-1 hover:bg-white/10 rounded-full text-zinc-500 hover:text-red-400 transition-colors"
                                        disabled={formData.enabled === false}
                                    >
                                        <X size={12} />
                                    </button>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                    {formData.robImmuneRoles.length === 0 && (
                        <span className="text-zinc-400 text-xs italic py-2">No immune roles configured.</span>
                    )}
                </div>
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-white/5 relative z-20 pointer-events-auto">
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Save RobSettings
                </button>
            </div>
        </div>
    );
}
