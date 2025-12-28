import {
  Message,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction
} from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { formatDuration } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";

export async function handleRouletteMenu(message: Message) {
  const config = await getGuildConfig(message.guildId!);
  const eCasino = "<a:casino:1445732641545654383>";
  const eScroll = "<:scroll:1446218234171887760>";
  const eDicesBtn = "<:dices:1446220119733702767>";
  const eBlackCoin = "<:BlackCoin:1446217613632999565>";
  const eRedCoin = "<:redcoin:1446217599439343772>";
  const eDiceSpecific = "<a:dice:1446217848551899300>";
  const parseEmojiId = (str: string) => str.match(/:(\d+)>/)?.[1] ?? (str.match(/^\d+$/) ? str : str);
  const embed = new EmbedBuilder()
    .setTitle(`${eCasino} Roulette Table`)
    .setDescription("Welcome to the Casino! Test your luck on the wheel.")
    .setColor(Colors.Red)
    .setImage("https://media.tenor.com/7gKkK6W85GgAAAAC/roulette-casino.gif")
    .setFooter({ text: "Click 'Guide' for rules or 'Play' to start." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("roul_guide")
      .setLabel("Guide")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(parseEmojiId(eScroll)),
    new ButtonBuilder()
      .setCustomId("roul_play")
      .setLabel("How to Play")
      .setStyle(ButtonStyle.Success)
      .setEmoji(parseEmojiId(eDicesBtn))
  );
  const sent = await message.reply({ embeds: [embed], components: [row] });
  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === message.author.id
  });
  collector.on("collect", async (i: ButtonInteraction) => {
    if (i.customId === "roul_guide") {
      const guideEmbed = new EmbedBuilder()
        .setTitle(`${eScroll} Roulette Rules`)
        .setColor(Colors.Blue)
        .setDescription(
          `**Multipliers:**\n\n` +
          `${eRedCoin} **Red / ${eBlackCoin} Black:**\n` +
          `2x Payout (Win chance ~48.6%)\n\n` +
          `${eDiceSpecific} **Specific Number (0-36):**\n` +
          `35x Payout (Win chance ~2.7%)\n\n` +
          `🔵 **Odd / 🟡 Even:**\n` +
          `2x Payout\n\n` +
          `**House Edge:** The green **0** belongs to the house!`
        );
      await i.reply({ embeds: [guideEmbed], ephemeral: true });
    }
    if (i.customId === "roul_play") {
      await i.reply({
        content: `To place a bet, type:\n\`${config.prefix}bet <amount> <choice>\`\n\n**Examples:**\n\`${config.prefix}bet 100 red\`\n\`${config.prefix}bet 500 17\`\n\`${config.prefix}bet 1000 odd\``,
        ephemeral: true
      });
    }
  });
}

export async function handleBet(message: Message, args: string[]) {
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  let amount = parseBetAmount(args[0], user.wallet!.balance);
  let choiceRaw = (args[1] || "").toLowerCase();

  // Swap args if amount usage is reversed (flexibility)
  if (isNaN(amount)) {
    amount = parseBetAmount(args[1], user.wallet!.balance);
    choiceRaw = (args[0] || "").toLowerCase();
  }

  if (isNaN(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Wager", "Please bet a valid positive amount.")] });
  }
  const config = await getGuildConfig(message.guildId!);
  const emoji = config.currencyEmoji;
  const minBet = config.minBet;
  if (amount < minBet) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet is **${fmtCurrency(minBet, emoji)}**.`)]
    });
  }
  const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
  const cdSeconds = cooldowns["roulette"] || 0;
  if (cdSeconds > 0) {
    const key = `game:roulette:${message.guildId}:${message.author.id}`;
    const remaining = checkCooldown(key, cdSeconds);
    if (remaining > 0) {
      const expire = getCooldownExpiry(key);
      const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
      return message.reply({
        embeds: [errorEmbed(message.author, "Cooldown Active", `<:cooldown:1454025354631970826> Please wait <t:${ts}:R> before playing Roulette again.`)]
      });
    }
  }
  if (user.wallet!.balance < amount) {
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money in your wallet.")] });
  }
  const spin = Math.floor(Math.random() * 37);
  const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const isRed = redNumbers.has(spin);
  const isBlack = !isRed && spin !== 0;
  let didWin = false;
  let multiplier = 0;
  if (choiceRaw === "red") {
    didWin = isRed;
    multiplier = 2;
  } else if (choiceRaw === "black") {
    didWin = isBlack;
    multiplier = 2;
  } else if (choiceRaw === "odd") {
    didWin = (spin !== 0 && spin % 2 !== 0);
    multiplier = 2;
  } else if (choiceRaw === "even") {
    didWin = (spin !== 0 && spin % 2 === 0);
    multiplier = 2;
  } else {
    const numChoice = parseInt(choiceRaw);
    if (!isNaN(numChoice) && numChoice >= 0 && numChoice <= 36) {
      didWin = (spin === numChoice);
      multiplier = 35;
    } else {
      return message.reply({ embeds: [errorEmbed(message.author, "Invalid Choice", "Bet on `red`, `black`, `odd`, `even`, or a number `0-36`.")] });
    }
  }
  let payout = didWin ? Math.floor(amount * multiplier) : 0;
  let actualPayout = payout;
  try {
    actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "roulette_v1", amount, choiceRaw, didWin, payout, message.guildId!);
  } catch (e) {
    actualPayout = await placeBetFallback(user.wallet!.id, user.id, "roulette_v1", amount, choiceRaw, didWin, payout, message.guildId!);
  }
  payout = actualPayout;
  const eRedCoin = "<:redcoin:1446217599439343772>";
  const eBlackCoin = "<:BlackCoin:1446217613632999565>";
  const displayColor = spin === 0 ? "🟢" : (isRed ? eRedCoin : eBlackCoin);
  const resultEmbed = new EmbedBuilder()
    .setTitle(didWin ? "🎉 Winner!" : "💀 You Lost")
    .setColor(didWin ? Colors.Green : Colors.Red)
    .setDescription(
      `**Result:** ${displayColor} **${spin}**\n` +
      `**Your Bet:** ${choiceRaw}\n` +
      `**${didWin ? "Won" : "Lost"}:** ${fmtCurrency(didWin ? payout : amount, emoji)}`
    )
    .setFooter({ text: `${message.author.username}'s Wallet: ${(user.wallet!.balance - amount + payout).toLocaleString()}` });
  return message.reply({ embeds: [resultEmbed] });
}