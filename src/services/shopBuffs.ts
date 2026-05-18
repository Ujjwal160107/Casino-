import { redisService } from "./redisService";

export async function checkLuckyCoin(discordId: string): Promise<number> {
  const data = await redisService.get<{ active: boolean; multiplier: number }>(`lucky_coin:${discordId}`);
  if (data?.active) {
    await redisService.del(`lucky_coin:${discordId}`);
    return data.multiplier;
  }
  return 1;
}

export async function checkPadlock(discordId: string): Promise<boolean> {
  const data = await redisService.get<{ active: boolean }>(`padlock:${discordId}`);
  if (data?.active) {
    await redisService.del(`padlock:${discordId}`);
    return true;
  }
  return false;
}

export async function checkThiefGloves(discordId: string): Promise<number> {
  const data = await redisService.get<{ uses: number; multiplier: number }>(`thief_gloves:${discordId}`);
  if (!data || data.uses <= 0) return 1;

  const remaining = data.uses - 1;
  if (remaining <= 0) {
    await redisService.del(`thief_gloves:${discordId}`);
  } else {
    const ttl = await redisService.getInstance().ttl(`thief_gloves:${discordId}`);
    if (ttl > 0) {
      await redisService.set(`thief_gloves:${discordId}`, { uses: remaining, multiplier: data.multiplier }, ttl);
    }
  }

  return data.multiplier;
}

export async function checkCounterfeitKit(discordId: string): Promise<number> {
  const data = await redisService.get<{ active: boolean; multiplier: number }>(`counterfeit_kit:${discordId}`);
  if (data?.active) {
    await redisService.del(`counterfeit_kit:${discordId}`);
    return data.multiplier;
  }
  return 1;
}

export async function checkTaxShield(discordId: string): Promise<boolean> {
  const data = await redisService.get<{ active: boolean }>(`tax_shield:${discordId}`);
  return data?.active ?? false;
}
