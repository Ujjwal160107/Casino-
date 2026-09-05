import { Client } from "discord.js";
import prisma from "../utils/prisma";
import { notifyTaxRaid } from "./dmNoticeService";
import { TAX_CONFIG } from "../utils/economyConfig";
import { redisService } from "./redisService";
import { checkTaxShield } from "./shopBuffs";
import { removeBalance, withTransactionRetry } from "./walletService";

const LEGACY_HEAT_KEY = (discordId: string) => `tax_heat:${discordId}`;
let legacyHeatMigrationUnavailable = false;

export type HeatActionId = "lay_low" | "fixer";

export type HeatSnapshot = {
  heat: number;
  walletBalance: number;
  layLowAvailableAt: Date | null;
  fixerAvailableAt: Date | null;
  nextDecayAt: Date;
};

export function getFixerCost(heat: number): number {
  return Math.max(TAX_CONFIG.fixerMinimumFee, Math.ceil(heat) * TAX_CONFIG.fixerFeePerHeat);
}

function getAvailableAt(lastUsedAt: Date | null, cooldownSeconds: number): Date | null {
  if (!lastUsedAt) return null;
  const availableAt = new Date(lastUsedAt.getTime() + cooldownSeconds * 1000);
  return availableAt.getTime() > Date.now() ? availableAt : null;
}

export function getNextHeatDecayAt(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/**
 * Carries forward heat created by the former Redis-only implementation.
 * It is intentionally best-effort: gameplay no longer depends on Redis.
 */
async function migrateLegacyHeatForUser(discordId: string): Promise<void> {
  if (legacyHeatMigrationUnavailable) return;
  try {
    const redis = redisService.getInstance();
    const raw = await redis.get(LEGACY_HEAT_KEY(discordId));
    if (!raw) return;

    const legacyHeat = Number.parseInt(raw as string, 10);
    if (Number.isFinite(legacyHeat) && legacyHeat > 0) {
      const user = await prisma.user.findUnique({
        where: { discordId },
        select: { crimeHeat: true },
      });
      if (user && legacyHeat > user.crimeHeat) {
        await prisma.user.update({
          where: { discordId },
          data: { crimeHeat: legacyHeat },
        });
      }
    }

    await redis.del(LEGACY_HEAT_KEY(discordId));
  } catch (error) {
    legacyHeatMigrationUnavailable = true;
    console.warn("Legacy heat migration is unavailable; new heat is safely stored in the database.", error);
  }
}

async function migrateLegacyHeat(): Promise<void> {
  if (legacyHeatMigrationUnavailable) return;
  try {
    const redis = redisService.getInstance();
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "tax_heat:*", "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        const discordId = key.replace("tax_heat:", "");
        await migrateLegacyHeatForUser(discordId);
      }
    } while (cursor !== "0");
  } catch (error) {
    legacyHeatMigrationUnavailable = true;
    console.warn("Legacy heat migration is unavailable; new heat is safely stored in the database.", error);
  }
}

// Income Tax
export async function applyIncomeTax(
  discordId: string,
  grossAmount: number,
): Promise<{ net: number; taxPaid: number; shielded: boolean }> {
  const shielded = await checkTaxShield(discordId);
  if (shielded) return { net: grossAmount, taxPaid: 0, shielded: true };

  const taxPaid = Math.floor(grossAmount * TAX_CONFIG.incomeTaxRate);
  if (taxPaid <= 0) return { net: grossAmount, taxPaid: 0, shielded: false };

  await removeBalance(discordId, taxPaid, "income_tax", { gross: grossAmount });
  return { net: grossAmount - taxPaid, taxPaid, shielded: false };
}

// Transfer Tax
export async function applyTransferTax(
  fromDiscordId: string,
  amount: number,
): Promise<{ net: number; taxPaid: number; shielded: boolean }> {
  const shielded = await checkTaxShield(fromDiscordId);
  if (shielded) return { net: amount, taxPaid: 0, shielded: true };

  const taxPaid = Math.floor(amount * TAX_CONFIG.transferTaxRate);
  return { net: amount - taxPaid, taxPaid, shielded: false };
}

// Crime Heat
export async function addCrimeHeat(discordId: string, amount: number = TAX_CONFIG.crimeHeatGain): Promise<number> {
  await migrateLegacyHeatForUser(discordId);
  const heatGain = Math.max(0, Math.round(amount));
  if (heatGain === 0) return getHeatLevel(discordId);

  const user = await prisma.user.update({
    where: { discordId },
    data: { crimeHeat: { increment: heatGain } },
    select: { crimeHeat: true },
  });
  return user.crimeHeat;
}

export async function getHeatLevel(discordId: string): Promise<number> {
  await migrateLegacyHeatForUser(discordId);
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { crimeHeat: true },
  });
  return Math.max(0, user?.crimeHeat ?? 0);
}

export async function getHeatSnapshot(discordId: string, username = "UnknownUser"): Promise<HeatSnapshot> {
  await migrateLegacyHeatForUser(discordId);
  const user = await prisma.user.upsert({
    where: { discordId },
    update: { username },
    create: { discordId, username, wallet: { create: { balance: 0 } } },
    include: { wallet: true },
  });

  if (!user.wallet) {
    const updatedUser = await prisma.user.update({
      where: { discordId },
      data: { wallet: { create: { balance: 0 } } },
      include: { wallet: true },
    });
    return {
      heat: Math.max(0, updatedUser.crimeHeat),
      walletBalance: updatedUser.wallet?.balance ?? 0,
      layLowAvailableAt: getAvailableAt(updatedUser.lastLayLowAt, TAX_CONFIG.layLowCooldownSeconds),
      fixerAvailableAt: getAvailableAt(updatedUser.lastHeatFixerAt, TAX_CONFIG.fixerCooldownSeconds),
      nextDecayAt: getNextHeatDecayAt(),
    };
  }

  return {
    heat: Math.max(0, user.crimeHeat),
    walletBalance: user.wallet.balance,
    layLowAvailableAt: getAvailableAt(user.lastLayLowAt, TAX_CONFIG.layLowCooldownSeconds),
    fixerAvailableAt: getAvailableAt(user.lastHeatFixerAt, TAX_CONFIG.fixerCooldownSeconds),
    nextDecayAt: getNextHeatDecayAt(),
  };
}

export async function applyHeatAction(discordId: string, username: string, actionId: HeatActionId | string) {
  if (actionId !== "lay_low" && actionId !== "fixer") throw new Error("Unknown heat action.");
  await migrateLegacyHeatForUser(discordId);

  return withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true },
    });
    if (!user?.wallet) throw new Error("Your wallet is unavailable. Please try again.");

    const heat = Math.max(0, user.crimeHeat);
    if (heat <= 0) throw new Error("You do not have any heat to reduce.");

    const now = new Date();
    if (actionId === "lay_low") {
      const availableAt = getAvailableAt(user.lastLayLowAt, TAX_CONFIG.layLowCooldownSeconds);
      if (availableAt) throw new Error(`Lay Low is available <t:${Math.floor(availableAt.getTime() / 1000)}:R>.`);

      const reducedBy = Math.min(heat, TAX_CONFIG.layLowHeatReduction);
      const nextHeat = heat - reducedBy;
      await tx.user.update({
        where: { discordId },
        data: { crimeHeat: nextHeat, lastLayLowAt: now },
      });

      return {
        actionId,
        actionName: "Lay Low",
        cost: 0,
        previousHeat: heat,
        heat: nextHeat,
        reducedBy,
        previousWalletBalance: user.wallet.balance,
        walletBalance: user.wallet.balance,
      };
    }

    if (heat < TAX_CONFIG.fixerMinimumHeat) {
      throw new Error(`Call a Fixer unlocks at ${TAX_CONFIG.fixerMinimumHeat} heat.`);
    }

    const availableAt = getAvailableAt(user.lastHeatFixerAt, TAX_CONFIG.fixerCooldownSeconds);
    if (availableAt) throw new Error(`Call a Fixer is available <t:${Math.floor(availableAt.getTime() / 1000)}:R>.`);

    const cost = getFixerCost(heat);
    if (user.wallet.balance < cost) throw new Error(`You need ${cost.toLocaleString("en-US")} in your wallet to call a fixer.`);

    const reducedBy = Math.min(heat, TAX_CONFIG.fixerHeatReduction);
    const nextHeat = heat - reducedBy;
    await tx.wallet.update({
      where: { id: user.wallet.id },
      data: { balance: { decrement: cost } },
    });
    await tx.transaction.create({
      data: {
        walletId: user.wallet.id,
        amount: -cost,
        type: "heat_fixer",
        meta: { action: "fixer", previousHeat: heat, nextHeat, reducedBy },
        isEarned: false,
      },
    });
    await tx.user.update({
      where: { discordId },
      data: { crimeHeat: nextHeat, lastHeatFixerAt: now },
    });

    return {
      actionId,
      actionName: "Call a Fixer",
      cost,
      previousHeat: heat,
      heat: nextHeat,
      reducedBy,
      previousWalletBalance: user.wallet.balance,
      walletBalance: user.wallet.balance - cost,
    };
  }));
}

// Scheduler: raid first, then passive decay. A player at the threshold must
// face the raid roll before the hourly decay can bring them below it.
export async function decayAllHeat(): Promise<void> {
  await migrateLegacyHeat();
  const now = new Date();
  await prisma.user.updateMany({
    where: { crimeHeat: { gt: 0 } },
    data: { crimeHeat: { decrement: TAX_CONFIG.heatDecayPerHour }, lastHeatDecayAt: now },
  });
  await prisma.user.updateMany({
    where: { crimeHeat: { lt: 0 } },
    data: { crimeHeat: 0 },
  });
}

export async function runRaidScan(client: Client): Promise<void> {
  await migrateLegacyHeat();
  const users = await prisma.user.findMany({
    where: { crimeHeat: { gte: TAX_CONFIG.raidHeatThreshold } },
    select: { discordId: true },
  });

  for (const user of users) {
    if (Math.random() >= TAX_CONFIG.autoRaidChancePct) continue;
    await executeRaid(user.discordId, client).catch((err) =>
      console.error(`Raid failed for ${user.discordId}:`, err),
    );
  }
}

export async function executeRaid(
  discordId: string,
  client: Client,
): Promise<{ seized: number; newBalance: number }> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallet: true },
  });

  if (!user?.wallet || user.wallet.balance <= 0) {
    await prisma.user.updateMany({ where: { discordId }, data: { crimeHeat: 0 } });
    return { seized: 0, newBalance: 0 };
  }

  const pct = TAX_CONFIG.raidSeizurePctMin
    + Math.random() * (TAX_CONFIG.raidSeizurePctMax - TAX_CONFIG.raidSeizurePctMin);
  const seized = Math.floor(user.wallet.balance * pct);
  const result = await removeBalance(discordId, seized, "tax_raid", { reason: "IRS audit" });
  await prisma.user.update({ where: { discordId }, data: { crimeHeat: 0 } });

  await notifyTaxRaid(client, discordId, result.removedAmount, result.newBalance);

  return { seized: result.removedAmount, newBalance: result.newBalance };
}
