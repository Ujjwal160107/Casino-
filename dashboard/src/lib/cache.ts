import { redis } from "./redis";

/**
 * Invalidates the guild config cache for a specific guild.
 * This should be called whenever guild configuration is updated.
 */
export async function invalidateGuildConfig(guildId: string) {
    try {
        const key = `guild_config:${guildId}`;
        await redis.del(key);
        console.log(`[Cache] Invalidated guild config for ${guildId}`);
    } catch (error) {
        console.error(`[Cache] Failed to invalidate guild config for ${guildId}:`, error);
    }
}

/**
 * Invalidates the user cache for a specific user in a guild.
 * This should be called whenever user data (wallet, etc) is updated.
 */
export async function invalidateUser(guildId: string, userId: string) {
    try {
        const key = `user:${guildId}:${userId}`;
        await redis.del(key);
        console.log(`[Cache] Invalidated user cache for ${guildId}:${userId}`);
    } catch (error) {
        console.error(`[Cache] Failed to invalidate user cache for ${guildId}:${userId}:`, error);
    }
}
