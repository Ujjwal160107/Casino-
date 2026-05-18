import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { User, Wallet, Degree, UserDegree, UserEducation } from "@prisma/client";
import { STARTING_WALLET_BALANCE } from "../utils/economyConfig";

// Define a type that includes commonly used relations
export type UserWithRelations = User & {
    wallet: Wallet | null;
    degrees: (UserDegree & { degree: Degree })[];
    currentEducation: (UserEducation & { degree: Degree }) | null;
};

const CACHE_TTL = 300; // 5 minutes

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

export async function getUser(discordId: string, _guildId: string): Promise<UserWithRelations | null> {
    const key = `user:${discordId}`;

    // 1. Try Cache
    const cached = await redisService.get<UserWithRelations>(key);
    if (cached) {
        return hydrateDates(cached);
    } // End of cache check

    // 2. Fetch from DB
    const user = await prisma.user.findUnique({
        where: { discordId },
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
export async function invalidateUserCache(discordId: string, _guildId: string) {
    const key = `user:${discordId}`;
    await redisService.del(key);
}

export async function createUser(discordId: string, _guildId: string, username: string) {
    return await prisma.user.create({
        data: {
            discordId,
            username,
            wallet: {
                create: {
                    balance: STARTING_WALLET_BALANCE
                }
            }
        },
        include: { wallet: true }
    });
}
