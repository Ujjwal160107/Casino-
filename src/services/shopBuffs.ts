import { redisService } from "./redisService";
import prisma from "../utils/prisma";

// ---------------------------------------------------------------------------
// Existing checkers (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Crown of Greed — Redis 1hr, does NOT consume on check
// ---------------------------------------------------------------------------

export async function checkCrownOfGreed(discordId: string): Promise<number> {
  const data = await redisService.get<{ multiplier: number }>(`crown_of_greed:${discordId}`);
  return data?.multiplier ?? 1;
}

// ---------------------------------------------------------------------------
// Devil Contract — ActiveEffect-backed, decrements usesLeft on check
// ---------------------------------------------------------------------------

export async function checkDevilContract(discordId: string): Promise<number> {
  const effect = await prisma.activeEffect.findFirst({
    where: {
      userId: discordId,
      effectType: "devil_contract_debt",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (!effect) return 1;

  const meta = effect.meta as { usesLeft: number } | null;
  const usesLeft = meta?.usesLeft ?? 0;
  if (usesLeft <= 0) {
    await prisma.activeEffect.delete({ where: { id: effect.id } });
    return 1;
  }

  if (usesLeft <= 1) {
    await prisma.activeEffect.delete({ where: { id: effect.id } });
  } else {
    await prisma.activeEffect.update({
      where: { id: effect.id },
      data: { meta: { usesLeft: usesLeft - 1 } },
    });
  }

  return effect.value; // 0.8
}

// ---------------------------------------------------------------------------
// Eclipse Mask — Redis 6hr, consumed on check
// ---------------------------------------------------------------------------

export async function checkEclipseMask(discordId: string): Promise<boolean> {
  const data = await redisService.get<{ active: boolean }>(`eclipse_mask:${discordId}`);
  if (data?.active) {
    await redisService.del(`eclipse_mask:${discordId}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Demonic Vulnerability — Redis 6hr, NOT consumed on check
// ---------------------------------------------------------------------------

export async function checkDemonicVulnerability(discordId: string): Promise<boolean> {
  const data = await redisService.get<{ active: boolean }>(`demonic_vulnerability:${discordId}`);
  return data?.active ?? false;
}

// ---------------------------------------------------------------------------
// Mirror of Fate — Redis 24hr, consumed on trigger
// ---------------------------------------------------------------------------

export async function checkAndConsumeReflection(targetId: string): Promise<boolean> {
  const data = await redisService.get<{ active: boolean }>(`mirror_of_fate:${targetId}`);
  if (data?.active) {
    await redisService.del(`mirror_of_fate:${targetId}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Soul Ledger — records qualifying losses, ActiveEffect-backed
// ---------------------------------------------------------------------------

export async function recordPotentialSoulLedgerLoss(discordId: string, amount: number): Promise<void> {
  if (amount < 300_000) return;

  const watcher = await prisma.activeEffect.findFirst({
    where: {
      userId: discordId,
      effectType: "soul_ledger_watch",
      value: 0, // still watching, no loss recorded yet
    },
  });
  if (!watcher) return;

  const readyAt = new Date(Date.now() + 24 * 3600 * 1000);
  await prisma.activeEffect.update({
    where: { id: watcher.id },
    data: {
      value: amount,
      meta: { readyAt: readyAt.toISOString() },
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
}

// ---------------------------------------------------------------------------
// Luck system — ActiveEffect-backed
// ---------------------------------------------------------------------------

async function upsertLuckModifier(discordId: string, value: number, source: string, durationMs: number): Promise<void> {
  // MongoDB doesn't support Prisma JSON path filters — fetch all and filter in memory
  const candidates = await prisma.activeEffect.findMany({
    where: {
      userId: discordId,
      effectType: "luck_modifier",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  const existing = candidates.find((e) => (e.meta as any)?.source === source) ?? null;

  if (existing) {
    await prisma.activeEffect.update({
      where: { id: existing.id },
      data: { value, expiresAt: new Date(Date.now() + durationMs) },
    });
  } else {
    await prisma.activeEffect.create({
      data: {
        userId: discordId,
        effectType: "luck_modifier",
        value,
        meta: { source },
        expiresAt: new Date(Date.now() + durationMs),
      },
    });
  }
}

export { upsertLuckModifier };

export async function getCurrentLuck(discordId: string): Promise<number> {
  const modifiers = await prisma.activeEffect.findMany({
    where: {
      userId: discordId,
      effectType: "luck_modifier",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  const total = 50 + modifiers.reduce((sum, e) => sum + e.value, 0);
  return Math.min(100, Math.max(0, total));
}

export async function getLuckBreakdown(discordId: string): Promise<{
  base: number;
  modifiers: { source: string; value: number }[];
  total: number;
}> {
  const effects = await prisma.activeEffect.findMany({
    where: {
      userId: discordId,
      effectType: "luck_modifier",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  const modifiers = effects.map((e) => ({
    source: ((e.meta as any)?.source as string) ?? "unknown",
    value: e.value,
  }));

  const total = Math.min(100, Math.max(0, 50 + modifiers.reduce((sum, m) => sum + m.value, 0)));
  return { base: 50, modifiers, total };
}

export async function applyLuckToChance(discordId: string, baseChance: number, maxImpact: number): Promise<number> {
  const luck = await getCurrentLuck(discordId);
  // Every 10 Luck above/below 50 = maxImpact/2.5 change
  const adjustment = ((luck - 50) / 10) * (maxImpact / 2.5);
  return baseChance + adjustment;
}

// ---------------------------------------------------------------------------
// Income + Loss modifiers — central helpers
// ---------------------------------------------------------------------------

export type IncomeSource = "daily" | "weekly" | "monthly" | "work" | "crime_win" | "game_win";
export type LossSource = "crime_fine" | "rob_penalty" | "game_loss" | "chaos_item";

export async function applyIncomeModifiers(discordId: string, baseAmount: number, source: IncomeSource): Promise<number> {
  const counterfeit = await checkCounterfeitKit(discordId);
  const crown = await checkCrownOfGreed(discordId);
  const devil = await checkDevilContract(discordId);
  return Math.floor(baseAmount * counterfeit * crown * devil);
}

export async function applyLossModifiers(discordId: string, baseAmount: number, source: LossSource): Promise<number> {
  const crown = await checkCrownOfGreed(discordId);
  return Math.floor(baseAmount * crown);
}
