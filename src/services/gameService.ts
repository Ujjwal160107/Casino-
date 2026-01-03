import prisma from "../utils/prisma";
import { getGuildConfig } from "./guildConfigService";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const config = await getGuildConfig(guildId);

  // Check wallet limit logic outside transaction to avoid holding locks too long for reads
  const currentWallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!currentWallet) throw new Error("Wallet not found");

  let actualPayout = payout;
  if (didWin && config.walletLimit) {
    const projectedBalance = currentWallet.balance - amount + payout;
    if (projectedBalance > config.walletLimit) {
      const allowedPayout = config.walletLimit - (currentWallet.balance - amount);
      actualPayout = Math.max(0, allowedPayout);
    }
  }
  const netChange = actualPayout - amount;

  while (retries > 0) {
    try {
      await prisma.$transaction(async (tx) => {
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
            amount: netChange,
            type: didWin ? "payout" : "bet",
            meta: { choice, payout: actualPayout, originalPayout: payout, didWin }
          }
        });
        await tx.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: netChange } }
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