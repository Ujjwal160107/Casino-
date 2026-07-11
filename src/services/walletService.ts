import prisma from "../utils/prisma";
import { MAX_SAFE_BALANCE, STARTING_WALLET_BALANCE } from "../utils/economyConfig";
import { questBus } from "./questEvents";
import { invalidateUserCache } from "./userService";

function isTransientWriteConflict(error: any) {
  const message = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  return message.includes("write conflict")
    || message.includes("deadlock")
    || message.includes("transaction failed")
    || message.includes("please retry your transaction")
    || message.includes("p2034");
}

async function withTransactionRetry<T>(operation: () => Promise<T>, retries = 4): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (!isTransientWriteConflict(error) || attempt === retries - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 75 + Math.random() * 175 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function ensureUserAndWallet(discordId: string, _guildId: string, username: string) {
  let user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallet: true }
  });

  if (user) {
    if (!user.wallet) {
      user = await prisma.user.update({
        where: { discordId },
        data: {
          wallet: { create: { balance: STARTING_WALLET_BALANCE } }
        },
        include: { wallet: true }
      });
      await invalidateUserCache(discordId, "");
    }
    return user;
  }

  return prisma.user.create({
    data: {
      discordId,
      username,
      wallet: { create: { balance: STARTING_WALLET_BALANCE } }
    },
    include: { wallet: true }
  });
}

export async function getWalletByDiscord(discordId: string, _guildId: string) {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallet: true }
  });
  return user?.wallet ?? null;
}

export async function getWalletById(walletId: string) {
  return prisma.wallet.findUnique({ where: { id: walletId } });
}

export async function depositToWallet(walletId: string, amount: number, meta: any = {}, earned = false, guildId?: string) {
  if (guildId) {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (wallet && wallet.balance + amount > MAX_SAFE_BALANCE) {
      throw new Error(`Wallet limit of ${MAX_SAFE_BALANCE} reached.`);
    }
  }
  await prisma.$transaction([
    prisma.transaction.create({ data: { walletId, amount, type: "deposit", meta, isEarned: earned } }),
    prisma.wallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } })
  ]);
  const owner = await prisma.wallet.findUnique({ where: { id: walletId }, select: { userId: true } });
  if (owner) await invalidateUserCache(owner.userId, "");
}

export async function removeMoneyFromWallet(walletId: string, amount: number) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.balance < amount) throw new Error("Insufficient wallet funds.");

  await prisma.$transaction([
    prisma.transaction.create({
      data: {
        walletId,
        amount: -amount,
        type: "admin_remove",
        meta: { by: "admin" }
      }
    }),
    prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { decrement: amount } }
    })
  ]);
  await invalidateUserCache(wallet.userId, "");
  return wallet.balance - amount;
}

export async function transferMoney(fromDiscordId: string, toDiscordId: string, amount: number, guildId: string) {
  if (amount <= 0) throw new Error("Amount must be positive.");
  if (fromDiscordId === toDiscordId) throw new Error("Cannot transfer to self.");

  const fromUser = await prisma.user.findUnique({
    where: { discordId: fromDiscordId },
    include: { wallet: true }
  });

  if (!fromUser || !fromUser.wallet) throw new Error("Sender has no wallet.");
  if (fromUser.wallet.balance < amount) throw new Error("Insufficient funds.");

  const toUser = await ensureUserAndWallet(toDiscordId, guildId, "UnknownUser");

  if (toUser.wallet!.balance + amount > MAX_SAFE_BALANCE) {
    throw new Error(`Recipient's wallet is full (Max: ${MAX_SAFE_BALANCE}).`);
  }

  await prisma.$transaction([
    prisma.wallet.update({ where: { id: fromUser.wallet.id }, data: { balance: { decrement: amount } } }),
    prisma.transaction.create({ data: { walletId: fromUser.wallet.id, amount: -amount, type: "transfer_sent", meta: { to: toDiscordId } } }),
    prisma.wallet.update({ where: { id: toUser.wallet!.id }, data: { balance: { increment: amount } } }),
    prisma.transaction.create({ data: { walletId: toUser.wallet!.id, amount: amount, type: "transfer_recv", meta: { from: fromDiscordId } } })
  ]);
  await Promise.all([
    invalidateUserCache(fromDiscordId, ""),
    invalidateUserCache(toDiscordId, ""),
  ]);
}

export async function addBalance(discordId: string, username: string, amount: number, type = "income", meta: any = {}, earned = true) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  const result = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true }
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          discordId,
          username,
          wallet: { create: { balance: 0 } }
        },
        include: { wallet: true }
      });
    }

    if (!user.wallet) {
      user = await tx.user.update({
        where: { discordId },
        data: { wallet: { create: { balance: 0 } } },
        include: { wallet: true }
      });
    }

    const availableSpace = Math.max(0, MAX_SAFE_BALANCE - user.wallet!.balance);
    const appliedAmount = Math.min(amount, availableSpace);
    const capped = appliedAmount < amount;

    if (appliedAmount > 0) {
      await tx.wallet.update({
        where: { id: user.wallet!.id },
        data: { balance: { increment: appliedAmount } }
      });

      await tx.transaction.create({
        data: {
          walletId: user.wallet!.id,
          amount: appliedAmount,
          type,
          meta: { ...meta, requestedAmount: amount, capped },
          isEarned: earned
        }
      });
    }

    return {
      walletId: user.wallet!.id,
      previousBalance: user.wallet!.balance,
      newBalance: user.wallet!.balance + appliedAmount,
      requestedAmount: amount,
      appliedAmount,
      capped
    };
  }));

  // Garnishment: deduct 25% of earned income toward delinquent/locked card debt
  if (earned && result.appliedAmount > 0) {
    try {
      const { applyGarnishment } = await import("./creditCardService");
      const { garnished } = await applyGarnishment(discordId, result.appliedAmount);
      if (garnished > 0) {
        await withTransactionRetry(() => prisma.wallet.update({
          where: { id: result.walletId },
          data: { balance: { decrement: garnished } }
        }));
        result.newBalance -= garnished;
        (result as any).garnished = garnished;
      }
    } catch { /* Card service unavailable — skip garnishment */ }
  }

  if (earned && result.appliedAmount > 0) {
    questBus.emit("economy:earn", { discordId, amount: result.appliedAmount });
  }

  if (result.appliedAmount > 0) await invalidateUserCache(discordId, "");

  return result;
}

export async function removeBalance(discordId: string, amount: number, type = "remove", meta: any = {}) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  const result = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true }
    });

    if (!user || !user.wallet) {
      return {
        walletId: null,
        previousBalance: 0,
        newBalance: 0,
        requestedAmount: amount,
        removedAmount: 0
      };
    }

    const removedAmount = Math.min(amount, user.wallet.balance);

    if (removedAmount > 0) {
      await tx.wallet.update({
        where: { id: user.wallet.id },
        data: { balance: { decrement: removedAmount } }
      });

      await tx.transaction.create({
        data: {
          walletId: user.wallet.id,
          amount: -removedAmount,
          type,
          meta: { ...meta, requestedAmount: amount },
          isEarned: false
        }
      });
    }

    return {
      walletId: user.wallet.id,
      previousBalance: user.wallet.balance,
      newBalance: user.wallet.balance - removedAmount,
      requestedAmount: amount,
      removedAmount
    };
  }));

  if (result.removedAmount > 0) await invalidateUserCache(discordId, "");

  return result;
}
