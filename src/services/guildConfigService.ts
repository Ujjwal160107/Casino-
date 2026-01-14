import prisma from "../utils/prisma";
import { GuildConfig } from "@prisma/client";
import { redisService } from "./redisService";

const CACHE_TTL = 600; // 10 minutes

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const key = `guild_config:${guildId}`;

  // 1. Try Cache
  const cached = await redisService.get<GuildConfig>(key);
  if (cached) {
    return cached;
  }

  // 2. Fetch DB
  let cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg) {
    cfg = await prisma.guildConfig.create({ data: { guildId } });
  }

  // 3. Set Cache
  await redisService.set(key, cfg, CACHE_TTL);

  return cfg;
}

export async function updateGuildConfig(guildId: string, data: any) {
  const updated = await prisma.guildConfig.update({ where: { guildId }, data });

  // Invalidate/Update Cache
  const key = `guild_config:${guildId}`;
  await redisService.set(key, updated, CACHE_TTL);

  return updated;
}