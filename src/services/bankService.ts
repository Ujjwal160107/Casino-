import prisma from "../utils/prisma";
import { getGuildConfig } from "./guildConfigService";

export async function ensureBankForUser(userIdOrDiscordId: string, guildId?: string, username?: string) {
  let userId = userIdOrDiscordId;

  // If input is Discord ID (not ObjectId)
  if (!userIdOrDiscordId.match(/^[0-9a-fA-F]{24}$/)) {
    if (!guildId) throw new Error("Guild ID required for bank creation by Discord ID.");

    let user = await prisma.user.findUnique({
      where: { discordId_guildId: { discordId: userIdOrDiscordId, guildId } }
    });

    // Create user if not found and username provided
    if (!user) {
      if (!username) throw new Error("User not found and username not provided for creation.");

      // Fetch default Start Money
      const config = await getGuildConfig(guildId);

      user = await prisma.user.create({
        data: {
          discordId: userIdOrDiscordId,
          guildId,
          username,
          wallet: {
            create: {
              balance: config.startMoney
            }
          }
        }
      });
    }
    userId = user.id;
  }

  const bank = await prisma.bank.findUnique({ where: { userId } });
  if (bank) return bank;

  return prisma.bank.create({ data: { userId, balance: 0 } });
}
export async function depositToBank(walletId: string, userId: string, amount: number, guildId: string) {
  if (amount <= 0) throw new Error("Amount must be greater than 0.");
  const bank = await ensureBankForUser(userId);
  const config = await getGuildConfig(guildId);
  let depositAmount = amount;
  if (config.bankLimit) {
    const space = config.bankLimit - bank.balance;
    if (space <= 0) {
      throw new Error(`Bank limit of ${config.bankLimit} reached.`);
    }
    if (depositAmount > space) {
      depositAmount = space;
    }
  }
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new Error("Wallet not found.");
  if (wallet.balance < depositAmount) throw new Error("Insufficient wallet balance.");

  await prisma.$transaction([
    // FIX: Update balances FIRST to acquire exclusive locks and avoid deadlocks
    prisma.wallet.update({ where: { id: walletId }, data: { balance: { decrement: depositAmount } } }),
    prisma.bank.update({ where: { id: bank.id }, data: { balance: { increment: depositAmount } } }),
    // Record transaction after updates
    prisma.transaction.create({ data: { walletId, amount: -depositAmount, type: "wallet_to_bank", meta: { toBank: true }, isEarned: false } }),
    prisma.audit.create({ data: { userId: wallet.userId, type: "bank_deposit", meta: { amount: depositAmount } } })
  ]);
  return { bank, actualAmount: depositAmount };
}

export async function withdrawFromBank(walletId: string, userId: string, amount: number, guildId?: string) {
  if (amount <= 0) throw new Error("Amount must be greater than 0.");

  const bank = await ensureBankForUser(userId);
  if (bank.balance < amount) throw new Error("Insufficient funds in bank.");

  // Check Wallet Limit
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new Error("Wallet not found.");

  if (guildId) {
    const config = await getGuildConfig(guildId);
    if (config.walletLimit && wallet.balance + amount > config.walletLimit) {
      throw new Error(`Cannot withdraw. Wallet limit of ${config.walletLimit} would be exceeded.`);
    }
  }

  await prisma.$transaction([
    // FIX: Update balances FIRST to acquire exclusive locks and avoid deadlocks
    prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: amount } }
    }),
    prisma.bank.update({
      where: { id: bank.id },
      data: { balance: { decrement: amount } }
    }),
    // Record transaction after updates
    prisma.transaction.create({
      data: {
        walletId,
        amount,
        type: "bank_to_wallet",
        meta: { fromBank: bank.id },
        isEarned: false
      }
    }),
    prisma.audit.create({
      data: {
        userId,
        type: "bank_withdraw",
        meta: { amount }
      }
    })
  ]);

  return bank;
}
export async function getBankByUserId(userId: string) { return prisma.bank.findUnique({ where: { userId } }); }

export async function removeMoneyFromBank(userId: string, amount: number) {
  const bank = await ensureBankForUser(userId);
  if (bank.balance < amount) throw new Error("Insufficient bank funds.");
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error("Wallet not found (DB Error).");

  const [updatedBank] = await prisma.$transaction([
    // FIX: Update first
    prisma.bank.update({ where: { userId }, data: { balance: { decrement: amount } } }),
    prisma.transaction.create({ data: { walletId: wallet.id, amount: -amount, type: "admin_remove_bank", meta: { by: "admin" }, isEarned: false } })
  ]);
  return updatedBank.balance;
}