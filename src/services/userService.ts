import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { User, Wallet, Degree, UserDegree, Job, UserEducation } from "@prisma/client";

// Define a type that includes commonly used relations
export type UserWithRelations = User & {
    wallet: Wallet | null;
    degrees: (UserDegree & { degree: Degree })[];
    currentEducation: (UserEducation & { degree: Degree }) | null;
};

const CACHE_TTL = 300; // 5 minutes

export async function getUser(userId: string, guildId: string): Promise<UserWithRelations | null> {
    const key = `user:${guildId}:${userId}`;

    // 1. Try Cache
    const cached = await redisService.get<UserWithRelations>(key);
    if (cached) {
        return hydrateDates(cached);
    } // End of cache check

    function hydrateDates(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map(v => hydrateDates(v));
        }

        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (typeof value === 'string') {
                // Heuristic: Key ends in At/Time/Date and looks like a valid date
                const isDateKey = key.endsWith('At') || key.endsWith('Time') || key.endsWith('Date');
                // Also check specifically for known fields if heuristic is risky, but for this app it's safely consistent.
                if (isDateKey && !isNaN(Date.parse(value))) {
                    obj[key] = new Date(value);
                }
            } else if (typeof value === 'object') {
                hydrateDates(value);
            }
        }
        return obj;
    }

    // 2. Fetch from DB
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: {
            wallet: true,
            degrees: { include: { degree: true } },
            currentEducation: { include: { degree: true } }
        }
    });

    if (user) {
        // 3. Set Cache
        await redisService.set(key, user, CACHE_TTL);
    }

    return user;
}

/**
 * Invalidate user cache. Call this after ANY update to user/wallet/inventory.
 */
export async function invalidateUserCache(userId: string, guildId: string) {
    const key = `user:${guildId}:${userId}`;
    await redisService.del(key);
}

export async function createUser(discordId: string, guildId: string, username: string) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const startMoney = config?.startMoney || 1000;

    return await prisma.user.create({
        data: {
            discordId,
            guildId,
            username,
            wallet: {
                create: {
                    balance: startMoney
                }
            }
        },
        include: { wallet: true }
    });
}
