import { ContainerBuilder, Message, MessageFlags, TextDisplayBuilder } from "discord.js";
import { Mascot } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { checkCasinoCooldown, setCasinoCooldown, formatCasinoCooldownMessage } from "../../services/casinoCooldownService";
import { getGameBetLimits } from "../../utils/gameUtils";
import { questBus } from "../../services/questEvents";
import { checkLuckyCoin, checkCrownOfGreed, recordPotentialSoulLedgerLoss, getCurrentLuck } from "../../services/shopBuffs";
import { getGuildPrefix } from "../../utils/guildContext";

export const CHERRY = "<:cherri:1446428169786622053>";
export const BANANA = "<:banano:1446428190837968989>";
export const GRAPES = "<:graps:1446428294483542040>";
export const MELON = "<:watermelon2:1446428567402709115>";
export const BELL = "<:Bel:1446428665176129716>";
export const GEM = "<:Gemm:1446428771266592819>";
export const SEVEN = "<:sevenn:1446428916867661846>";

const SYMBOLS = [CHERRY, BANANA, GRAPES, MELON, BELL, GEM, SEVEN];

export const SLOTS_PAYOUT_TABLE = [
  { chance: 0.005, multiplier: 20, symbols: [SEVEN] },
  { chance: 0.015, multiplier: 10, symbols: [GEM] },
  { chance: 0.040, multiplier: 5, symbols: [BELL] },
  { chance: 0.070, multiplier: 3, symbols: [GRAPES, MELON] },
  { chance: 0.150, multiplier: 2, symbols: [CHERRY, BANANA] }
];

function buildSlotsContainer(title: string, body: string, accent: number) {
  return new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body),
    );
}

export function getSpinResult(): { reels: string[], win: boolean, multiplier: number, payout: number } {
  return getSpinResultWithLuck(50);
}

export function getSpinResultWithLuck(luck: number): { reels: string[], win: boolean, multiplier: number, payout: number } {
  const roll = Math.random();
  const bias = ((luck - 50) / 100) * 0.05;
  const adjustedRoll = Math.max(0, Math.min(1, roll - bias));

  let cumulative = 0;
  for (const tier of SLOTS_PAYOUT_TABLE) {
    cumulative += tier.chance;
    if (adjustedRoll < cumulative) {
      const symbol = tier.symbols[Math.floor(Math.random() * tier.symbols.length)];
      return {
        reels: [symbol, symbol, symbol],
        win: true,
        multiplier: tier.multiplier,
        payout: 0
      };
    }
  }

  let r1, r2, r3;
  do {
    r1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    r2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    r3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  } while (r1 === r2 && r2 === r3);

  return {
    reels: [r1, r2, r3],
    win: false,
    multiplier: 0,
    payout: 0
  };
}

export async function handleSlots(message: Message, args: string[]) {
  const prefix = await getGuildPrefix(message.guildId!);
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  const amount = parseBetAmount(args[0], user.wallet!.balance);
  

  if (!Number.isInteger(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Bet", `Usage: \`${prefix}slots <amount>\``)] });
  }

  const { min, max } = getGameBetLimits("slots");
  if (amount < min) {
    return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Slots is **${fmtCurrency(min)}**.`)] });
  }
  if (amount > max) {
    return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Slots is **${fmtCurrency(max)}**.`)] });
  }

  const cd = await checkCasinoCooldown("slots", message.author.id);
  if (cd.active) {
    const msg = cd.unavailable
      ? "Casino cooldown service is temporarily unavailable. Try again soon."
      : formatCasinoCooldownMessage("slots", cd.availableAtUnix!);
    const cdMsg = await message.reply({ embeds: [errorEmbed(message.author, "Cooldown Active", msg)] });
    setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
    return;
  }

  if (!user.wallet || user.wallet.balance < amount) {
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money in your wallet.")] });
  }

  const luckyCoinMult = await checkLuckyCoin(message.author.id);
  const crownMult = await checkCrownOfGreed(message.author.id);
  const luck = await getCurrentLuck(message.author.id);
  const result = getSpinResultWithLuck(luck);
  const [reel1, reel2, reel3] = result.reels;
  const win = result.win;

  // Crown of Greed: adjust net profit on win, increase effective stake on loss
  const baseGross = win ? Math.floor(amount * result.multiplier * luckyCoinMult) : 0;
  let adjustedGross: number;
  let effectiveStake = amount;
  if (win) {
    const netProfit = baseGross - amount;
    adjustedGross = amount + Math.floor(netProfit * crownMult);
  } else {
    effectiveStake = Math.min(Math.floor(amount * crownMult), user.wallet.balance);
    adjustedGross = 0;
  }

  if (!win && amount > 300_000) {
    await recordPotentialSoulLedgerLoss(user.discordId, effectiveStake);
  }

  const payout = await placeBetWithTransaction(
    user.discordId,
    user.wallet.id,
    "slots",
    effectiveStake,
    "spin",
    win,
    adjustedGross,
    message.guildId!
  );

  await setCasinoCooldown("slots", user.discordId, message.guildId!);
  questBus.emit("casino:play", { discordId: user.discordId, bet: amount });
  if (win) questBus.emit("casino:win", { discordId: user.discordId, game: "slots" });

  await import("../../utils/discordLogger").then(({ logToChannel }) => {
    logToChannel(message.client, {
      guild: message.guild!,
      type: "ECONOMY",
      title: "Slots Game",
      description: `**User:** ${message.author.toString()}\n**Reels:** [ ${reel1} | ${reel2} | ${reel3} ]\n**Bet:** ${fmtCurrency(amount)}\n**Payout:** ${fmtCurrency(payout)}`,
      color: win ? 0x00FF00 : 0xFF0000,
      thumbnail: message.author.displayAvatarURL()
    }).catch(() => { });
  });

  const wallet = user.wallet.balance - amount + payout;
  const body = [
    `### [ ${reel1} | ${reel2} | ${reel3} ]`,
    win
      ? `Jackpot: **${fmtCurrency(payout)}** (x${result.multiplier})`
      : `Lost: **${fmtCurrency(amount)}**`,
    `Wallet: **${fmtCurrency(wallet)}**`
  ].join("\n");

  return message.reply({
    components: [buildSlotsContainer(win ? "Slots Won" : "Slots Lost", body, win ? 0x2ECC71 : 0xE74C3C)],
    flags: MessageFlags.IsComponentsV2
  });
}
