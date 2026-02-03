import { getRecentAuditLogs } from "@/actions/audit-actions";
import { ShieldAlert, Clock, User as UserIcon, Activity } from "lucide-react";

export async function OverviewLogs({ guildId }: { guildId: string }) {
    const logs = await getRecentAuditLogs(guildId);

    // Helper to format log details
    const formatLogDetails = (log: any) => {
        const { type, meta } = log;

        switch (type) {
            case "UPDATE_COMMAND_CONFIG":
                const changes = Object.keys(meta.changes || {}).join(", ");
                return (
                    <span>
                        Updated <span className="text-yellow-400 font-mono">{meta.commandKey}</span> config:
                        <span className="text-zinc-400 ml-1">{changes || "settings"}</span>
                    </span>
                );
            case "UPDATE_REWARD_AMOUNTS":
                return "Updated global currency reward amounts";
            case "UPDATE_ROLE_INCOMES":
                return `Updated role incomes (${meta.count} roles configured)`;
            case "UPDATE_ROB_SETTINGS":
                return `Updated robbery settings ${meta.enabled ? '(Enabled)' : '(Disabled)'}`;
            case "UPDATE_QUEST_SETTINGS":
                return "Updated daily quest reward settings";
            case "UPDATE_CASINO_DROPS":
                return `Updated casino drops configuration (${meta.count} drops)`;
            case "CREATE_SHOP_ITEM":
                return <span>Created shop item <span className="text-white font-bold">{meta.name}</span> for {meta.price} coins</span>;
            case "UPDATE_SHOP_ITEM":
                return <span>Updated shop item <span className="text-white font-bold">{meta.name}</span></span>;
            case "DELETE_SHOP_ITEM":
                return "Deleted a shop item";
            default:
                return type.replace(/_/g, " ").toLowerCase();
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full">
            <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold font-display text-white">Recent Admin Activity</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <div className="grid grid-cols-1 gap-3">
                {logs.length === 0 ? (
                    <div className="glass-card p-8 rounded-2xl flex flex-col items-center justify-center text-center opacity-70">
                        <Activity size={48} className="text-zinc-500 mb-4" />
                        <p className="text-zinc-400 font-medium">No recent admin activity recorded.</p>
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className="glass-card p-4 rounded-xl flex items-center justify-between group hover:bg-white/5 transition-colors border border-white/5"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                                    <ShieldAlert size={18} className="text-zinc-300" />
                                </div>
                                <div>
                                    <p className="text-white font-bold text-sm line-clamp-1">{formatLogDetails(log)}</p>
                                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                                        <UserIcon size={12} />
                                        <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-zinc-300">{log.userId || "System"}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono shrink-0 pl-4">
                                <Clock size={12} />
                                {new Date(log.createdAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
