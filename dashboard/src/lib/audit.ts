import { prisma } from "@/lib/prisma";

export async function createAuditLog(
    guildId: string,
    userId: string,
    type: string,
    meta?: any
) {
    try {
        await prisma.audit.create({
            data: {
                guildId,
                userId,
                type,
                meta: meta || {},
                createdAt: new Date(),
            },
        });
    } catch (error) {
        console.error("Failed to create audit log:", error);
    }
}
