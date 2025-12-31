import { Message, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { formatDuration } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";

export async function handleCoinflip(message: Message, args: string[]) {
  const config = await getGuildConfig(message.guildId!);
  const amountStr = args[0];
  const choiceRaw = (args[1] || "").toLowerCase();
  if (!amountStr || !choiceRaw) {
    return message.reply({
      embeds: [
        errorEmbed(
          message.author,
          "Invalid Usage",
          `Usage: \`${config.prefix}cf <amount> <heads|tails>\``
        ),
      ],
    });
  }
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  const amount = parseBetAmount(amountStr, user.wallet!.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply({
      embeds: [
        errorEmbed(
          message.author,
          "Invalid Wager",
          "Please bet a valid positive amount."
        ),
      ],
    });
  }
  const emoji = config.currencyEmoji;
  let choice: "heads" | "tails";
  if (["heads", "head", "h"].includes(choiceRaw)) choice = "heads";
  else if (["tails", "tail", "t"].includes(choiceRaw)) choice = "tails";
  else {
    return message.reply({
      embeds: [
        errorEmbed(
          message.author,
          "Invalid Choice",
          "Please choose `heads` or `tails`."
        ),
      ],
    });
  }
  const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
  const cdSeconds = cooldowns["coinflip"] || 0;
  if (cdSeconds > 0) {
    const key = `game:coinflip:${message.guildId}:${message.author.id}`;
    const remaining = checkCooldown(key, cdSeconds);
    if (remaining > 0) {
      const expire = getCooldownExpiry(key);
      const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
      return message.reply({
        embeds: [errorEmbed(message.author, "Cooldown Active", `${Mascot.Emotes.Angry} Please wait <t:${ts}:R> before flipping again.`)]
      });
    }
  }


  const { min, max } = getGameBetLimits(config, "coinflip");
  if (amount < min) {
    return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Coinflip is **${fmtCurrency(min, emoji)}**.`)] });
  }
  if (amount > max) {
    return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Coinflip is **${fmtCurrency(max, emoji)}**.`)] });
  }
  if (!user.wallet || user.wallet.balance < amount) {
    return message.reply({
      embeds: [
        errorEmbed(
          message.author,
          "Insufficient Funds",
          "You don't have enough money."
        ),
      ],
    });
  }
  const isHeads = Math.random() < 0.5;
  const result = isHeads ? "heads" : "tails";
  const didWin = choice === result;
  let payout = didWin ? amount * 2 : 0;
  let actualPayout = payout;
  try {
    actualPayout = await placeBetWithTransaction(
      user.id,
      user.wallet.id,
      "coinflip",
      amount,
      choice,
      didWin,
      payout,
      message.guildId!
    );
  } catch (e) {
    actualPayout = await placeBetFallback(
      user.wallet.id,
      user.id,
      "coinflip",
      amount,
      choice,
      didWin,
      payout,
      message.guildId!
    );
  }
  payout = actualPayout;
  const finalWalletBalance = user.wallet.balance - amount + payout;
  const finalWalletBalanceIntl = finalWalletBalance.toLocaleString("en-US");
  let footerIconURL: string | undefined;
  if (typeof emoji === "string") {
    const match = emoji.match(/\d{17,20}/);
    if (match) {
      footerIconURL = `https://cdn.discordapp.com/emojis/${match[0]}.gif?quality=lossless`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(didWin ? "You Won!" : "You Lost")
    .setColor(didWin ? Colors.Green : Colors.Red)
    .setDescription(
      `**You Bet:** ${fmtCurrency(amount, emoji)} on \`${choice.toUpperCase()}\`\n` +
      `**The Coin Flipped:** 🪙 \`${result.toUpperCase()}\`\n\n` +
      (didWin
        ? `**Payout:** ${fmtCurrency(payout, emoji)}`
        : `**Lost:** ${fmtCurrency(amount, emoji)}`)
    )
    .setFooter({
      text: `${Mascot.Name} • ${message.author.username}'s Wallet: ${finalWalletBalanceIntl}`,
      iconURL: footerIconURL,
    });

  if (didWin) {
    embed.setThumbnail("https://media.tenor.com/d6Jd-9w8eJkAAAAC/success-kid-hell-yeah.gif");
  } else {
    const failUrl = getEmoteUrl(Mascot.Emotes.Fail);
    // Only set fail thumbnail if not overriden or if specific logic applies (User said "where thumbnail... exist dont use it").
    // Coinflip loss didn't have a thumbnail before. So adding one is "enhancement" or "keeping it normal"?
    // "where thumbnail emojis already exist dont use it there keep it normal there"
    // Coinflips normally don't have a LOSS thumbnail. Adding one might be good.
    // Actually, let's Stick to the requested pattern: Use thumbnails for branding. 
    if (failUrl) embed.setThumbnail(failUrl);
  }
  return message.reply({ embeds: [embed] });
}