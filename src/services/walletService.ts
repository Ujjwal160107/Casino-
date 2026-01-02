import prisma from "../utils/prisma";
import { getGuildConfig } from "./guildConfigService";

const userIdCache = new Map<string, string>();

export async function ensureUserAndWallet(discordId: string, guildId: string, username: string) {
  const cacheKey = `${discordId}-${guildId}`;
  if (userIdCache.has(cacheKey)) {
    const user = await prisma.user.findUnique({
      where: { discordId_guildId: { discordId, guildId } },
      include: { wallet: true }
    });
    if (user && user.wallet) return user;
  }

  // Fetch config for start money
  const config = await getGuildConfig(guildId);

  const user = await prisma.user.upsert({
    where: { discordId_guildId: { discordId, guildId } },
    update: { username },
    create: {
      discordId,
      guildId,
      username,
      wallet: { create: { balance: config.startMoney } }
    },
    include: { wallet: true }
  });
  userIdCache.set(cacheKey, user.id);
  return user;
} export async function getWalletByDiscord(discordId: string, guildId: string) { const user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId } }, include: { wallet: true } }); return user?.wallet ?? null; } export async function getWalletById(walletId: string) { return prisma.wallet.findUnique({ where: { id: walletId } }); } export async function depositToWallet(walletId: string, amount: number, meta: any = {}, earned = false, guildId?: string) { if (guildId) { const config = await getGuildConfig(guildId); if (config.walletLimit) { const wallet = await prisma.wallet.findUnique({ where: { id: walletId } }); if (wallet && wallet.balance + amount > config.walletLimit) { throw new Error(`Wallet limit of ${config.walletLimit} reached.`); } } } await prisma.$transaction([prisma.transaction.create({ data: { walletId, amount, type: "deposit", meta, isEarned: earned } }), prisma.wallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } })]); } export async function removeMoneyFromWallet(walletId: string, amount: number) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } }); if (!wallet || wallet.balance < amount) throw new Error("Insufficient wallet funds."); await prisma.$transaction([prisma.transaction.create({
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
  return wallet.balance - amount;
} export async function transferMoney(fromDiscordId: string, toDiscordId: string, amount: number, guildId: string) { if (amount <= 0) throw new Error("Amount must be positive."); if (fromDiscordId === toDiscordId) throw new Error("Cannot transfer to self."); const fromUser = await prisma.user.findUnique({ where: { discordId_guildId: { discordId: fromDiscordId, guildId } }, include: { wallet: true } }); if (!fromUser || !fromUser.wallet) throw new Error("Sender has no wallet."); if (fromUser.wallet.balance < amount) throw new Error("Insufficient funds."); const toUser = await ensureUserAndWallet(toDiscordId, guildId, "UnknownUser"); const config = await getGuildConfig(guildId); if (config.walletLimit) { if (toUser.wallet!.balance + amount > config.walletLimit) { throw new Error(`Recipient's wallet is full (Max: ${config.walletLimit}).`); } } await prisma.$transaction([prisma.wallet.update({ where: { id: fromUser.wallet.id }, data: { balance: { decrement: amount } } }), prisma.transaction.create({ data: { walletId: fromUser.wallet.id, amount: -amount, type: "transfer_sent", meta: { to: toDiscordId } } }), prisma.wallet.update({ where: { id: toUser.wallet!.id }, data: { balance: { increment: amount } } }), prisma.transaction.create({ data: { walletId: toUser.wallet!.id, amount: amount, type: "transfer_recv", meta: { from: fromDiscordId } } })]); }