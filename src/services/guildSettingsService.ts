import prisma from "../utils/prisma";
import { redisService } from "./redisService";

const CACHE_TTL = 60;
const DEFAULT_PREFIX = "!";

export interface GuildSettings {
  guildId: string;
  prefix: string;
  /** Whether !rob is allowed here. Servers that never set it default to on, so
   *  adding this toggle changes nothing for anyone until they opt out. */
  robEnabled: boolean;
}

/** The fields a server admin can change. */
export type MutableGuildSettings = Partial<Pick<GuildSettings, "prefix" | "robEnabled">>;

// v2: the cached shape gained robEnabled. An entry written by the previous
// version would deserialise without it, and for the 60s until it expired the
// server would read `undefined` where a boolean is expected.
function getCacheKey(guildId: string) {
  return `guild_settings:v2:${guildId}`;
}

const SELECT = { guildId: true, prefix: true, robEnabled: true } as const;

/** Missing means enabled -- see the schema comment on robEnabled. */
function normalise(row: { guildId: string; prefix: string | null; robEnabled: boolean | null } | null, guildId: string): GuildSettings {
  return {
    guildId,
    prefix: row?.prefix || DEFAULT_PREFIX,
    robEnabled: row?.robEnabled ?? true,
  };
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const key = getCacheKey(guildId);
  const cached = await redisService.get<GuildSettings>(key);

  if (cached) {
    return cached;
  }

  let config = await prisma.guildSettings.findUnique({
    where: { guildId },
    select: SELECT,
  });

  if (!config) {
    try {
      config = await prisma.guildSettings.create({
        data: { guildId, prefix: DEFAULT_PREFIX },
        select: SELECT,
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        config = await prisma.guildSettings.findUnique({
          where: { guildId },
          select: SELECT,
        });
      } else {
        throw error;
      }
    }
  }

  const settings = normalise(config, guildId);
  await redisService.set(key, settings, CACHE_TTL);
  return settings;
}

export async function updateGuildSettings(guildId: string, data: MutableGuildSettings) {
  // Only the keys actually supplied are written, so updating the prefix cannot
  // silently reset the rob toggle (or the reverse).
  const patch: MutableGuildSettings = {};
  if (data.prefix !== undefined) patch.prefix = data.prefix || DEFAULT_PREFIX;
  if (data.robEnabled !== undefined) patch.robEnabled = data.robEnabled;

  const updated = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, prefix: patch.prefix ?? DEFAULT_PREFIX, robEnabled: patch.robEnabled },
    update: patch,
    select: SELECT,
  });

  const settings = normalise(updated, guildId);
  await redisService.set(getCacheKey(guildId), settings, CACHE_TTL);
  return settings;
}
