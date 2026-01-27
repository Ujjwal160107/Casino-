import { Message, EmbedBuilder, Colors } from "discord.js";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { formatDuration } from "../../utils/format";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";

export const CHERRY = "<:cherri:1446428169786622053>";
export const BANANA = "<:banano:1446428190837968989>";
export const GRAPES = "<:graps:1446428294483542040>";
export const MELON = "<:watermelon2:1446428567402709115>";
export const BELL = "<:Bel:1446428665176129716>";
export const GEM = "<:Gemm:1446428771266592819>";
export const SEVEN = "<:sevenn:1446428916867661846>";

const SYMBOLS = [CHERRY, BANANA, GRAPES, MELON, BELL, GEM, SEVEN];

// Probabilities for each tier (cumulative check)
// 2x: 15%, 3x: 7%, 5x: 4%, 10x: 1.5%, 20x: 0.5%
// Total Win Chance: ~28%
const PROBABILITIES = [
  { chance: 0.005, multiplier: 20, symbols: [SEVEN] },
  { chance: 0.015, multiplier: 10, symbols: [GEM] },
  { chance: 0.040, multiplier: 5, symbols: [BELL] },
  { chance: 0.070, multiplier: 3, symbols: [GRAPES, MELON] },
  { chance: 0.150, multiplier: 2, symbols: [CHERRY, BANANA] }
];

export function getSpinResult(): { reels: string[], win: boolean, multiplier: number, payout: number } {
  const roll = Math.random();
  let cumulative = 0;

  for (const tier of PROBABILITIES) {
    cumulative += tier.chance;
    if (roll < cumulative) {
      // WINNER
      const symbol = tier.symbols[Math.floor(Math.random() * tier.symbols.length)];
      return {
        reels: [symbol, symbol, symbol],
        win: true,
        multiplier: tier.multiplier,
        payout: 0 // Calculated later based on bet
      };
    }
  }

  // LOSER - Generate 3 reels that NOT all match
  // We pick random symbols until we get a non-win state
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
  const config = await getGuildConfig(message.guildId!);
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  const bet = parseBetAmount(args[0], user.wallet!.balance);

  if (isNaN(bet) || bet <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Bet", `Usage: \`${config.prefix}slots <amount>\``)] });
  }
  const amount = bet;
  const emoji = config.currencyEmoji;
  const { min, max } = getGameBetLimits(config, "slots");
  if (amount < min) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Slots is **${fmtCurrency(min, emoji)}**.`)]
    });
  }
  if (amount > max) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Slots is **${fmtCurrency(max, emoji)}**.`)]
    });
  }
  const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
  const cdSeconds = cooldowns["slots"] || 0;
  if (cdSeconds > 0) {
    const key = `game:slots:${message.guildId}:${message.author.id}`;
    const remaining = checkCooldown(key, cdSeconds);
    if (remaining > 0) {
      const expire = getCooldownExpiry(key);
      const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
      return message.reply({
        embeds: [errorEmbed(message.author, "Cooldown Active", `${Mascot.Emotes.Angry} Please wait <t:${ts}:R> before playing Slots again.`)]
      });
    }
  }
  if (user.wallet!.balance < amount) {
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money.")] });
  }

  // Use new Probability Logic
  const result = getSpinResult();
  const reel1 = result.reels[0];
  const reel2 = result.reels[1];
  const reel3 = result.reels[2];

  let win = result.win;
  let multiplier = result.multiplier;
  let payout = amount * multiplier;

  let actualPayout = payout;
  try {
    actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "slots", amount, "spin", win, payout, message.guildId!);
  } catch (e) {
    actualPayout = await placeBetFallback(user.wallet!.id, user.id, "slots", amount, "spin", win, payout, message.guildId!);
  }
  payout = actualPayout;

  await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
  if (win) await updateQuestProgress(user.id, "WIN_SLOTS").catch(console.error);

  // LOGGING
  const logColor = win ? 0x00FF00 : 0xFF0000;
  await import("../../utils/discordLogger").then(({ logToChannel }) => {
    logToChannel(message.client, {
      guild: message.guild!,
      type: "ECONOMY",
      title: "Slots Game",
      description: `**User:** ${message.author.toString()}\n**Reels:** [ ${reel1} | ${reel2} | ${reel3} ]\n**Bet:** ${fmtCurrency(amount, emoji)}\n**Payout:** ${fmtCurrency(payout, emoji)}`,
      color: logColor,
      thumbnail: message.author.displayAvatarURL()
    }).catch(() => { });
  });


  const eTitle = "<a:casino:1445732641545654383>";
  const embed = new EmbedBuilder()
    .setTitle(`${eTitle} Slots`)
    .setColor(win ? Colors.Green : Colors.Red)
    .setDescription(
      `**[ ${reel1} | ${reel2} | ${reel3} ]**\n\n` +
      (win
        ? `**JACKPOT!** You won **${fmtCurrency(payout, emoji)}**! (x${multiplier})`
        : `Better luck next time... You lost **${fmtCurrency(amount, emoji)}**.`)
    )
    .setFooter({ text: `${Mascot.Name} • ${message.author.username}'s Wallet: ${(user.wallet!.balance - amount + payout).toLocaleString('en-US')}` });

  if (win) {
    const url = getEmoteUrl(Mascot.Emotes.Money);
    if (url) embed.setThumbnail(url);
  } else {
    const url = getEmoteUrl(Mascot.Emotes.Fail);
    if (url) embed.setThumbnail(url);
  }

  return message.reply({ embeds: [embed] });
}