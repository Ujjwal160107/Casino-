import prisma, { runWithRetry } from "../utils/prisma";
import { PrismaClient } from "@prisma/client";
import { MAX_SAFE_BALANCE } from "../utils/economyConfig";
import { invalidateUserCache } from "./userService";

export async function ensureBankForUser(userIdOrDiscordId: string, username = "UnknownUser") {
  const discordId = userIdOrDiscordId;

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { discordId },
      include: { bank: true, wallet: true }
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          discordId,
          username,
          wallet: { create: { balance: 0 } },
          bank: { create: { balance: 0 } }
        },
        include: { bank: true, wallet: true }
      });
    }

    if (!user.bank) {
      user = await tx.user.update({
        where: { discordId },
        data: { bank: { create: { balance: 0 } } },
        include: { bank: true, wallet: true }
      });
    }

    if (!user.wallet) {
      await tx.user.update({
        where: { discordId },
        data: { wallet: { create: { balance: 0 } } }
      });
    }

    return user.bank!;
  });
}

export async function ensureBankingUser(discordId: string, username = "UnknownUser") {
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true, bank: true }
    });

    if (!user) {
      return tx.user.create({
        data: {
          discordId,
          username,
          wallet: { create: { balance: 0 } },
          bank: { create: { balance: 0 } }
        },
        include: { wallet: true, bank: true }
      });
    }

    if (!user.wallet || !user.bank) {
      user = await tx.user.update({
        where: { discordId },
        data: {
          ...(!user.wallet ? { wallet: { create: { balance: 0 } } } : {}),
          ...(!user.bank ? { bank: { create: { balance: 0 } } } : {})
        },
        include: { wallet: true, bank: true }
      });
    }

    return user;
  });
}

export async function depositToBank(walletId: string, userId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be greater than 0.");

  const result = await runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const wallet = await trx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new Error("Wallet not found.");
      if (wallet.userId !== userId) throw new Error("Wallet does not belong to this user.");
      if (wallet.balance < amount) throw new Error("Insufficient wallet balance.");

      const bank = await trx.bank.upsert({
        where: { userId },
        update: {},
        create: { userId, balance: 0 }
      });

      const availableSpace = Math.max(0, MAX_SAFE_BALANCE - bank.balance);
      const actualAmount = Math.min(amount, availableSpace);
      if (actualAmount <= 0) throw new Error("Bank balance is at the safety cap.");

      const [updatedWallet, updatedBank] = await Promise.all([
        trx.wallet.update({
          where: { id: walletId },
          data: { balance: { decrement: actualAmount } }
        }),
        trx.bank.update({
          where: { id: bank.id },
          data: { balance: { increment: actualAmount } }
        })
      ]);

      await trx.transaction.create({
        data: {
          walletId,
          amount: -actualAmount,
          type: "wallet_to_bank",
          meta: { toBank: true, requestedAmount: amount, capped: actualAmount < amount },
          isEarned: false
        }
      });

      await trx.audit.create({
        data: { userId, type: "bank_deposit", meta: { amount: actualAmount, requestedAmount: amount } }
      });

      return { bank: updatedBank, wallet: updatedWallet, actualAmount, capped: actualAmount < amount };
    });
  });

  await invalidateUserCache(userId, "");
  return result;
}

export async function withdrawFromBank(walletId: string, userId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be greater than 0.");

  const result = await runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const wallet = await trx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new Error("Wallet not found.");
      if (wallet.userId !== userId) throw new Error("Wallet does not belong to this user.");

      const bank = await trx.bank.findUnique({ where: { userId } });
      if (!bank) throw new Error("Bank account not found.");
      if (bank.balance < amount) throw new Error("Insufficient funds in bank.");

      const availableSpace = Math.max(0, MAX_SAFE_BALANCE - wallet.balance);
      const actualAmount = Math.min(amount, availableSpace);
      if (actualAmount <= 0) throw new Error("Wallet balance is at the safety cap.");

      const [updatedWallet, updatedBank] = await Promise.all([
        trx.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: actualAmount } }
        }),
        trx.bank.update({
          where: { id: bank.id },
          data: { balance: { decrement: actualAmount } }
        })
      ]);

      await trx.transaction.create({
        data: {
          walletId,
          amount: actualAmount,
          type: "bank_to_wallet",
          meta: { fromBank: bank.id, requestedAmount: amount, capped: actualAmount < amount },
          isEarned: false
        }
      });

      await trx.audit.create({
        data: { userId, type: "bank_withdraw", meta: { amount: actualAmount, requestedAmount: amount } }
      });

      return { bank: updatedBank, wallet: updatedWallet, actualAmount, capped: actualAmount < amount };
    });
  });

  await invalidateUserCache(userId, "");
  return result;
}

export async function getBankByUserId(userId: string) {
  return prisma.bank.findUnique({ where: { userId } });
}

export async function removeMoneyFromBank(userId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be greater than 0.");

  const result = await runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const bank = await trx.bank.findUnique({ where: { userId } });
      if (!bank) throw new Error("Bank account not found.");
      if (bank.balance < amount) throw new Error("Insufficient bank funds.");

      const wallet = await trx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new Error("Wallet not found.");

      const updatedBank = await trx.bank.update({
        where: { userId },
        data: { balance: { decrement: amount } }
      });

      await trx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -amount,
          type: "admin_remove_bank",
          meta: { by: "admin" },
          isEarned: false
        }
      });

      return updatedBank;
    });
  });

  await invalidateUserCache(userId, "");
  return result.balance;
}
