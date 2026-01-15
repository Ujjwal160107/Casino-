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

  // 2. Fetch or Create DB (Manual Atomic Check)
  // This is more robust than upsert for high-concurrency MongoDB handling
  console.log(`[Config] Fetching config for ${guildId}`);

  let cfg = await prisma.guildConfig.findUnique({ where: { guildId } });

  if (!cfg) {
    try {
      cfg = await prisma.guildConfig.create({ data: { guildId } });
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Race condition hit: someone else created it just now. Fetch it.
        cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
      } else {
        throw error;
      }
    }
  }

  // Double check (should never happen unless DB is dying)
  if (!cfg) throw new Error("Failed to fetch or create guild config");

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