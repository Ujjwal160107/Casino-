import prisma from "../utils/prisma";
import { GuildMember } from "discord.js";
import { redisService } from "./redisService";
import { clearCooldown, getCooldownExpiry } from "../utils/cooldown";
import { Mascot } from "../config/branding";

export interface ShopItemUseResult {
  success: boolean;
  message: string;
}

export async function handleSpecialItemUse(
  itemKey: string,
  discordId: string,
  guildId: string,
  member?: GuildMember
): Promise<ShopItemUseResult | null> {
  switch (itemKey) {
    case "lucky_coin":
      return handleLuckyCoin(discordId, guildId);
    case "padlock":
      return handlePadlock(discordId, guildId);
    case "thief_gloves":
      return handleThiefGloves(discordId, guildId);
    case "mystery_box":
      return handleMysteryBox(discordId, guildId);
    case "bandage":
      return handleBandage(discordId, guildId);
    case "energy_drink":
      return handleEnergyDrink(discordId);
    case "counterfeit_kit":
      return handleCounterfeitKit(discordId, guildId);
    case "tax_shield":
      return handleTaxShield(discordId, guildId);
    case "loan_forgiveness_note":
      return handleLoanForgivenessNote(discordId, guildId);
    case "treasure_map":
      return handleTreasureMap(discordId, guildId);
    default:
      return null;
  }
}

async function handleLuckyCoin(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`lucky_coin:${discordId}`, { active: true, multiplier: 1.5 }, 300);

  return {
    success: true,
    message: `🪙 **Lucky Coin activated!** Your next game payout is boosted by **50%** for 5 minutes.`,
  };
}

async function handlePadlock(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`padlock:${discordId}`, { active: true }, 86400);

  return {
    success: true,
    message: `🔒 **Padlock engaged!** Your wallet is protected from the next robbery attempt for 24 hours.`,
  };
}

async function handleThiefGloves(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`thief_gloves:${discordId}`, { uses: 6, multiplier: 1.25 }, 21600);

  return {
    success: true,
    message: `🧤 **Thieves Gloves equipped!** Your robbery earnings are boosted by **25%** for the next 6 attempts (6hr max).`,
  };
}

async function handleMysteryBox(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const roll = Math.random();
  let reward: number;
  let tier: string;

  if (roll < 0.3) {
    reward = 75_000;
    tier = "Common";
  } else if (roll < 0.8) {
    reward = 100_000;
    tier = "Uncommon";
  } else {
    reward = 500_000;
    tier = "Rare";
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallet: true },
  }) as any;

  if (!user?.wallet) {
    return { success: false, message: "❌ Could not find your wallet." };
  }

  await prisma.wallet.update({
    where: { id: user.wallet.id },
    data: { balance: { increment: reward } },
  });

  await prisma.transaction.create({
    data: {
      walletId: user.wallet.id,
      amount: reward,
      type: "mystery_box",
      meta: { tier },
      isEarned: true,
    },
  });

  return {
    success: true,
    message: `📦 **Mystery Box Opened!**\n\nYou found a **${tier}** prize!\n${Mascot.Emotes.Currency} **+${reward.toLocaleString("en-US")}** added to your wallet!`,
  };
}

async function handleBandage(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const games = ["slots", "coinflip", "roulette", "blackjack", "cockfight"];
  let cleared = 0;

  for (const game of games) {
    const key = `game:${game}:${guildId}:${discordId}`;
    const expiry = getCooldownExpiry(key);
    if (expiry !== null) {
      clearCooldown(key);
      cleared++;
    }
  }

  if (cleared === 0) {
    return {
      success: true,
      message: `🩹 **Bandage applied!** You had no active game cooldowns to clear.`,
    };
  }

  return {
    success: true,
    message: `🩹 **Bandage applied!** Cleared **${cleared}** game cooldown${cleared > 1 ? "s" : ""}. You're ready to play again!`,
  };
}

async function handleEnergyDrink(discordId: string): Promise<ShopItemUseResult> {
  const user = await prisma.user.findUnique({ where: { discordId } }) as any;

  if (!user) return { success: false, message: "❌ User not found." };

  if (!user.lastShift) {
    return {
      success: true,
      message: `⚡ **Energy Drink consumed!** You haven't worked yet, but the caffeine boost feels nice.`,
    };
  }

  const REDUCTION_MS = 3600 * 1000;
  const newLastShift = new Date(user.lastShift.getTime() - REDUCTION_MS);

  await prisma.user.update({
    where: { discordId },
    data: { lastShift: newLastShift },
  });

  const now = Date.now();
  const remaining = Math.max(0, user.lastShift.getTime() - now - REDUCTION_MS);

  return {
    success: true,
    message: `⚡ **Energy Drink consumed!** Reduced your job cooldown by **1 hour**. ${remaining <= 0 ? "You can work again now!" : `~${Math.floor(remaining / 60000)}m remaining.`}`,
  };
}

async function handleCounterfeitKit(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`counterfeit_kit:${discordId}`, { active: true, multiplier: 1.25 }, 7200);

  return {
    success: true,
    message: `🖨️ **Counterfeit Kit activated!** Your next income (daily/work) is boosted by **25%** for 2 hours.`,
  };
}

async function handleTaxShield(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`tax_shield:${discordId}`, { active: true }, 3600);

  return {
    success: true,
    message: `🛡️ **Tax Shield active!** You are exempt from all transaction taxes for **1 hour**.`,
  };
}

async function handleLoanForgivenessNote(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const user = await prisma.user.findUnique({
    where: { discordId },
  }) as any;

  if (!user) {
    return { success: false, message: "❌ User not found." };
  }

  const oldScore = user.creditScore;
  const newScore = Math.min(850, oldScore + 50);

  await prisma.user.update({
    where: { discordId },
    data: { creditScore: newScore },
  });

  return {
    success: true,
    message: `📜 **Loan Forgiveness processed!**\n\nCredit Score: **${oldScore}** → **${newScore}** (+${newScore - oldScore} points)`,
  };
}

async function handleTreasureMap(discordId: string, _guildId: string): Promise<ShopItemUseResult> {
  const roll = Math.random();
  let reward: number;
  let description: string;

  if (roll < 0.30) {
    reward = 150_000;
    description = "a rusty lockbox with a handful of old coins";
  } else if (roll < 0.60) {
    reward = 400_000;
    description = "a buried sack stuffed with gold coins";
  } else if (roll < 0.82) {
    reward = 750_000;
    description = "a pirate's hidden chest packed with jewels";
  } else if (roll < 0.95) {
    reward = 1_200_000;
    description = "an ancient vault sealed with arcane locks";
  } else {
    reward = 2_000_000;
    description = "a legendary dragon's hoard beyond imagination";
  }

  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { wallet: true },
  }) as any;

  if (!user?.wallet) {
    return { success: false, message: "❌ Could not find your wallet." };
  }

  await prisma.wallet.update({
    where: { id: user.wallet.id },
    data: { balance: { increment: reward } },
  });

  await prisma.transaction.create({
    data: {
      walletId: user.wallet.id,
      amount: reward,
      type: "treasure_map",
      meta: { description },
      isEarned: true,
    },
  });

  return {
    success: true,
    message: `🗺️ **Treasure Found!**\n\nYou followed the map and discovered ${description}!\n${Mascot.Emotes.Currency} **+${reward.toLocaleString("en-US")}** added to your wallet!`,
  };
}
