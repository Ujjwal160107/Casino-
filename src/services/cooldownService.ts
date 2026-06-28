import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { isTester } from "../utils/developerAccess";

type CooldownResult = {
  active: boolean;
  key: string;
  expiresAt?: Date;
  remainingSeconds: number;
};

export function getCooldownKey(discordId: string, commandName: string) {
  return `${discordId}_${commandName}`;
}

export function formatDiscordRelativeTime(expiresAt: Date) {
  return `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`;
}

export async function checkCooldown(discordId: string, commandName: string): Promise<CooldownResult> {
  const key = getCooldownKey(discordId, commandName);
  if (isTester(discordId)) return { active: false, key, remainingSeconds: 0 };

  try {
    const ttl = await redisService.getInstance().ttl(key);
    if (ttl > 0) {
      return {
        active: true,
        key,
        expiresAt: new Date(Date.now() + ttl * 1000),
        remainingSeconds: ttl
      };
    }
    if (ttl === -1) {
      await redisService.getInstance().del(key);
    }
    return { active: false, key, remainingSeconds: 0 };
  } catch (error) {
    console.error(`Redis cooldown check failed for ${key}; falling back to Prisma.`, error);
  }

  const now = new Date();
  await prisma.activeEffect.deleteMany({
    where: {
      userId: discordId,
      effectType: `cooldown:${commandName}`,
      expiresAt: { lte: now }
    }
  });

  const cooldown = await prisma.activeEffect.findFirst({
    where: {
      userId: discordId,
      effectType: `cooldown:${commandName}`,
      expiresAt: { gt: now }
    },
    orderBy: { expiresAt: "desc" }
  });

  if (!cooldown?.expiresAt) {
    return { active: false, key, remainingSeconds: 0 };
  }

  return {
    active: true,
    key,
    expiresAt: cooldown.expiresAt,
    remainingSeconds: Math.max(0, Math.ceil((cooldown.expiresAt.getTime() - Date.now()) / 1000))
  };
}

export async function setCooldown(discordId: string, commandName: string, cooldownSeconds: number): Promise<CooldownResult> {
  const key = getCooldownKey(discordId, commandName);
  const expiresAt = new Date(Date.now() + cooldownSeconds * 1000);
  if (isTester(discordId)) return { active: false, key, expiresAt: new Date(), remainingSeconds: 0 };

  try {
    const result = await redisService.getInstance().set(key, expiresAt.toISOString(), "EX", cooldownSeconds, "NX");
    if (result === "OK") {
      return { active: false, key, expiresAt, remainingSeconds: cooldownSeconds };
    }

    const ttl = await redisService.getInstance().ttl(key);
    const activeExpiresAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);
    return {
      active: true,
      key,
      expiresAt: activeExpiresAt,
      remainingSeconds: Math.max(ttl, 0)
    };
  } catch (error) {
    console.error(`Redis cooldown set failed for ${key}; falling back to Prisma.`, error);
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.activeEffect.deleteMany({
      where: {
        userId: discordId,
        effectType: `cooldown:${commandName}`,
        expiresAt: { lte: now }
      }
    });

    const existing = await tx.activeEffect.findFirst({
      where: {
        userId: discordId,
        effectType: `cooldown:${commandName}`,
        expiresAt: { gt: now }
      },
      orderBy: { expiresAt: "desc" }
    });

    if (existing?.expiresAt) {
      return {
        active: true,
        key,
        expiresAt: existing.expiresAt,
        remainingSeconds: Math.max(0, Math.ceil((existing.expiresAt.getTime() - Date.now()) / 1000))
      };
    }

    await tx.activeEffect.create({
      data: {
        userId: discordId,
        effectType: `cooldown:${commandName}`,
        value: cooldownSeconds,
        meta: { key, commandName },
        expiresAt
      }
    });

    return { active: false, key, expiresAt, remainingSeconds: cooldownSeconds };
  });
}
