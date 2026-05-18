import { Client, EmbedBuilder, Colors } from "discord.js";
import prisma from "../utils/prisma";
import { TAX_CONFIG } from "../utils/economyConfig";
import { redisService } from "./redisService";
import { checkTaxShield } from "./shopBuffs";
import { removeBalance } from "./walletService";

const HEAT_KEY = (discordId: string) => `tax_heat:${discordId}`;

// ─── Income Tax ──────────────────────────────────────────────────────────────

export async function applyIncomeTax(
  discordId: string,
  grossAmount: number
): Promise<{ net: number; taxPaid: number; shielded: boolean }> {
  const shielded = await checkTaxShield(discordId);
  if (shielded) return { net: grossAmount, taxPaid: 0, shielded: true };

  const taxPaid = Math.floor(grossAmount * TAX_CONFIG.incomeTaxRate);
  if (taxPaid <= 0) return { net: grossAmount, taxPaid: 0, shielded: false };

  await removeBalance(discordId, taxPaid, "income_tax", { gross: grossAmount });

  return { net: grossAmount - taxPaid, taxPaid, shielded: false };
}

// ─── Transfer Tax ────────────────────────────────────────────────────────────

export async function applyTransferTax(
  fromDiscordId: string,
  amount: number
): Promise<{ net: number; taxPaid: number; shielded: boolean }> {
  const shielded = await checkTaxShield(fromDiscordId);
  if (shielded) return { net: amount, taxPaid: 0, shielded: true };

  const taxPaid = Math.floor(amount * TAX_CONFIG.transferTaxRate);
  return { net: amount - taxPaid, taxPaid, shielded: false };
}

// ─── Crime Heat ──────────────────────────────────────────────────────────────

export async function addCrimeHeat(discordId: string): Promise<void> {
  const redis = redisService.getInstance();
  const key = HEAT_KEY(discordId);
  const current = await redis.get(key);
  const currentHeat = current ? parseInt(current as string, 10) : 0;
  const newHeat = currentHeat + TAX_CONFIG.crimeHeatGain;
  await redis.set(key, newHeat.toString(), "EX", TAX_CONFIG.heatTtlSeconds);
}

export async function getHeatLevel(discordId: string): Promise<number> {
  const redis = redisService.getInstance();
  const val = await redis.get(HEAT_KEY(discordId));
  return val ? parseInt(val as string, 10) : 0;
}

// ─── Scheduler: Heat Decay + Raid Scan ──────────────────────────────────────

export async function decayAllHeat(): Promise<void> {
  const redis = redisService.getInstance();
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "tax_heat:*", "COUNT", 100);
    cursor = nextCursor;

    for (const key of keys) {
      const val = await redis.get(key);
      if (!val) continue;
      const current = parseInt(val as string, 10);
      const decayed = current - TAX_CONFIG.heatDecayPerHour;
      if (decayed <= 0) {
        await redis.del(key);
      } else {
        const ttl = await redis.ttl(key);
        if (ttl > 0) {
          await redis.set(key, decayed.toString(), "EX", ttl);
        }
      }
    }
  } while (cursor !== "0");
}

export async function runRaidScan(client: Client): Promise<void> {
  const redis = redisService.getInstance();
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "tax_heat:*", "COUNT", 100);
    cursor = nextCursor;

    for (const key of keys) {
      const val = await redis.get(key);
      if (!val) continue;
      const heat = parseInt(val as string, 10);
      if (heat < TAX_CONFIG.raidHeatThreshold) continue;
      if (Math.random() >= TAX_CONFIG.autoRaidChancePct) continue;

      const discordId = key.replace("tax_heat:", "");
      await executeRaid(discordId, client).catch((err) =>
        console.error(`Raid failed for ${discordId}:`, err)
      );
    }
  } while (cursor !== "0");
}

// ─── Execute Raid ────────────────────────────────────────────────────────────

export async function executeRaid(
  discordId: string,
  client: Client
): Promise<{ seized: number; newBalance: number }> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallet: true },
  }) as any;

  if (!user?.wallet || user.wallet.balance <= 0) {
    await redisService.del(HEAT_KEY(discordId));
    return { seized: 0, newBalance: 0 };
  }

  const pct =
    TAX_CONFIG.raidSeizurePctMin +
    Math.random() * (TAX_CONFIG.raidSeizurePctMax - TAX_CONFIG.raidSeizurePctMin);
  const seized = Math.floor(user.wallet.balance * pct);

  const result = await removeBalance(discordId, seized, "tax_raid", { reason: "IRS audit" });
  await redisService.del(HEAT_KEY(discordId));

  // DM the player
  try {
    const discordUser = await client.users.fetch(discordId).catch(() => null);
    if (discordUser) {
      const embed = new EmbedBuilder()
        .setTitle("🚨 TAX RAID")
        .setColor(Colors.DarkRed)
        .setDescription(
          `The IRS has audited your financial activity.\n\n` +
          `**Suspicious Income Detected:** Multiple undeclared earnings\n` +
          `**Amount Seized:** ${result.removedAmount.toLocaleString("en-US")} coins\n` +
          `**Remaining Wallet:** ${result.newBalance.toLocaleString("en-US")} coins\n\n` +
          `Your criminal heat has been reset. Stay clean.`
        )
        .setTimestamp();

      await discordUser.send({ embeds: [embed] }).catch(() => null);
    }
  } catch {
    // DMs silently fail if user has them disabled
  }

  return { seized: result.removedAmount, newBalance: result.newBalance };
}
