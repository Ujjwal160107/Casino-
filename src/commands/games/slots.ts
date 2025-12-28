import { Message, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { formatDuration } from "../../utils/format";

const CHERRY = "<:cherri:1446428169786622053>";
const BANANA = "<:banano:1446428190837968989>";
const GRAPES = "<:graps:1446428294483542040>";
const MELON = "<:watermelon2:1446428567402709115>";
const BELL = "<:Bel:1446428665176129716>";
const GEM = "<:Gemm:1446428771266592819>";
const SEVEN = "<:sevenn:1446428916867661846>";
const SYMBOLS = [CHERRY, BANANA, GRAPES, MELON, BELL, GEM, SEVEN];
const MULTIPLIERS: Record<string, number> = {
  [CHERRY]: 2,
  [BANANA]: 2,
  [GRAPES]: 3,
  [MELON]: 3,
  [BELL]: 5,
  [GEM]: 10,
  [SEVEN]: 20
};

export async function handleSlots(message: Message, args: string[]) {
  const config = await getGuildConfig(message.guildId!);
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  const bet = parseBetAmount(args[0], user.wallet!.balance);

  if (isNaN(bet) || bet <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Bet", `Usage: \`${config.prefix}slots <amount>\``)] });
  }
  const amount = bet;
  const emoji = config.currencyEmoji;
  const minBet = config.minBet;
  if (amount < minBet) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet is **${fmtCurrency(minBet, emoji)}**.`)]
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
        embeds: [errorEmbed(message.author, "Cooldown Active", `<:cooldown:1454025354631970826> Please wait <t:${ts}:R> before playing Slots again.`)]
      });
    }
  }
  if (user.wallet!.balance < amount) {
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money.")] });
  }
  const reel1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const reel2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const reel3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  let win = false;
  let payout = 0;
  let multiplier = 0;
  if (reel1 === reel2 && reel2 === reel3) {
    win = true;
    multiplier = MULTIPLIERS[reel1];
    payout = amount * multiplier;
  }
  let actualPayout = payout;
  try {
    actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "slots", amount, "spin", win, payout, message.guildId!);
  } catch (e) {
    actualPayout = await placeBetFallback(user.wallet!.id, user.id, "slots", amount, "spin", win, payout, message.guildId!);
  }
  payout = actualPayout;
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
    .setFooter({ text: `${message.author.username}'s Wallet: ${(user.wallet!.balance - amount + payout).toLocaleString()}` });
  return message.reply({ embeds: [embed] });
}