import prisma from "../utils/prisma";
import { GuildConfig } from "@prisma/client";
import { redisService } from "./redisService";

const CACHE_TTL = 60; // 1 minute (Reduced for better sync)

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const key = `guild_config:${guildId}`;

  // 1. Try Cache
  const cached = await redisService.get<GuildConfig>(key);
  if (cached) {
    console.log(`[Config] 🟢 Cache HIT for ${guildId}. Prefix: "${cached.prefix}"`);
    return cached;
  }

  // 2. Fetch or Create DB
  console.log(`[Config] 🟡 Cache MISS for ${guildId}. Fetching from DB...`);

  let cfg = await prisma.guildConfig.findUnique({ where: { guildId } });

  if (!cfg) {
    try {
      cfg = await prisma.guildConfig.create({ data: { guildId } });
    } catch (error: any) {
      if (error.code === 'P2002') {
        cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
      } else {
        throw error;
      }
    }
  }

  // Double check
  if (!cfg) throw new Error("Failed to fetch or create guild config");

  console.log(`[Config] 🔵 DB Result for ${guildId}. Prefix: "${cfg.prefix}"`);

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