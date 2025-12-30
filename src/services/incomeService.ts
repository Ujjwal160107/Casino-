import prisma from "../utils/prisma";
import { checkCooldown, getCooldownExpiry } from "../utils/cooldown";
import { formatDuration } from "../utils/format";
import { getGuildConfig } from "./guildConfigService";
import { getWalletById } from "./walletService";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function getIncomeConfigOrDefault(guildId: string | null, commandKey: string) {
  if (!guildId) {
    return { minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50 };
  }
  const cfg = await prisma.incomeConfig.findUnique({
    where: { guildId_commandKey: { guildId, commandKey } }
  });
  if (cfg) {
    return {
      minPay: cfg.minPay,
      maxPay: cfg.maxPay,
      cooldown: cfg.cooldown,
      successPct: cfg.successPct ?? 100,
      failPenaltyPct: cfg.failPenaltyPct ?? 50
    };
  }
  return { minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50 };
}

const executeTx = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const msg = error?.message?.toLowerCase() || "";
      if (i < retries - 1 && (msg.includes("deadlock") || msg.includes("write conflict") || msg.includes("busy"))) {
        await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Transaction failed max retries");
};

export async function runIncomeCommand({
  commandKey,
  discordId,
  guildId,
  userId,
  walletId
}: {
  commandKey: string;
  discordId: string;
  guildId: string | null;
  userId: string;
  walletId: string;
}) {
  const cfg = await getIncomeConfigOrDefault(guildId, commandKey);
  const cooldownKey = `income:${guildId}:${discordId}:${commandKey}`;
  const cd = checkCooldown(cooldownKey, cfg.cooldown);

  if (cd > 0) {
    const expiresAt = getCooldownExpiry(cooldownKey);
    const timestamp = expiresAt ? Math.floor(expiresAt / 1000) : Math.floor((Date.now() / 1000) + cd);
    throw new Error(`Cooldown active. Try again <t:${timestamp}:R>.`);
  }

  const amount = rand(cfg.minPay, cfg.maxPay);
  const successPct = cfg.successPct ?? 100;
  const success = Math.random() * 100 < successPct;

  if (!success) {
    const penaltyPct = cfg.failPenaltyPct ?? 50;
    const penalty = Math.max(1, Math.floor((amount * penaltyPct) / 100));

    await executeTx(async () => {
      await prisma.$transaction([
        prisma.transaction.create({
          data: {
            walletId,
            amount: -penalty,
            type: `${commandKey}_fail`,
            meta: { penalty, attempted: amount, penaltyPct }
          }
        }),
        prisma.wallet.update({
          where: { id: walletId },
          data: { balance: { decrement: penalty } }
        })
      ]);
    });

    return { success: false, amount: -penalty, penalty, attempted: amount };
  }

  if (guildId) {
    const guildConfig = await getGuildConfig(guildId);
    if (guildConfig.walletLimit) {
      const wallet = await getWalletById(walletId);
      if (wallet && wallet.balance + amount > guildConfig.walletLimit) {
        throw new Error(`Wallet limit of ${guildConfig.walletLimit} reached. Cannot earn more.`);
      }
    }
  }

  await executeTx(async () => {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          walletId,
          amount,
          type: `${commandKey}_income`,
          meta: { commandKey },
          isEarned: true
        }
      }),
      prisma.wallet.update({
        where: { id: walletId },
        data: { balance: { increment: amount } }
      })
    ]);
  });

  return { success: true, amount };
}