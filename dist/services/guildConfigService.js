"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGuildConfig = getGuildConfig;
exports.updateGuildConfig = updateGuildConfig;
const prisma_1 = __importDefault(require("../utils/prisma"));
const configCache = new Map();
async function getGuildConfig(guildId) {
    // Disable cache for now to ensure dashboard updates are reflected immediately
    // if (configCache.has(guildId)) {
    //   return configCache.get(guildId)!;
    // }
    let cfg = await prisma_1.default.guildConfig.findUnique({ where: { guildId } });
    if (!cfg) {
        cfg = await prisma_1.default.guildConfig.create({ data: { guildId } });
    }
    configCache.set(guildId, cfg);
    return cfg;
}
async function updateGuildConfig(guildId, data) { const updated = await prisma_1.default.guildConfig.update({ where: { guildId }, data }); configCache.set(guildId, updated); return updated; }
//# sourceMappingURL=guildConfigService.js.map