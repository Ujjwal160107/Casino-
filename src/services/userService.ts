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
        // Deserialize dates if necessary (JSON.parse makes dates strings)
        // For simple display this might be fine, but rigorous usage might need hydration
        return cached;
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
