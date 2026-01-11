import prisma from "../utils/prisma"; import { GuildConfig } from "@prisma/client"; const configCache = new Map<string, GuildConfig>(); export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  // Disable cache for now to ensure dashboard updates are reflected immediately
  // if (configCache.has(guildId)) {
  //   return configCache.get(guildId)!;
  // }
  let cfg = await prisma.guildConfig.findUnique({ where: { guildId } }); if (!cfg) { cfg = await prisma.guildConfig.create({ data: { guildId } }); } configCache.set(guildId, cfg); return cfg;
} export async function updateGuildConfig(guildId: string, data: any) { const updated = await prisma.guildConfig.update({ where: { guildId }, data }); configCache.set(guildId, updated); return updated; }