"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = getUser;
exports.invalidateUserCache = invalidateUserCache;
const prisma_1 = __importDefault(require("../utils/prisma"));
const redisService_1 = require("./redisService");
const CACHE_TTL = 300; // 5 minutes
async function getUser(userId, guildId) {
    const key = `user:${guildId}:${userId}`;
    // 1. Try Cache
    const cached = await redisService_1.redisService.get(key);
    if (cached) {
        return hydrateDates(cached);
    } // End of cache check
    function hydrateDates(obj) {
        if (obj === null || obj === undefined)
            return obj;
        if (typeof obj !== 'object')
            return obj;
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
            }
            else if (typeof value === 'object') {
                hydrateDates(value);
            }
        }
        return obj;
    }
    // 2. Fetch from DB
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: {
            wallet: true,
            degrees: { include: { degree: true } },
            currentEducation: { include: { degree: true } }
        }
    });
    if (user) {
        // 3. Set Cache
        await redisService_1.redisService.set(key, user, CACHE_TTL);
    }
    return user;
}
/**
 * Invalidate user cache. Call this after ANY update to user/wallet/inventory.
 */
async function invalidateUserCache(userId, guildId) {
    const key = `user:${guildId}:${userId}`;
    await redisService_1.redisService.del(key);
}
//# sourceMappingURL=userService.js.map