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
    // 2. Fetch or Create DB (Upsert to avoid race conditions)
    const cfg = await prisma_1.default.guildConfig.upsert({
        where: { guildId },
        create: { guildId },
        update: {},
    });
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