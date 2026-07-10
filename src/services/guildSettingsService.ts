import prisma from "../utils/prisma";
import { redisService } from "./redisService";

const CACHE_TTL = 60;
const DEFAULT_PREFIX = "!";

export interface GuildSettings {
  guildId: string;
  prefix: string;
}

function getCacheKey(guildId: string) {
  return `guild_settings:${guildId}`;
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const key = getCacheKey(guildId);
  const cached = await redisService.get<GuildSettings>(key);

  if (cached) {
    return cached;
  }

  let config = await prisma.guildSettings.findUnique({
    where: { guildId },
    select: { guildId: true, prefix: true }
  });

  if (!config) {
    try {
      config = await prisma.guildSettings.create({
        data: { guildId, prefix: DEFAULT_PREFIX },
        select: { guildId: true, prefix: true }
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        config = await prisma.guildSettings.findUnique({
          where: { guildId },
          select: { guildId: true, prefix: true }
        });
      } else {
        throw error;
      }
    }
  }

  const settings = {
    guildId,
    prefix: config?.prefix || DEFAULT_PREFIX
  };

  await redisService.set(key, settings, CACHE_TTL);
  return settings;
}

export async function updateGuildSettings(guildId: string, data: Partial<Pick<GuildSettings, "prefix">>) {
  const prefix = data.prefix || DEFAULT_PREFIX;

  const updated = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, prefix },
    update: { prefix },
    select: { guildId: true, prefix: true }
  });

  const settings = {
    guildId: updated.guildId,
    prefix: updated.prefix || DEFAULT_PREFIX
  };

  await redisService.set(getCacheKey(guildId), settings, CACHE_TTL);
  return settings;
}
