import prisma from "../utils/prisma";
import { MAX_SAFE_BALANCE } from "../utils/economyConfig";
import { invalidateUserCache } from "./userService";
import { withTransactionRetry } from "./walletService";

export interface PenaltyAllocation {
  totalPenalty: number;
  walletDebit: number;
  bankDebit: number;
  previousWalletBalance: number;
  newWalletBalance: number;
  previousBankBalance: number;
  newBankBalance: number;
  debtAdded: number;
}

/**
 * Splits a mandatory penalty across liquid balances. The wallet is exhausted
 * first; every remaining Fortune is charged to the bank, even when that
 * pushes the bank below zero.
 */
export function calculatePenaltyAllocation(
  amount: number,
  walletBalance: number,
  bankBalance: number,
): PenaltyAllocation {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Penalty amount must be a positive safe integer.");
  }
  if (!Number.isFinite(walletBalance) || !Number.isFinite(bankBalance)) {
    throw new Error("Account balances must be finite numbers.");
  }

  const walletDebit = Math.min(amount, Math.max(0, walletBalance));
  const bankDebit = amount - walletDebit;
  const newWalletBalance = walletBalance - walletDebit;
  const newBankBalance = bankBalance - bankDebit;

  if (!Number.isSafeInteger(newWalletBalance) || !Number.isSafeInteger(newBankBalance)) {
    throw new Error("Penalty would exceed the supported balance range.");
  }
  if (newBankBalance < -MAX_SAFE_BALANCE) {
    throw new Error("Penalty would exceed the maximum supported bank debt.");
  }

  return {
    totalPenalty: amount,
    walletDebit,
    bankDebit,
    previousWalletBalance: walletBalance,
    newWalletBalance,
    previousBankBalance: bankBalance,
    newBankBalance,
    debtAdded: Math.max(0, -newBankBalance) - Math.max(0, -bankBalance),
  };
}

/**
 * Applies an unavoidable economy penalty atomically. Wallet transaction
 * history records only the wallet portion; the audit record captures the
 * complete wallet/bank allocation so the ledger never pretends bank debt was
 * removed from the wallet.
 */
export async function applyEconomyPenalty(
  discordId: string,
  username: string,
  amount: number,
  type: string,
  meta: Record<string, unknown> = {},
  guildId?: string,
): Promise<PenaltyAllocation> {
  const result = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { discordId },
      update: {},
      create: { discordId, username },
    });

    const [wallet, bank] = await Promise.all([
      tx.wallet.upsert({
        where: { userId: discordId },
        update: {},
        create: { userId: discordId, balance: 0 },
      }),
      tx.bank.upsert({
        where: { userId: discordId },
        update: {},
        create: { userId: discordId, balance: 0 },
      }),
    ]);

    const allocation = calculatePenaltyAllocation(amount, wallet.balance, bank.balance);

    if (allocation.walletDebit > 0) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: allocation.walletDebit } },
      });
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -allocation.walletDebit,
          type,
          meta: {
            ...meta,
            totalPenalty: allocation.totalPenalty,
            walletDebit: allocation.walletDebit,
            bankDebit: allocation.bankDebit,
          },
          isEarned: false,
        },
      });
    }

    if (allocation.bankDebit > 0) {
      await tx.bank.update({
        where: { id: bank.id },
        data: { balance: { decrement: allocation.bankDebit } },
      });
    }

    await tx.audit.create({
      data: {
        guildId,
        userId: discordId,
        type,
        meta: {
          ...meta,
          totalPenalty: allocation.totalPenalty,
          walletDebit: allocation.walletDebit,
          bankDebit: allocation.bankDebit,
          previousWalletBalance: allocation.previousWalletBalance,
          newWalletBalance: allocation.newWalletBalance,
          previousBankBalance: allocation.previousBankBalance,
          newBankBalance: allocation.newBankBalance,
          debtAdded: allocation.debtAdded,
        },
      },
    });

    return allocation;
  }));

  await invalidateUserCache(discordId, "");
  return result;
}
