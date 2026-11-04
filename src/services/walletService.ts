import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { MAX_SAFE_BALANCE, STARTING_WALLET_BALANCE } from "../utils/economyConfig";
import { questBus } from "./questEvents";
import { invalidateUserCache } from "./userService";
import { ensureStarterChicken } from "./starterChickenService";

function isTransientWriteConflict(error: any) {
  const message = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  return message.includes("write conflict")
    || message.includes("deadlock")
    || message.includes("transaction failed")
    || message.includes("please retry your transaction")
    || message.includes("p2034");
}

export async function withTransactionRetry<T>(operation: () => Promise<T>, retries = 4): Promise<T> {
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
    await ensureStarterChicken(discordId, user.username || username);
    return user;
  }

  const created = await prisma.user.create({
    data: {
      discordId,
      username,
      wallet: { create: { balance: STARTING_WALLET_BALANCE } }
    },
    include: { wallet: true }
  });
  await ensureStarterChicken(discordId, created.username || username);
  return created;
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

export class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient funds.");
    this.name = "InsufficientFundsError";
  }
}

export type CreditResult = {
  walletId: string;
  previousBalance: number;
  newBalance: number;
  requestedAmount: number;
  appliedAmount: number;
  capped: boolean;
  garnished?: number;
};

/**
 * The wallet half of a credit, inside the caller's transaction: creates the
 * user/wallet if missing, clamps at MAX_SAFE_BALANCE and writes the
 * Transaction row. Run afterEarnedCredit once the transaction commits.
 */
export async function creditWalletInTx(
  tx: Prisma.TransactionClient,
  discordId: string,
  username: string,
  amount: number,
  type: string,
  meta: Record<string, unknown>,
  earned: boolean
): Promise<CreditResult> {
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
        meta: { ...meta, requestedAmount: amount, capped } as Prisma.InputJsonObject,
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
}

/** Post-commit side effects of a credit: garnishment and the earn event (earned only), cache invalidation. */
export async function afterEarnedCredit(discordId: string, result: CreditResult, earned: boolean): Promise<CreditResult> {
  // Garnishment: deduct 25% of earned income toward delinquent/locked card debt
  // (applyGarnishment debits the wallet itself, atomically with the card).
  if (earned && result.appliedAmount > 0) {
    try {
      const { applyGarnishment } = await import("./creditCardService");
      const { garnished } = await applyGarnishment(discordId, result.appliedAmount);
      if (garnished > 0) {
        result.newBalance -= garnished;
        result.garnished = garnished;
      }
    } catch { /* Garnishment rolled back as a whole — income stays intact */ }
  }

  if (earned && result.appliedAmount > 0) {
    questBus.emit("economy:earn", { discordId, amount: result.appliedAmount });
  }

  if (result.appliedAmount > 0) await invalidateUserCache(discordId, "");

  return result;
}

export async function addBalance(discordId: string, username: string, amount: number, type = "income", meta: any = {}, earned = true) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  const result = await withTransactionRetry(() =>
    prisma.$transaction((tx) => creditWalletInTx(tx, discordId, username, amount, type, meta, earned))
  );
  return afterEarnedCredit(discordId, result, earned);
}

/**
 * Guarded wallet debit inside the caller's transaction: refuses an overdraft
 * with InsufficientFundsError (nothing written) and records one Transaction.
 */
export async function debitWalletInTx(
  tx: Prisma.TransactionClient,
  discordId: string,
  amount: number,
  type: string,
  meta: Record<string, unknown>
): Promise<{ walletId: string }> {
  const { count } = await tx.wallet.updateMany({
    where: { userId: discordId, balance: { gte: amount } },
    data: { balance: { decrement: amount } }
  });
  if (count === 0) throw new InsufficientFundsError();

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: discordId }, select: { id: true } });
  await tx.transaction.create({
    data: { walletId: wallet.id, amount: -amount, type, meta: meta as Prisma.InputJsonObject, isEarned: false }
  });
  return { walletId: wallet.id };
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
