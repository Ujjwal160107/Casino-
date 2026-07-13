import prisma from "../utils/prisma";
import { GuildMember } from "discord.js";
import { redisService } from "./redisService";
import { JOB_SHOP_CATALOG } from "../utils/shopCatalog";
import { clearCooldown, getCooldownExpiry } from "../utils/cooldown";
import { clearLastCasinoCooldown, GAME_DISPLAY_NAMES } from "./casinoCooldownService";
import { addBalance, withTransactionRetry } from "./walletService";
import { invalidateUserCache } from "./userService";
import { Mascot } from "../config/branding";
import {
  upsertLuckModifier,
  getCurrentLuck,
  checkAndConsumeReflection,
  applyLossModifiers,
  checkCrownOfGreed,
} from "./shopBuffs";
import { globalCatalogGuildFilter } from "../utils/globalCatalog";
import { isTester } from "../utils/developerAccess";
import { HUNT_CRAFT_RECIPES, getUnlockedRecipeKeys } from "./huntCraftService";
import { DEFAULT_STUDY_COOLDOWN_SECONDS } from "../utils/economyConfig";

export interface ShopItemUseResult {
  success: boolean;
  message: string;
  /** When false, the caller must NOT consume the inventory item. Defaults to true. */
  shouldConsume?: boolean;
}

export async function handleSpecialItemUse(
  itemKey: string,
  discordId: string,
  guildId: string,
  member?: GuildMember,
  targetId?: string,
  extraArg?: string,
): Promise<ShopItemUseResult | null> {
  switch (itemKey) {
    case "lucky_coin":
      return withBuffCooldown("lucky_coin", discordId, () => handleLuckyCoin(discordId, guildId));
    case "padlock":
      return handlePadlock(discordId, guildId);
    case "thief_gloves":
      return handleThiefGloves(discordId, guildId);
    case "mystery_box":
      return handleMysteryBox(discordId, guildId);
    case "bandage":
      return withBuffCooldown("bandage", discordId, () => handleBandage(discordId, guildId));
    case "energy_drink":
      return withBuffCooldown("energy_drink", discordId, () => handleEnergyDrink(discordId));
    case "counterfeit_kit":
      return handleCounterfeitKit(discordId, guildId);
    case "tax_shield":
      return withBuffCooldown("tax_shield", discordId, () => handleTaxShield(discordId, guildId));
    case "treasure_map":
      return handleTreasureMap(discordId, guildId);
    // New page 2 items
    case "loaded_dice_of_ruin":
      return handleLoadedDice(discordId);
    case "celestial_harp":
      return handleCelestialHarp(discordId);
    case "demonic_harp":
      return handleDemonicHarp(discordId, guildId, targetId, member);
    case "pandora_box":
      return handlePandoraBox(discordId, guildId);
    case "eclipse_mask":
      return handleEclipseMask(discordId);
    case "mirror_of_fate":
      return handleMirrorOfFate(discordId);
    case "crown_of_greed":
      return handleCrownOfGreed(discordId);
    case "devil_contract":
      return handleDevilContract(discordId, guildId);
    case "soul_ledger":
      return handleSoulLedger(discordId, guildId);
    // Job Store consumables
    case "repair_coupon":
      return handleRepairCoupon(discordId, guildId);
    case "warranty_card":
      return handleWarrantyCard(discordId);
    case "stress_pills":
      return withBuffCooldown("stress_pills", discordId, () => handleStressPills(discordId));
    case "energy_flask":
      return withBuffCooldown("energy_flask", discordId, () => handleEnergyFlask(discordId));
    case "focus_headphones":
      return handleFocusHeadphones(discordId);
    case "lucky_tie":
      return handleLuckyTie(discordId);
    case "premium_tools_oil":
      return handlePremiumToolsOil(discordId);
    case "emergency_pager":
      return handleEmergencyPager(discordId);
    case "overtime_contract":
      return withBuffCooldown("overtime_contract", discordId, () => handleOvertimeContract(discordId, guildId));
    case "blackmarket_resume":
      return withBuffCooldown("blackmarket_resume", discordId, () => handleBlackMarketResume(discordId, guildId));
    case "corporate_blessing":
      return handleCorporateBlessing(discordId, guildId);
    // Uni Store
    case "study_laptop":
      return handleStudyLaptop(discordId);
    case "textbook_bundle":
      return handleTextbookBundle(discordId);
    case "lab_kit":
      return handleLabKit(discordId);
    case "calculator_pro":
      return handleCalculatorPro(discordId);
    case "coffee_thermos":
      return handleCoffeeThermos(discordId, guildId);
    case "focus_notes":
      return handleFocusNotes(discordId);
    case "cheat_sheet":
      return handleCheatSheet(discordId);
    case "tutor_pass":
      return handleTutorPass(discordId);
    case "scholarship_letter":
      return handleScholarshipLetter(discordId);
    // Cock Store items
    case "basic_feed":
    case "protein_feed":
    case "champion_feed":
      return handleCockFeed(itemKey, discordId, guildId);
    case "agility_vitamins":
      return handleAgilityVitamins(discordId, guildId);
    case "feather_bandage":
      return handleFeatherBandage(discordId, guildId);
    case "training_whistle":
      return handleTrainingWhistle(discordId, guildId);
    case "phoenix_serum":
      return handlePhoenixSerum(discordId, guildId);
    case "iron_spurs":
    case "guard_vest":
      return handleCockEquip(itemKey, discordId, guildId);
    case "komodo_venom_flask":
      return handleKomodoVenomFlask(discordId, targetId, member);
    case "echo_whistle":
      return handleEchoWhistle(discordId);
    case "bait_box":
      return handleBaitBox(discordId);
    case "camouflage_kit":
      return handleCamouflageKit(discordId);
    case "hunters_compass":
      return handleHuntersCompass(discordId, extraArg);
    case "rare_blueprint":
      return handleRareBlueprint(discordId);
    case "legendary_blueprint":
      return handleLegendaryBlueprint(discordId);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Existing handlers (unchanged)
// ---------------------------------------------------------------------------

async function handleLuckyCoin(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`lucky_coin:${discordId}`, { active: true, multiplier: 1.5 }, 300);
  return {
    success: true,
    message: `**Lucky Coin activated!** Your next game payout is boosted by **50%** for 5 minutes.`,
  };
}

async function handlePadlock(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`padlock:${discordId}`, { active: true }, 86400);
  return {
    success: true,
    message: `**Padlock engaged!** Your wallet is protected from the next robbery attempt for 24 hours.`,
  };
}

async function handleThiefGloves(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`thief_gloves:${discordId}`, { uses: 6, multiplier: 1.25 }, 21600);
  return {
    success: true,
    message: `**Thieves Gloves equipped!** Your robbery earnings are boosted by **25%** for the next 6 attempts (6hr max).`,
  };
}

const HUNT_BUFF_TTL_SECONDS = 24 * 3600;

async function handleEchoWhistle(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`hunt_echo_whistle:${discordId}`, { active: true }, HUNT_BUFF_TTL_SECONDS);
  return {
    success: true,
    message: "**Echo Whistle activated!** After your next hunt, there is a **35%** chance to attract one extra animal matching your best catch.",
  };
}

async function handleBaitBox(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`hunt_bait_box:${discordId}`, { active: true }, HUNT_BUFF_TTL_SECONDS);
  return {
    success: true,
    message: "**Bait Box set!** Your next hunt will attract **at least 2 animals**.",
  };
}

async function handleCamouflageKit(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`hunt_camouflage:${discordId}`, { active: true }, HUNT_BUFF_TTL_SECONDS);
  return {
    success: true,
    message: "**Camouflage Kit activated!** Rare and Legendary catch rates are boosted for your **next hunt**.",
  };
}

async function handleHuntersCompass(discordId: string, mode?: string): Promise<ShopItemUseResult> {
  const normalizedMode = mode === "safer" ? "safe" : mode === "riskier" ? "risky" : mode;
  if (normalizedMode !== "safe" && normalizedMode !== "risky") {
    return {
      success: false,
      shouldConsume: false,
      message:
        "Choose a path: `use hunters compass risky` (**+8% Rare, +4% Legendary**) or `use hunters compass safe` (**+15% Uncommon**). Once per day.",
    };
  }

  const cdKey = `hunters_compass_cd:${discordId}`;
  const onCooldown = await redisService.get<{ until: number }>(cdKey);
  if (onCooldown && !isTester(discordId)) {
    const expiresAt = Math.floor(onCooldown.until / 1000);
    return { success: false, shouldConsume: false, message: `The Hunter's Compass is still recalibrating! Available <t:${expiresAt}:R>.` };
  }

  await redisService.set(`hunt_compass:${discordId}`, { mode: normalizedMode }, HUNT_BUFF_TTL_SECONDS);
  if (!isTester(discordId)) {
    await redisService.set(cdKey, { until: Date.now() + 86_400_000 }, 86400);
  }

  const pathDesc =
    normalizedMode === "risky"
      ? "**Risky path** — +8% Rare and +4% Legendary odds"
      : "**Safe path** — +15% Uncommon odds";
  return {
    success: true,
    shouldConsume: false,
    message: `🧭 **The Hunter's Compass points the way!** ${pathDesc} on your next hunt (expires in 24h).`,
  };
}

async function handleKomodoVenomFlask(discordId: string, targetId?: string, member?: GuildMember): Promise<ShopItemUseResult> {
  if (!targetId) {
    return { success: false, shouldConsume: false, message: "Mention a target: `use Komodo Venom Flask @user`." };
  }
  if (targetId === discordId) {
    return { success: false, shouldConsume: false, message: "You cannot use Komodo Venom Flask on yourself." };
  }

  const targetMember = member?.guild ? await member.guild.members.fetch(targetId).catch(() => null) : null;
  if (targetMember?.user.bot) {
    return { success: false, shouldConsume: false, message: "You cannot use Komodo Venom Flask on bots." };
  }

  await upsertLuckModifier(targetId, -20, "komodo_venom_flask", 2 * 3600 * 1000);
  return {
    success: true,
    message: `Komodo Venom Flask used. <@${targetId}> loses **20 Luck** for **2 hours**.`,
  };
}

async function handleMysteryBox(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  return withClaimedCooldown("mystery_box", discordId, async () => {
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

    const result = await addBalance(discordId, discordId, reward, "mystery_box", { tier }, true);

    return {
      success: true,
      message: `**Mystery Box Opened!**\n\nYou found a **${tier}** prize!\n${Mascot.Emotes.Currency} **+${result.appliedAmount.toLocaleString("en-US")}** added to your wallet!`,
    };
  });
}

async function handleBandage(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  // Clear the most recently played casino game cooldown (Redis)
  const clearedGame = await clearLastCasinoCooldown(discordId);

  // Also clear the legacy in-memory key for that same game (backward compat)
  if (clearedGame) {
    const memKey = `game:${clearedGame}:${guildId}:${discordId}`;
    if (getCooldownExpiry(memKey) !== null) clearCooldown(memKey);
  }

  if (!clearedGame) {
    return {
      success: true,
      shouldConsume: false,
      message: `**Bandage applied!** You have no active casino cooldowns to clear.`,
    };
  }

  const gameName = GAME_DISPLAY_NAMES[clearedGame] ?? clearedGame;
  return {
    success: true,
    message: `**Bandage applied!** Cleared your **${gameName}** cooldown. You can play again now!`,
  };
}

async function handleEnergyDrink(discordId: string): Promise<ShopItemUseResult> {
  const user = await prisma.user.findUnique({ where: { discordId } }) as any;

  if (!user) return { success: false, message: "User not found." };

  if (!user.lastShift) {
    return {
      success: true,
      shouldConsume: false,
      message: `**Energy Drink consumed!** You haven't worked yet, but the caffeine boost feels nice.`,
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
    message: `**Energy Drink consumed!** Reduced your job cooldown by **1 hour**. ${remaining <= 0 ? "You can work again now!" : `~${Math.floor(remaining / 60000)}m remaining.`}`,
  };
}

async function handleCounterfeitKit(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`counterfeit_kit:${discordId}`, { active: true, multiplier: 1.25 }, 7200);
  return {
    success: true,
    message: `**Counterfeit Kit activated!** Your next income (daily/work) is boosted by **25%** for 2 hours.`,
  };
}

async function handleTaxShield(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`tax_shield:${discordId}`, { active: true }, 3600);
  return {
    success: true,
    message: `**Tax Shield active!** You are exempt from all transaction taxes for **1 hour**.`,
  };
}

async function handleTreasureMap(discordId: string, _guildId: string): Promise<ShopItemUseResult> {
  return withClaimedCooldown("treasure_map", discordId, async () => {
    // 25% success / 75% failure. Failure fines 150k-300k (wallet then bank)
    // and has a 25% chance of -15 Luck for 1h. Net EV ~= -79k per use.
    const success = Math.random() < 0.25;

    if (success) {
      const tierRoll = Math.random();
      let reward: number;
      let description: string;
      if (tierRoll < 0.60) {
        reward = 1_500_000;
        description = "a pirate's hidden chest packed with jewels";
      } else if (tierRoll < 0.90) {
        reward = 2_200_000;
        description = "an ancient vault sealed with arcane locks";
      } else {
        reward = 4_000_000;
        description = "a legendary dragon's hoard beyond imagination";
      }

      const result = await addBalance(discordId, discordId, reward, "treasure_map", { description }, true);

      return {
        success: true,
        message: `**Treasure Found!**\n\nYou followed the map and discovered ${description}!\n${Mascot.Emotes.Currency} **+${result.appliedAmount.toLocaleString("en-US")}** added to your wallet!\n\nThe map crumbles to dust. Another can be followed <t:${Math.floor((Date.now() + 86_400_000) / 1000)}:R>.`,
      };
    }

    // Failure: fine 150k-300k, 25% chance of a -15 Luck debuff for 1h
    const baseFine = randomInt(150_000, 300_000);
    const crownMult = await checkCrownOfGreed(discordId);
    const fine = Math.floor(baseFine * crownMult);
    const collected = await applyItemFine(discordId, fine, "treasure_map");

    const { recordPotentialSoulLedgerLoss } = await import("./shopBuffs");
    await recordPotentialSoulLedgerLoss(discordId, collected);

    let debuffNote = "";
    if (Math.random() < 0.25) {
      await upsertLuckModifier(discordId, -15, "treasure_map", 3600 * 1000);
      debuffNote = "\nThe curse of the false map clings to you: **-15 Luck for 1 hour**.";
    }

    return {
      success: true,
      message: `**Dead End!**\n\nThe map led you into an ambush of booby traps.\n${Mascot.Emotes.Currency} **-${collected.toLocaleString("en-US")}** lost covering your escape.${debuffNote}`,
    };
  });
}

// ---------------------------------------------------------------------------
// New page 2 handlers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Shared gamble-item helpers
// ---------------------------------------------------------------------------

const ITEM_COOLDOWN_SECONDS = 86_400; // 24h — one roll of each gamble item per day

/**
 * Collects a fine from the user: wallet first, overflowing into the bank.
 * Unlike removeBalance (wallet-capped), this cannot be dodged by banking
 * cash before using an item. Never drives balances negative — if wallet and
 * bank combined can't cover it, takes everything available.
 * Returns the amount actually collected.
 */
async function applyItemFine(discordId: string, amount: number, source: string): Promise<number> {
  if (amount <= 0) return 0;

  const collected = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true, bank: true },
    });
    if (!user?.wallet) return 0;

    const fromWallet = Math.min(amount, Math.max(0, user.wallet.balance));
    const fromBank = Math.min(amount - fromWallet, Math.max(0, user.bank?.balance ?? 0));
    const total = fromWallet + fromBank;
    if (total <= 0) return 0;

    if (fromWallet > 0) {
      await tx.wallet.update({ where: { id: user.wallet.id }, data: { balance: { decrement: fromWallet } } });
    }
    if (fromBank > 0 && user.bank) {
      await tx.bank.update({ where: { id: user.bank.id }, data: { balance: { decrement: fromBank } } });
    }
    await tx.transaction.create({
      data: {
        walletId: user.wallet.id,
        amount: -total,
        type: "item_fine",
        meta: { source, requestedAmount: amount, fromWallet, fromBank },
        isEarned: false,
      },
    });
    return total;
  }));

  if (collected > 0) await invalidateUserCache(discordId, "");
  return collected;
}

/**
 * Atomically claim the per-item cooldown BEFORE resolving (SET NX), so two
 * concurrent uses of the same item can never both resolve. Returns a blocking
 * result if the cooldown is already held. Testers bypass.
 */
async function claimItemCooldown(itemKey: string, discordId: string, seconds: number = ITEM_COOLDOWN_SECONDS): Promise<ShopItemUseResult | null> {
  if (isTester(discordId)) return null;
  const key = `item_cd:${itemKey}:${discordId}`;
  const claimed = await redisService.setIfNotExists(key, { until: Date.now() + seconds * 1000 }, seconds);
  if (claimed) return null;
  const data = await redisService.get<{ until: number }>(key);
  const expiresAt = Math.floor((data?.until ?? Date.now() + seconds * 1000) / 1000);
  return {
    success: false,
    shouldConsume: false,
    message: `This item is still recharging! Available <t:${expiresAt}:R>.`,
  };
}

async function releaseItemCooldown(itemKey: string, discordId: string): Promise<void> {
  if (isTester(discordId)) return;
  await redisService.del(`item_cd:${itemKey}:${discordId}`);
}

/**
 * Claims the cooldown, runs the item's resolution, and releases the claim if
 * the item did NOT actually resolve (validation failure returns success:false,
 * or the handler throws). A resolved use — success:true, win OR lose — keeps
 * the cooldown. This preserves the design rule "a blocked attempt or early
 * error never costs the player their daily use" while making the claim atomic.
 */
async function withClaimedCooldown(itemKey: string, discordId: string, fn: () => Promise<ShopItemUseResult>): Promise<ShopItemUseResult> {
  const blocked = await claimItemCooldown(itemKey, discordId);
  if (blocked) return blocked;
  try {
    const result = await fn();
    if (!result.success) await releaseItemCooldown(itemKey, discordId);
    return result;
  } catch (err) {
    await releaseItemCooldown(itemKey, discordId);
    throw err;
  }
}

/**
 * Per-use cooldowns for buff/utility items whose benefit is otherwise
 * repeatable enough to break the economy — the classic case being the Energy
 * Drink loop (buy → clear work cooldown → work → repeat for infinite money).
 * Durations are tuned to each item's exploit power; see the design doc.
 */
const BUFF_ITEM_COOLDOWN_SECONDS: Record<string, number> = {
  energy_drink: 8 * 3600,        // clears the 1h work cooldown
  energy_flask: 8 * 3600,        // clears the 1h work cooldown (bigger reduction)
  overtime_contract: 12 * 3600,  // instant extra shift
  stress_pills: 6 * 3600,        // removes the stress gate on working
  lucky_coin: 6 * 3600,          // repeatable casino payout buff
  bandage: 6 * 3600,             // clears a casino game cooldown
  tax_shield: 6 * 3600,          // bypasses transaction taxes
  blackmarket_resume: 24 * 3600, // skips lifetime-shift career gates
};

export function isBuffCooldownItem(itemKey: string): boolean {
  return itemKey in BUFF_ITEM_COOLDOWN_SECONDS;
}

/**
 * Wraps a buff item's handler with an atomic per-use cooldown. The claim is
 * taken BEFORE the handler runs (SET NX) so two concurrent uses can never both
 * resolve, and it is released if the item did not actually grant its benefit —
 * i.e. a validation failure (success:false) or a no-op use (shouldConsume:false,
 * e.g. Energy Drink with no active shift). Only a real, consumed use holds the
 * cooldown. Testers bypass entirely (claimItemCooldown returns null).
 */
async function withBuffCooldown(
  itemKey: string,
  discordId: string,
  fn: () => Promise<ShopItemUseResult>,
): Promise<ShopItemUseResult> {
  const seconds = BUFF_ITEM_COOLDOWN_SECONDS[itemKey] ?? ITEM_COOLDOWN_SECONDS;
  const blocked = await claimItemCooldown(itemKey, discordId, seconds);
  if (blocked) return blocked;
  try {
    const result = await fn();
    if (!result.success || result.shouldConsume === false) {
      await releaseItemCooldown(itemKey, discordId);
    }
    return result;
  } catch (err) {
    await releaseItemCooldown(itemKey, discordId);
    throw err;
  }
}

async function handleLoadedDice(discordId: string): Promise<ShopItemUseResult> {
  return withClaimedCooldown("loaded_dice_of_ruin", discordId, async () => {
    // 45% win 700k-1.6M / 55% lose 150k-600k (wallet then bank). EV ~= -39k.
    const win = Math.random() < 0.45;

    if (win) {
      const reward = randomInt(700_000, 1_600_000);
      const result = await addBalance(discordId, discordId, reward, "loaded_dice_win", { item: "loaded_dice_of_ruin" }, true);
      return {
        success: true,
        message: `**Loaded Dice — Win!**\n\nThe dice rolled in your favor.\n${Mascot.Emotes.Currency} **+${result.appliedAmount.toLocaleString("en-US")}** added to your wallet!`,
      };
    }

    const baseLoss = randomInt(150_000, 600_000);
    const crownMult = await checkCrownOfGreed(discordId);
    const lossAmount = Math.floor(baseLoss * crownMult);

    const collected = await applyItemFine(discordId, lossAmount, "loaded_dice_of_ruin");

    // Record potential soul ledger loss
    const { recordPotentialSoulLedgerLoss } = await import("./shopBuffs");
    await recordPotentialSoulLedgerLoss(discordId, collected);

    return {
      success: true,
      message: `**Loaded Dice — Loss!**\n\nThe dice betrayed you.\n${Mascot.Emotes.Currency} **-${collected.toLocaleString("en-US")}** lost (collected from your wallet, then bank).`,
    };
  });
}

async function handleCelestialHarp(discordId: string): Promise<ShopItemUseResult> {
  await upsertLuckModifier(discordId, 25, "celestial_harp", 6 * 3600 * 1000);
  const luck = await getCurrentLuck(discordId);
  return {
    success: true,
    message: `**Celestial Harp played!** A gentle melody fills the air.\nYour Luck is now **${luck}/100** (+25 for 6 hours).`,
  };
}

async function handleDemonicHarp(
  discordId: string,
  guildId: string,
  targetId?: string,
  member?: GuildMember,
): Promise<ShopItemUseResult> {
  if (!targetId) {
    return { success: false, shouldConsume: false, message: "You need to target a user. Usage: `use demonic harp @user`" };
  }
  if (targetId === discordId) {
    return { success: false, shouldConsume: false, message: "You cannot use the Demonic Harp on yourself." };
  }

  // Check if target is a bot via guild member fetch
  if (member?.guild) {
    const targetMember = await member.guild.members.fetch(targetId).catch(() => null);
    if (targetMember?.user.bot) {
      return { success: false, shouldConsume: false, message: "You cannot curse a bot." };
    }
  }

  // Check if target exists in the economy
  const targetUser = await prisma.user.findUnique({ where: { discordId: targetId } });
  if (!targetUser) {
    return { success: false, shouldConsume: false, message: "That user has no account here." };
  }

  // Check mirror reflection
  const reflected = await checkAndConsumeReflection(targetId);
  if (reflected) {
    // Curse bounces back to attacker
    await upsertLuckModifier(discordId, -25, "demonic_harp", 6 * 3600 * 1000);
    const luck = await getCurrentLuck(discordId);
    return {
      success: true,
      message: `**Mirror of Fate!** The Demonic Harp's curse was reflected back at you!\nYour Luck is now **${luck}/100** (-25 for 6 hours).`,
    };
  }

  await upsertLuckModifier(targetId, -25, "demonic_harp", 6 * 3600 * 1000);
  await redisService.set(`demonic_vulnerability:${targetId}`, { active: true }, 21600);

  const targetLuck = await getCurrentLuck(targetId);
  return {
    success: true,
    message: `**Demonic Harp played!** A dark melody curses <@${targetId}>.\nTheir Luck is now **${targetLuck}/100** (-25 for 6 hours). They are also more vulnerable to robbery.`,
  };
}

async function handlePandoraBox(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  return withClaimedCooldown("pandora_box", discordId, async () => {
    const roll = Math.random();
    const user = await prisma.user.findUnique({ where: { discordId }, include: { wallet: true } }) as any;

    if (!user?.wallet) return { success: false, message: "Could not find your wallet." };

    if (roll < 0.25) {
      // Money reward
      const reward = randomInt(300_000, 1_500_000);
      const result = await addBalance(discordId, discordId, reward, "pandora_box", { outcome: "reward" }, true);
      return {
        success: true,
        message: `**Pandora Box — Fortune!**\n\nA cascade of coins spills out!\n${Mascot.Emotes.Currency} **+${result.appliedAmount.toLocaleString("en-US")}** added to your wallet!`,
      };
    } else if (roll < 0.45) {
      // Luck boost
      await upsertLuckModifier(discordId, 15, "pandora_box", 2 * 3600 * 1000);
      const luck = await getCurrentLuck(discordId);
      return {
        success: true,
        message: `**Pandora Box — Blessing!**\n\nA golden light washes over you.\nYour Luck is now **${luck}/100** (+15 for 2 hours).`,
      };
    } else if (roll < 0.65) {
      // Rare item grant
      const grantableItems = ["tax_shield", "bandage", "counterfeit_kit", "lucky_coin", "padlock"];
      const itemKey = grantableItems[Math.floor(Math.random() * grantableItems.length)];
      const shopItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
          name: { equals: itemKey.replace(/_/g, " "), mode: "insensitive" },
        }),
      });

      if (shopItem) {
        await prisma.inventory.upsert({
          where: { userId_shopItemId: { userId: discordId, shopItemId: shopItem.id } },
          create: { userId: discordId, shopItemId: shopItem.id, amount: 1 },
          update: { amount: { increment: 1 } },
        });
        return {
          success: true,
          message: `**Pandora Box — Rare Find!**\n\nSomething useful tumbled out of the box.\nYou received: **${shopItem.name}**!`,
        };
      }
      // Fallback if item not found in DB
      const reward = 150_000;
      await addBalance(discordId, discordId, reward, "pandora_box", { outcome: "rare_fallback" }, true);
      return {
        success: true,
        message: `**Pandora Box — Rare Find!**\n\nSomething shiny fell out.\n${Mascot.Emotes.Currency} **+${reward.toLocaleString("en-US")}** added to your wallet!`,
      };
    } else if (roll < 0.85) {
      // Luck curse
      await upsertLuckModifier(discordId, -15, "pandora_box", 2 * 3600 * 1000);
      const luck = await getCurrentLuck(discordId);
      return {
        success: true,
        message: `**Pandora Box — Curse!**\n\nA dark shadow creeps over you.\nYour Luck is now **${luck}/100** (-15 for 2 hours).`,
      };
    } else {
      // Wallet damage
      const baseDamage = randomInt(200_000, 900_000);
      const crownMult = await checkCrownOfGreed(discordId);
      const damage = Math.floor(baseDamage * crownMult);
      const collected = await applyItemFine(discordId, damage, "pandora_box");

      const { recordPotentialSoulLedgerLoss } = await import("./shopBuffs");
      await recordPotentialSoulLedgerLoss(discordId, collected);

      return {
        success: true,
        message: `**Pandora Box — Disaster!**\n\nSomething terrible was released.\n${Mascot.Emotes.Currency} **-${collected.toLocaleString("en-US")}** drained (from your wallet, then bank).`,
      };
    }
  });
}

async function handleEclipseMask(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`eclipse_mask:${discordId}`, { active: true }, 21600);
  return {
    success: true,
    message: `**Eclipse Mask equipped!** Your next robbery attempt has **+12% success chance** and **+15% loot** on success. If you fail, expect a harsher penalty. (Expires in 6 hours.)`,
  };
}

async function handleMirrorOfFate(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`mirror_of_fate:${discordId}`, { active: true }, 86400);
  return {
    success: true,
    message: `**Mirror of Fate activated!** The next targeted curse or negative item used against you will be reflected back to the attacker. (Expires in 24 hours, one trigger only.)`,
  };
}

async function handleCrownOfGreed(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`crown_of_greed:${discordId}`, { multiplier: 1.25 }, 3600);
  return {
    success: true,
    message: `**Crown of Greed worn!** For the next hour, your income is boosted by **25%** — but your losses are increased by **25%** too.`,
  };
}

async function handleDevilContract(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  return withClaimedCooldown("devil_contract", discordId, async () => {
    // 30% jackpot 2.5M-3.5M, 70% the devil collects: 300k-700k (below the
    // 1.25M price). The -20% next-3-incomes curse applies either way — the
    // fine print always applies. Pre-curse EV ~= break-even.
    const jackpot = Math.random() < 0.30;
    const payout = jackpot ? randomInt(2_500_000, 3_500_000) : randomInt(300_000, 700_000);
    const result = await addBalance(discordId, discordId, payout, "devil_contract", { item: "devil_contract", jackpot }, true);

    // Merge with existing debt instead of stacking duplicates
    const existing = await prisma.activeEffect.findFirst({
      where: { userId: discordId, effectType: "devil_contract_debt" },
    });

    if (existing) {
      const currentUses = ((existing.meta as any)?.usesLeft ?? 0) as number;
      await prisma.activeEffect.update({
        where: { id: existing.id },
        data: { meta: { usesLeft: currentUses + 3 } },
      });
    } else {
      await prisma.activeEffect.create({
        data: {
          userId: discordId,
          effectType: "devil_contract_debt",
          value: 0.8,
          meta: { usesLeft: 3 },
          expiresAt: null,
        },
      });
    }

    const flavor = jackpot
      ? "The devil pays generously... this time."
      : "The devil smiles. You signed without reading.";

    return {
      success: true,
      message: `**Devil Contract signed!**\n\n${flavor}\n${Mascot.Emotes.Currency} **+${result.appliedAmount.toLocaleString("en-US")}** added to your wallet.\n\nThe fine print: your next **3 income events** are reduced by **20%**.`,
    };
  });
}

async function handleSoulLedger(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  // Check existing watcher
  const existing = await prisma.activeEffect.findFirst({
    where: {
      userId: discordId,
      effectType: "soul_ledger_watch",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (existing) {
    if (existing.value > 0) {
      // Loss has been recorded — check if ready
      const meta = existing.meta as { readyAt?: string } | null;
      const readyAt = meta?.readyAt ? new Date(meta.readyAt) : null;

      if (!readyAt || Date.now() < readyAt.getTime()) {
        const ts = readyAt ? Math.floor(readyAt.getTime() / 1000) : 0;
        return {
          success: true,
          shouldConsume: false,
          message: `**Soul Ledger is watching...**\n\nA loss of ${Mascot.Emotes.Currency} **${existing.value.toLocaleString("en-US")}** is being tracked.\nResolution available <t:${ts}:R>.`,
        };
      }

      // Ready to resolve — do NOT consume another item
      const lossAmount = existing.value;
      await prisma.activeEffect.delete({ where: { id: existing.id } });

      if (Math.random() < 0.5) {
        const refund = Math.floor(lossAmount * 1.5);
        const result = await addBalance(discordId, discordId, refund, "soul_ledger_refund", { lossAmount }, true);
        return {
          success: true,
          shouldConsume: false,
          message: `**Soul Ledger — Refund!**\n\nThe ledger collected on your loss of ${Mascot.Emotes.Currency} **${lossAmount.toLocaleString("en-US")}**.\nRefunded ${Mascot.Emotes.Currency} **+${result.appliedAmount.toLocaleString("en-US")}** (1.5×) to your wallet!`,
        };
      } else {
        return {
          success: true,
          shouldConsume: false,
          message: `**Soul Ledger — Nothing.**\n\nThe ledger watched your loss of ${Mascot.Emotes.Currency} **${lossAmount.toLocaleString("en-US")}** but collected nothing. The debt was written off.`,
        };
      }
    }

    // Already watching, no loss recorded yet — do NOT consume
    return {
      success: true,
      shouldConsume: false,
      message: `**Soul Ledger is already watching.**\n\nIt will record your next qualifying loss above ${Mascot.Emotes.Currency} **300,000**. You will be notified when resolution is available.`,
    };
  }

  // No watcher — first activation, consume the item
  await prisma.activeEffect.create({
    data: {
      userId: discordId,
      effectType: "soul_ledger_watch",
      value: 0,
      meta: {},
      expiresAt: null,
    },
  });

  return {
    success: true,
    shouldConsume: true,
    message: `**Soul Ledger activated!**\n\nThe ledger is now watching for your next qualifying loss above ${Mascot.Emotes.Currency} **300,000**. When a loss is recorded, return after **24 hours** to resolve it.`,
  };
}

// ---------------------------------------------------------------------------
// Job Store item handlers
// ---------------------------------------------------------------------------

async function handleRepairCoupon(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  // Use exact names from JOB_SHOP_CATALOG (EQUIPMENT only — basic gear)
  const gearCatalogItems = JOB_SHOP_CATALOG.filter(i => i.itemType === "EQUIPMENT");

  for (const catalogItem of gearCatalogItems) {
    // Look up the ShopItem in DB by exact catalog name
    const gearInDb = await prisma.shopItem.findFirst({
      where: globalCatalogGuildFilter({
        name: { equals: catalogItem.name, mode: "insensitive" },
      }),
    });
    if (!gearInDb) continue;

    const inv = await prisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: discordId, shopItemId: gearInDb.id } },
    });
    if (!inv || inv.amount < 1) continue;

    const meta = (inv.meta as any) ?? {};
    const durability = meta.durability ?? 100;

    // Only repair if actually damaged (< 100)
    if (durability < 100) {
      await prisma.inventory.update({
        where: { id: inv.id },
        data: { meta: { ...meta, durability: 100 } },
      });
      return {
        success: true,
        message: `**Repair Coupon used!**\n\n**${catalogItem.name}** fully repaired. Durability restored to **100/100**.`,
      };
    }
  }

  return {
    success: true,
    shouldConsume: false,
    message: `**Repair Coupon:** All your job gear is already in perfect condition. Save it for when you need it.`,
  };
}

async function handleWarrantyCard(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`warranty_card:${discordId}`, { active: true }, 604800); // 7 days
  return { success: true, message: `**Warranty Card activated!**\n\nYour gear is protected from the next break event for 7 days. Activates automatically during your next shift.` };
}

async function handleStressPills(discordId: string): Promise<ShopItemUseResult> {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return { success: false, message: "User not found." };
  const currentStress = user.jobStress ?? 0;
  if (currentStress <= 0) {
    return { success: true, shouldConsume: false, message: "**Stress Pills:** Your stress is already at zero. Save them for when you need them." };
  }
  const newStress = Math.max(0, currentStress - 20);
  await prisma.user.update({ where: { discordId }, data: { jobStress: newStress } });
  return { success: true, message: `**Stress Pills taken!**\n\nJob stress reduced: **${currentStress}** → **${newStress}**.` };
}

async function handleEnergyFlask(discordId: string): Promise<ShopItemUseResult> {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return { success: false, message: "User not found." };
  if (!user.lastShift) {
    return { success: true, shouldConsume: false, message: "**Energy Flask:** You haven't worked yet — no cooldown to reduce." };
  }
  const REDUCTION_MS = 2 * 3600 * 1000; // 2 hours
  const newLastShift = new Date(user.lastShift.getTime() - REDUCTION_MS);
  await prisma.user.update({ where: { discordId }, data: { lastShift: newLastShift } });
  const remaining = Math.max(0, user.lastShift.getTime() - Date.now() - REDUCTION_MS);
  return { success: true, message: `**Energy Flask consumed!**\n\nWork cooldown reduced by **2 hours**. ${remaining <= 0 ? "You can work again now!" : `~${Math.floor(remaining / 60_000)}m remaining.`}` };
}

async function handleFocusHeadphones(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`focus_headphones:${discordId}`, { shiftsLeft: 3, repMult: 2 }, 86400 * 3); // 3 days max
  return { success: true, message: `**Focus Headphones on!**\n\nSector reputation gain is **doubled (+10 instead of +5)** for your next **3 successful shifts** (expires in 3 days).` };
}

async function handleLuckyTie(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`lucky_tie:${discordId}`, { active: true }, 86400); // 24 hours
  return { success: true, message: `**Lucky Tie equipped!**\n\nJob events, interviews, and promotions will favour you for the next **24 hours**.` };
}

async function handlePremiumToolsOil(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`tools_oil:${discordId}`, { shiftsLeft: 5 }, 86400 * 7); // 7 days max
  return { success: true, message: `**Premium Tools Oil applied!**\n\nGear durability loss will be reduced for your next **5 shifts**.` };
}

async function handleEmergencyPager(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`emergency_pager:${discordId}`, { active: true }, 86400 * 3); // 3 days
  return { success: true, message: `**Emergency Pager armed!**\n\nYour next critical job event failure will be redirected. The pager activates automatically during your shift.` };
}

async function handleOvertimeContract(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const user = await prisma.user.findUnique({ where: { discordId }, include: { wallet: true } });
  if (!user) return { success: false, message: "User not found." };
  // Clear the work cooldown to allow an extra shift
  const REDUCTION_MS = user.lastShift ? user.lastShift.getTime() - Date.now() + 1 : 0;
  if (REDUCTION_MS > 0) {
    await prisma.user.update({ where: { discordId }, data: { lastShift: new Date(Date.now() - 3600001) } });
  }
  // Add extra stress and flag a gear damage chance via Redis
  const newStress = Math.min(100, (user.jobStress ?? 0) + 15);
  await prisma.user.update({ where: { discordId }, data: { jobStress: newStress } });
  await redisService.set(`overtime_active:${discordId}`, { gearRisk: true }, 3600);
  return { success: true, message: `**Overtime Contract signed!**\n\nWork cooldown cleared — you can take an extra shift right now. But beware: stress +15 and there's a gear damage risk on this shift.` };
}

async function handleBlackMarketResume(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const roll = Math.random();
  if (roll < 0.65) {
    // Success: credit lifetime shifts toward job requirements
    const shiftBoost = randomInt(3, 8);
    await prisma.user.update({ where: { discordId }, data: { shiftsWorked: { increment: shiftBoost } } });
    return { success: true, message: `**Black Market Resume — Success!**\n\nThe résumé passed all checks. **+${shiftBoost} lifetime shifts** credited to your career record.` };
  } else {
    // Backfire: stress only — the lifetime shift counter never decreases
    const stressPenalty = randomInt(10, 25);
    const user = await prisma.user.findUnique({ where: { discordId } });
    await prisma.user.update({
      where: { discordId },
      data: { jobStress: Math.min(100, (user?.jobStress ?? 0) + stressPenalty) },
    });
    return { success: true, message: `**Black Market Resume — Exposed!**\n\nHR caught the forgery. Stress **+${stressPenalty}**. You're lucky you still have a job.` };
  }
}

async function handleCorporateBlessing(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  await redisService.set(`corporate_blessing:${discordId}`, { active: true }, 3600);
  return { success: true, message: `**Corporate Blessing invoked!**\n\nA golden memo has been filed on your behalf. Your next shift has a chance at a **massive payout** — but if you fail, expect gear damage and heavy stress. Make it count.` };
}

// ---------------------------------------------------------------------------
// Uni Store Handlers
// ---------------------------------------------------------------------------

async function handleStudyLaptop(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`study_laptop:${discordId}`, { sessionsLeft: 5, xpMult: 1.25 }, 604800);
  return { success: true, message: `**Study Laptop activated!**\n\n1.25x study XP for your next **5** study sessions (expires in 7 days).` };
}

async function handleTextbookBundle(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`textbook_bundle:${discordId}`, { sessionsLeft: 3, xpMult: 1.35 }, 172800);
  return { success: true, message: `**Textbook Bundle activated!**\n\n1.35x study XP for your next **3** study sessions (expires in 48h).` };
}

async function handleLabKit(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`lab_kit:${discordId}`, { sessionsLeft: 3, failReduction: 0.12, xpMult: 1.15 }, 259200);
  return { success: true, message: `**Lab Kit activated!**\n\n12% failure rescue + 1.15x XP for your next **3** study sessions (expires in 72h).` };
}

async function handleCalculatorPro(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`calculator_pro:${discordId}`, { sessionsLeft: 3, failRescue: 0.08, xpMult: 1.15 }, 172800);
  return { success: true, message: `**Calculator Pro activated!**\n\n8% rescue chance on failed challenges + 1.15x XP for **3** sessions (expires in 48h).` };
}

async function handleCoffeeThermos(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const edu = await prisma.userEducation.findUnique({ where: { userId: discordId } });
  if (!edu || !edu.lastStudy) {
    return { success: true, message: `You drink the coffee... but you didn't have a cooldown. **Wasted!**` };
  }

  const cooldownMs = DEFAULT_STUDY_COOLDOWN_SECONDS * 1000;
  const elapsed = Date.now() - new Date(edu.lastStudy).getTime();

  if (elapsed >= cooldownMs) {
    return { success: true, message: `You drink the coffee... but you didn't have a cooldown. **Wasted!**` };
  }

  const pastTime = new Date(Date.now() - cooldownMs);
  await prisma.userEducation.update({
    where: { userId: discordId },
    data: { lastStudy: pastTime },
  });

  return { success: true, message: `**Study cooldown cleared!** You can study again now.` };
}

async function handleFocusNotes(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`focus_notes:${discordId}`, { active: true, bonusXp: 45 }, 172800);
  return { success: true, message: `**Focus Notes activated!**\n\n+45 bonus XP on your next successful study session (expires in 48h).` };
}

async function handleCheatSheet(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`cheat_sheet:${discordId}`, { active: true }, 86400);
  return { success: true, message: `**Cheat Sheet prepared!**\n\nUse it on your next exam. 70% chance of a massive XP boost — but 30% chance of getting caught with **severe penalties** (-15% XP, +15 stress, -10% wallet).` };
}

async function handleTutorPass(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`tutor_pass:${discordId}`, { active: true, xpMult: 1.6, failReduction: 0.15 }, 172800);
  return { success: true, message: `**Tutor Pass activated!**\n\n1.6x XP + 15% failure rescue on your next study session (expires in 48h).` };
}

async function handleScholarshipLetter(discordId: string): Promise<ShopItemUseResult> {
  const cdKey = `scholarship_letter_cd:${discordId}`;
  const cd = await redisService.get<{ used: boolean }>(cdKey);
  if (cd && !isTester(discordId)) {
    return { success: false, shouldConsume: false, message: `You must wait before submitting another scholarship application.` };
  }

  const roll = Math.random();
  let resultMsg: string;

  if (roll < 0.45) {
    const reward = Math.floor(50_000 + Math.random() * 150_000);
    const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
    if (wallet) {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: reward } } });
    }
    resultMsg = `**Scholarship Approved — Financial Aid!**\n\nYou received **${reward.toLocaleString()}** coins!`;
  } else if (roll < 0.80) {
    const edu = await prisma.userEducation.findUnique({ where: { userId: discordId } });
    if (edu) {
      const xpBoost = 25 + Math.floor(Math.random() * 125);
      await prisma.userEducation.update({ where: { userId: discordId }, data: { educationXp: { increment: xpBoost } } });
      resultMsg = `**Scholarship Approved — Academic Merit!**\n\nYou gained **+${xpBoost} Education XP** (now ${edu.educationXp + xpBoost}).`;
    } else {
      const reward = Math.floor(50_000 + Math.random() * 100_000);
      const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
      if (wallet) {
        await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: reward } } });
      }
      resultMsg = `**Scholarship Approved — General Fund!**\n\nYou're not enrolled, so you received **${reward.toLocaleString()}** coins instead.`;
    }
  } else {
    resultMsg = `**Scholarship Rejected.**\n\nYour application was not accepted this time. Better luck next time.`;
  }

  if (!isTester(discordId)) {
    await redisService.set(cdKey, { used: true }, 3600);
  }
  return { success: true, message: resultMsg };
}

// ---------------------------------------------------------------------------
// Cock Store Handlers
// ---------------------------------------------------------------------------

async function getChickenMeta(discordId: string, _guildId: string) {
  const chickenItem = await prisma.shopItem.findFirst({
    where: globalCatalogGuildFilter({
      name: { equals: "Chicken", mode: "insensitive" },
    }),
  });
  if (!chickenItem) return { chickenInv: null, meta: {} as any };

  const chickenInv = await prisma.inventory.findUnique({
    where: { userId_shopItemId: { userId: discordId, shopItemId: chickenItem.id } },
  });
  if (!chickenInv) return { chickenInv: null, meta: {} as any };

  const meta = (chickenInv.meta as any) || {};
  return { chickenInv, meta };
}

const FEED_XP: Record<string, number> = {
  basic_feed: 10,
  protein_feed: 35,
  champion_feed: 120,
};

async function handleCockFeed(
  itemKey: string,
  discordId: string,
  guildId: string,
): Promise<ShopItemUseResult> {
  const { chickenInv, meta } = await getChickenMeta(discordId, guildId);
  if (!chickenInv) return { success: false, shouldConsume: false, message: "You don't own a chicken!" };

  const feedKey = `cock_feed_count:${discordId}`;
  const todayFeeds = (await redisService.get<number>(feedKey)) ?? 0;
  const DAILY_CAP = 5;

  if (todayFeeds >= DAILY_CAP) {
    return { success: false, shouldConsume: false, message: `You've used all **${DAILY_CAP}** feed slots today! Resets daily.` };
  }

  const xpPerFeed = FEED_XP[itemKey] ?? 10;
  const xpGain = xpPerFeed;

  let level = meta.level || 0;
  let xp = (meta.xp || 0) + xpGain;
  let levelsGained = 0;

  while (xp >= (level + 1) * 100) {
    xp -= (level + 1) * 100;
    level++;
    levelsGained++;
  }

  await prisma.inventory.update({
    where: { id: chickenInv.id },
    data: { meta: { ...meta, level, xp } },
  });

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000);
  await redisService.set(feedKey, todayFeeds + 1, secondsUntilMidnight);

  const { questBus } = require("./questEvents");
  questBus.emit("cockfight:feed", { discordId });

  let msg = `Fed your chicken! **+${xpGain} XP**`;
  if (levelsGained > 0) msg += `\n🎉 **Level Up!** Now Level ${level}! (+${levelsGained})`;
  msg += `\n📊 ${xp}/${(level + 1) * 100} XP | Feeds remaining: **${DAILY_CAP - (todayFeeds + 1)}**/${DAILY_CAP}`;

  return { success: true, message: msg };
}

async function handleAgilityVitamins(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const { chickenInv, meta } = await getChickenMeta(discordId, guildId);
  if (!chickenInv) return { success: false, shouldConsume: false, message: "You don't own a chicken!" };

  const stats = ["strength", "agility", "defense"] as const;
  const allMaxed = stats.every(s => (meta[s] || 0) >= 10);
  if (allMaxed) {
    return { success: false, shouldConsume: false, message: "Your chicken's stats are all maxed at **10**!" };
  }

  const available = stats.filter(s => (meta[s] || 0) < 10);
  const stat = available[Math.floor(Math.random() * available.length)];
  const current = meta[stat] || 0;
  meta[stat] = current + 1;

  await prisma.inventory.update({ where: { id: chickenInv.id }, data: { meta } });

  return { success: true, message: `${Mascot.Emotes.Accept} Your chicken's **${stat.toUpperCase()}** increased! ${current} → **${current + 1}** / 10` };
}

async function handleFeatherBandage(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const { chickenInv, meta } = await getChickenMeta(discordId, guildId);
  if (!chickenInv) return { success: false, shouldConsume: false, message: "You don't own a chicken!" };
  if (meta.critical) return { success: false, shouldConsume: false, message: "Your chicken is in **critical condition**! Only a **Phoenix Serum** can save it." };
  if (!meta.injured) return { success: false, shouldConsume: false, message: "Your chicken isn't injured!" };

  delete meta.injured;
  await prisma.inventory.update({ where: { id: chickenInv.id }, data: { meta } });

  return { success: true, message: `${Mascot.Emotes.Accept} Injuries healed! Your chicken is ready to fight.` };
}

async function handleTrainingWhistle(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const { chickenInv, meta } = await getChickenMeta(discordId, guildId);
  if (!chickenInv) return { success: false, shouldConsume: false, message: "You don't own a chicken!" };
  if (!meta.training) return { success: false, shouldConsume: false, message: "Your chicken isn't training!" };

  const stat = meta.training.stat;
  meta[stat] = (meta[stat] || 0) + 1;
  delete meta.training;
  await prisma.inventory.update({ where: { id: chickenInv.id }, data: { meta } });

  return { success: true, message: `${Mascot.Emotes.Accept} Training complete! **${stat.toUpperCase()}** +1 (now ${meta[stat]}).` };
}

async function handlePhoenixSerum(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const cdKey = `phoenix_serum_cd:${discordId}`;
  const onCooldown = await redisService.get<{ until: number }>(cdKey);
  if (onCooldown && !isTester(discordId)) {
    const expiresAt = Math.floor(onCooldown.until / 1000);
    return { success: false, shouldConsume: false, message: `Phoenix Serum on cooldown! Available <t:${expiresAt}:R>.` };
  }

  const { chickenInv, meta } = await getChickenMeta(discordId, guildId);
  if (!chickenInv) return { success: false, shouldConsume: false, message: "You don't own a chicken!" };
  if (!meta.injured && !meta.training && !meta.critical) {
    return { success: false, shouldConsume: false, message: "Your chicken doesn't need recovery right now!" };
  }

  const effects: string[] = [];

  if (meta.critical) {
    delete meta.critical;
    effects.push("**SAVED FROM DEATH!** Critical condition cleared");
  }
  if (meta.injured) { delete meta.injured; effects.push("Injury healed"); }
  if (meta.training) {
    const stat = meta.training.stat;
    meta[stat] = (meta[stat] || 0) + 1;
    delete meta.training;
    effects.push(`Training completed (${stat.toUpperCase()} +1)`);
  }

  await prisma.inventory.update({ where: { id: chickenInv.id }, data: { meta } });

  const until = Date.now() + 86_400_000;
  if (!isTester(discordId)) {
    await redisService.set(cdKey, { until }, 86400);
  }

  return { success: true, message: `**Phoenix Serum activated!**\n${effects.map(e => `✅ ${e}`).join("\n")}` };
}

async function handleCockEquip(itemKey: string, discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const { chickenInv, meta } = await getChickenMeta(discordId, guildId);
  if (!chickenInv) return { success: false, shouldConsume: false, message: "You don't own a chicken!" };

  const EQUIP_MAP: Record<string, { slot: string; name: string }> = {
    iron_spurs: { slot: "weapon", name: "Iron Spurs" },
    guard_vest: { slot: "armor", name: "Guard Vest" },
  };
  const equipInfo = EQUIP_MAP[itemKey];
  if (!equipInfo) return { success: false, shouldConsume: false, message: "Item not equippable." };

  const shopItem = await prisma.shopItem.findFirst({
    where: globalCatalogGuildFilter({
      name: { equals: equipInfo.name, mode: "insensitive" },
    }),
  });

  if (!meta.equipment) meta.equipment = {};
  const oldItem = meta.equipment[equipInfo.slot]?.name ?? "None";
  meta.equipment[equipInfo.slot] = { id: shopItem?.id ?? itemKey, name: equipInfo.name };

  if (meta.equippedItem) delete meta.equippedItem;
  if (meta.equippedItemName) delete meta.equippedItemName;

  await prisma.inventory.update({ where: { id: chickenInv.id }, data: { meta } });

  return {
    success: true,
    shouldConsume: false,
    message: `${Mascot.Emotes.Accept} **${equipInfo.name}** equipped to **${equipInfo.slot}** slot!\nReplaced: ${oldItem}`,
  };
}

// ---------------------------------------------------------------------------
// Blueprint Handlers
// ---------------------------------------------------------------------------

async function handleRareBlueprint(discordId: string): Promise<ShopItemUseResult> {
  return handleBlueprintUnlock(discordId, "Rare");
}

async function handleLegendaryBlueprint(discordId: string): Promise<ShopItemUseResult> {
  return handleBlueprintUnlock(discordId, "Legendary");
}

async function handleBlueprintUnlock(
  discordId: string,
  tier: "Rare" | "Legendary",
): Promise<ShopItemUseResult> {
  const unlocked = await getUnlockedRecipeKeys(discordId);
  const available = HUNT_CRAFT_RECIPES.filter(
    (r) => r.tier === tier && !unlocked.has(r.key),
  );

  if (available.length === 0) {
    return {
      success: false,
      message: `You've already unlocked all ${tier} recipes! The blueprint has been refunded.`,
      shouldConsume: false,
    };
  }

  const recipe = available[Math.floor(Math.random() * available.length)];
  await prisma.userCraftUnlock.upsert({
    where: { userId_recipeKey: { userId: discordId, recipeKey: recipe.key } },
    create: { userId: discordId, recipeKey: recipe.key },
    update: {},
  });

  return {
    success: true,
    message: `${Mascot.Emotes.Accept} Unlocked: **${recipe.name}** — view it with \`!hunt craft\``,
    shouldConsume: true,
  };
}
