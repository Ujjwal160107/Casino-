import { Message, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { formatDuration } from "../../utils/format";

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
  const cdSeconds = cooldowns["cf"] || 0;
  if (cdSeconds > 0) {
    const key = `game:cf:${message.guildId}:${message.author.id}`;
    const remaining = checkCooldown(key, cdSeconds);
    if (remaining > 0) {
      const expire = getCooldownExpiry(key);
      const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
      return message.reply({
        embeds: [errorEmbed(message.author, "Cooldown Active", `<:cooldown:1454025354631970826> Please wait <t:${ts}:R> before flipping again.`)]
      });
    }
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
    .setTitle(didWin ? "🎉 You Won!" : "💀 You Lost")
    .setColor(didWin ? Colors.Green : Colors.Red)
    .setThumbnail(
      didWin
        ? "https://media.tenor.com/d6Jd-9w8eJkAAAAC/success-kid-hell-yeah.gif"
        : null
    )
    .setDescription(
      `**You Bet:** ${fmtCurrency(amount, emoji)} on \`${choice.toUpperCase()}\`\n` +
      `**The Coin Flipped:** 🪙 \`${result.toUpperCase()}\`\n\n` +
      (didWin
        ? `**Payout:** ${fmtCurrency(payout, emoji)}`
        : `**Lost:** ${fmtCurrency(amount, emoji)}`)
    )
    .setFooter({
      text: `${message.author.username}'s Wallet: ${finalWalletBalanceIntl}`,
      iconURL: footerIconURL,
    });
  return message.reply({ embeds: [embed] });
}