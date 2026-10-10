import prisma, { runWithRetry } from "../utils/prisma";
import { applyTransferTax } from "./taxService";
import { ensureStarterChicken } from "./starterChickenService";
import { invalidateUserCache } from "./userService";

export async function transferAnyFunds(
  fromWalletId: string,
  toDiscordId: string,
  amount: number,
  fromDiscordId: string,
  guildId?: string
): Promise<{ net: number; taxPaid: number; shielded: boolean }> {
  if (amount <= 0) throw new Error("Invalid amount.");

  const fromWallet = await prisma.wallet.findUnique({ where: { id: fromWalletId } });
  if (!fromWallet) throw new Error("Sender wallet not found.");
  if (fromWallet.balance < amount) throw new Error("Insufficient funds.");
  if (!guildId) throw new Error("Guild ID required for transfer.");

  const { net, taxPaid, shielded } = await applyTransferTax(fromDiscordId, amount);

  let recipient = await prisma.user.findUnique({ where: { discordId: toDiscordId }, include: { wallet: true } });
  if (!recipient) {
    recipient = await prisma.user.create({
      data: { discordId: toDiscordId, username: "Unknown", wallet: { create: { balance: 0 } } },
      include: { wallet: true },
    });
  }

  const toWalletId = (recipient as any).wallet!.id;

  // The balance check above is only a fast fail. The guarded decrement is the
  // real check: two transfers racing on the same wallet both pass the read,
  // and an unconditional decrement would pay out twice and go negative.
  await runWithRetry(() => prisma.$transaction(async (tx) => {
    const debit = await tx.wallet.updateMany({
      where: { id: fromWalletId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (debit.count === 0) throw new Error("Insufficient funds.");

    await tx.transaction.create({ data: { walletId: fromWalletId, amount: -amount, type: "transfer_sent", meta: { to: toDiscordId, taxPaid, shielded }, isEarned: false } });
    await tx.wallet.update({ where: { id: toWalletId }, data: { balance: { increment: net } } });
    await tx.transaction.create({ data: { walletId: toWalletId, amount: net, type: "transfer_recv", meta: { from: fromDiscordId }, isEarned: false } });
    await tx.audit.create({ data: { guildId: guildId ?? undefined, userId: fromDiscordId, type: "transfer", meta: { to: toDiscordId, amount, taxPaid } } });
    if (taxPaid > 0) {
      await tx.transaction.create({ data: { walletId: fromWalletId, amount: -taxPaid, type: "transfer_tax", meta: { gross: amount, shielded }, isEarned: false } });
    }
  }));
  await Promise.all([invalidateUserCache(fromDiscordId, ""), invalidateUserCache(toDiscordId, "")]);
  await ensureStarterChicken(toDiscordId, (recipient as any).username ?? "Unknown");
  return { net, taxPaid, shielded };
}
