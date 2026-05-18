import prisma from "../utils/prisma";
import { MAX_SAFE_BALANCE } from "../utils/economyConfig";
import { Prisma } from "@prisma/client";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface GameTransactionMeta {
  game: string;
  betAmount: number;
  payout: number;
  result: string;
  guildId: string;
  channelId?: string;
  messageId?: string;
  choice?: string;
  timestamp?: string;
  [key: string]: unknown;
}

function buildGameMeta(meta: Omit<GameTransactionMeta, "timestamp">): GameTransactionMeta {
  const cleanMeta = Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
  return {
    ...cleanMeta,
    timestamp: new Date().toISOString()
  } as GameTransactionMeta;
}

export async function debitGameBet(
  walletId: string,
  amount: number,
  meta: Omit<GameTransactionMeta, "timestamp" | "payout" | "result"> & { result?: string; payout?: number }
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid bet amount.");

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.balance < amount) throw new Error("Insufficient wallet funds.");

    await tx.transaction.create({
      data: {
        walletId,
        amount: -amount,
        type: "game_bet",
        meta: buildGameMeta({
          ...meta,
          payout: meta.payout ?? 0,
          result: meta.result ?? "bet_placed"
        }) as Prisma.InputJsonValue
      }
    });

    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: { balance: { decrement: amount } }
    });

    return updated.balance;
  });
}

export async function creditGamePayout(
  walletId: string,
  amount: number,
  type: "game_win" | "game_loss" | "game_refund",
  meta: Omit<GameTransactionMeta, "timestamp">
): Promise<number> {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Invalid payout amount.");

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error("Wallet not found.");

    await tx.transaction.create({
      data: {
        walletId,
        amount,
        type,
        meta: buildGameMeta(meta) as Prisma.InputJsonValue
      }
    });

    if (amount <= 0) return wallet.balance;

    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: amount } }
    });

    return updated.balance;
  });
}

export async function placeBetWithTransaction(
  userId: string,
  walletId: string,
  gameId: string,
  amount: number,
  choice: string,
  didWin: boolean,
  payout: number,
  guildId: string,
  retries = 3
): Promise<number> {
  const currentWallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!currentWallet) throw new Error("Wallet not found");

  let actualPayout = payout;
  if (didWin) {
    const projectedBalance = currentWallet.balance - amount + payout;
    if (projectedBalance > MAX_SAFE_BALANCE) {
      const allowedPayout = MAX_SAFE_BALANCE - (currentWallet.balance - amount);
      actualPayout = Math.max(0, allowedPayout);
    }
  }
  const result = didWin ? "win" : (actualPayout > 0 ? "refund" : "loss");
  const resultType = didWin ? "game_win" : (actualPayout > 0 ? "game_refund" : "game_loss");
  const meta = buildGameMeta({
    game: gameId,
    betAmount: amount,
    payout: actualPayout,
    result,
    guildId,
    choice
  });

  while (retries > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
        if (!wallet || wallet.balance < amount) throw new Error("Insufficient wallet funds.");

        await tx.bet.create({
          data: {
            userId,
            gameId,
            amount,
            choice,
            result: didWin ? "win" : "lose",
            payout: actualPayout
          }
        });

        await tx.transaction.create({
          data: {
            walletId,
            amount: -amount,
            type: "game_bet",
            meta: { ...meta, result: "bet_placed" } as Prisma.InputJsonValue
          }
        });

        await tx.transaction.create({
          data: {
            walletId,
            amount: actualPayout,
            type: resultType,
            meta: meta as Prisma.InputJsonValue
          }
        });

        await tx.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: actualPayout - amount } }
        });
      });
      return actualPayout;
    } catch (error: any) {
      if (error.code === 'P2034') { // Write conflict / deadlock
        retries--;
        console.warn(`[PlaceBet] Deadlock detected for ${userId}, retrying... (${retries} left)`);
        await sleep(200); // Random jitter could be better, but fixed 200ms is a start
        continue;
      }
      throw error;
    }
  }
  throw new Error("Transaction failed after retries due to deadlock.");
}

export async function placeBetFallback(
  walletId: string,
  userId: string,
  gameId: string,
  amount: number,
  choice: string,
  didWin: boolean,
  payout: number,
  guildId: string
): Promise<number> {
  // This function originally tried not to use a transaction for everything to avoid locking, but caused issues.
  // It's better to just use the main transactional function with retries.
  // However, if we MUST keep the existing logic separate, we should wrap the critical updates in retries too.

  // For now, let's redirect to usage of the robust transaction function above, 
  // unless there is a specific reason for 'fallback' logic (e.g. partial failures allowed).
  // The original code did manual decrement then separate logic.

  return placeBetWithTransaction(userId, walletId, gameId, amount, choice, didWin, payout, guildId);
}
