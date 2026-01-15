"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGuildConfig = getGuildConfig;
exports.updateGuildConfig = updateGuildConfig;
const prisma_1 = __importDefault(require("../utils/prisma"));
const redisService_1 = require("./redisService");
const CACHE_TTL = 600; // 10 minutes
async function getGuildConfig(guildId) {
    const key = `guild_config:${guildId}`;
    // 1. Try Cache
    const cached = await redisService_1.redisService.get(key);
    if (cached) {
        return cached;
    }
    // 2. Fetch or Create DB (Manual Atomic Check)
    // This is more robust than upsert for high-concurrency MongoDB handling
    console.log(`[Config] Fetching config for ${guildId}`);
    let cfg = await prisma_1.default.guildConfig.findUnique({ where: { guildId } });
    if (!cfg) {
        try {
            cfg = await prisma_1.default.guildConfig.create({ data: { guildId } });
        }
        catch (error) {
            if (error.code === 'P2002') {
                // Race condition hit: someone else created it just now. Fetch it.
                cfg = await prisma_1.default.guildConfig.findUnique({ where: { guildId } });
            }
            else {
                throw error;
            }
        }
    }
    // Double check (should never happen unless DB is dying)
    if (!cfg)
        throw new Error("Failed to fetch or create guild config");
    // 3. Set Cache
    await redisService_1.redisService.set(key, cfg, CACHE_TTL);
    return cfg;
}
async function updateGuildConfig(guildId, data) {
    const updated = await prisma_1.default.guildConfig.update({ where: { guildId }, data });
    // Invalidate/Update Cache
    const key = `guild_config:${guildId}`;
    await redisService_1.redisService.set(key, updated, CACHE_TTL);
    return updated;
}
//# sourceMappingURL=guildConfigService.js.map