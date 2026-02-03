"use server";

import { prisma } from "@/lib/prisma";

export async function getRecentAuditLogs(guildId: string, limit = 5) {
    try {
        const logs = await prisma.audit.findMany({
            where: { guildId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
        return logs;
    } catch (error) {
        console.error("Failed to fetch audit logs:", error);
        return [];
    }
}
