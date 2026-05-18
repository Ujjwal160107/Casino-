import prisma from "../utils/prisma";
import { checkDynamicCooldown } from "../utils/cooldown";
import { getWalletById } from "./walletService";
import { GRINDING_COMMANDS, MAX_SAFE_BALANCE } from "../utils/economyConfig";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function getIncomeConfigOrDefault(guildId: string | null, commandKey: string) {
  if (commandKey === "beg" || commandKey === "slut") {
    const config = GRINDING_COMMANDS[commandKey];
    return {
      minPay: config.payoutMin,
      maxPay: config.payoutMax,
      cooldown: config.cooldownSeconds,
      successPct: Math.round(config.winRate * 100),
      failPenaltyPct: 0,
      successMessages: [],
      failMessages: []
    };
  }

  if (commandKey === "crime") {
    const config = GRINDING_COMMANDS.crime;
    return {
      minPay: config.payoutMin,
      maxPay: config.payoutMax,
      cooldown: config.cooldownSeconds,
      successPct: Math.round(config.winRate * 100),
      failPenaltyPct: 50,
      successMessages: [],
      failMessages: []
    };
  }

  return { minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50, successMessages: [], failMessages: [] };
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
  const cd = checkDynamicCooldown(cooldownKey, cfg.cooldown);

  if (cd > 0) {
    const timestamp = Math.floor((Date.now() / 1000) + cd);
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

    return {
      success: false,
      amount: -penalty,
      penalty,
      attempted: amount,
      messages: { success: cfg.successMessages, fail: cfg.failMessages }
    };
  }

  if (guildId) {
    const wallet = await getWalletById(walletId);
    if (wallet && wallet.balance + amount > MAX_SAFE_BALANCE) {
      throw new Error(`Wallet limit of ${MAX_SAFE_BALANCE} reached. Cannot earn more.`);
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

  return {
    success: true,
    amount,
    messages: { success: cfg.successMessages, fail: cfg.failMessages }
  };
}
