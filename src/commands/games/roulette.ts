import {
  Message,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
  AttachmentBuilder
} from "discord.js";
import path from "path";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCasinoCooldown, setCasinoCooldown, formatCasinoCooldownMessage } from "../../services/casinoCooldownService";
import { formatDuration } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";
import { checkLuckyCoin } from "../../services/shopBuffs";

export async function handleRouletteMenu(message: Message) {
  const config = await getGuildConfig(message.guildId!);
  const eCasino = "<a:casino:1445732641545654383>";
  const eScroll = "<:scroll:1446218234171887760>";
  const eDicesBtn = "<:dices:1446220119733702767>";
  const eBlackCoin = "<:BlackCoin:1446217613632999565>";
  const eRedCoin = "<:redcoin:1446217599439343772>";
  const eDiceSpecific = "<a:dice:1446217848551899300>";
  const parseEmojiId = (str: string) => str.match(/:(\d+)>/)?.[1] ?? (str.match(/^\d+$/) ? str : str);

  const bannerPath = path.join(process.cwd(), "src", "assets", "roulette_banner.png");
  const attachment = new AttachmentBuilder(bannerPath, { name: "roulette_banner.png" });

  const embed = new EmbedBuilder()
    .setTitle(`${eCasino} Roulette Table`)
    .setDescription(`Welcome to ${Mascot.Name}'s Casino! Test your luck on the wheel.`)
    .setColor(Colors.Red)
    .setImage("attachment://roulette_banner.png")
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
  const sent = await message.reply({ embeds: [embed], components: [row], files: [attachment] });
  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000
  });
  collector.on("collect", async (i: ButtonInteraction) => {
    if (i.user.id !== message.author.id) {
      await i.reply({ content: "This game isn't yours.", ephemeral: true });
      return;
    }
    if (i.customId === "roul_guide") {
      const bannerPath = path.join(process.cwd(), "src", "assets", "roulette_guide.png");
      const guideAttachment = new AttachmentBuilder(bannerPath, { name: "roulette_guide.png" });

      const guideEmbed = new EmbedBuilder()
        .setTitle(`Roulette Rules`)
        .setColor(Colors.Blue)
        .setDescription(
          `**Payout Multipliers:**\n` +
          `[x36] Single Number\n` +
          `[x 3] Dozens (1-12, 13-24, 25-36)\n` +
          `[x 3] Columns (1st, 2nd, 3rd)\n` +
          `[x 2] Halves (1-18, 19-36)\n` +
          `[x 2] Odd/Even\n` +
          `[x 2] Colours (red, black)`
        )
        .setImage("attachment://roulette_guide.png")
        .setFooter({ text: `${Mascot.Name} Tips` });

      await i.reply({ embeds: [guideEmbed], files: [guideAttachment], ephemeral: true });
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
  const { min, max } = getGameBetLimits(config, "roulette");
  if (amount < min) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Roulette is **${fmtCurrency(min, emoji)}**.`)]
    });
  }
  if (amount > max) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Roulette is **${fmtCurrency(max, emoji)}**.`)]
    });
  }
  const cd = await checkCasinoCooldown("roulette", message.author.id);
  if (cd.active) {
    const msg = cd.unavailable
      ? "Casino cooldown service is temporarily unavailable. Try again soon."
      : formatCasinoCooldownMessage("roulette", cd.availableAtUnix!);
    const cdMsg = await message.reply({ embeds: [errorEmbed(message.author, "Cooldown Active", msg)] });
    setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
    return;
  }
  // ... (validations passed) ...
  if (user.wallet!.balance < amount) {
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money in your wallet.")] });
  }

  const luckyCoinMult = await checkLuckyCoin(message.author.id);

  // SPIN ANIMATION
  const spinTime = config.rouletteSpinTime || 3;
  const eCasino = "<a:casino:1445732641545654383>";
  const spinningEmbed = new EmbedBuilder()
    .setTitle(`${eCasino} The wheel is spinning...`)
    .setDescription(`Rolling the ball... Good luck!`)
    .setColor(Colors.Yellow)
    .setImage("https://media.tenor.com/7gKkK6W85GgAAAAC/roulette-casino.gif");

  const spinMsg = await message.reply({ embeds: [spinningEmbed] });
  await new Promise(resolve => setTimeout(resolve, spinTime * 1000));

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
  } else if (choiceRaw === "1-12") {
    didWin = (spin >= 1 && spin <= 12);
    multiplier = 3;
  } else if (choiceRaw === "13-24") {
    didWin = (spin >= 13 && spin <= 24);
    multiplier = 3;
  } else if (choiceRaw === "25-36") {
    didWin = (spin >= 25 && spin <= 36);
    multiplier = 3;
  } else if (choiceRaw === "1st") { // 1st Column: 1, 4, 7... (n%3 == 1)
    didWin = (spin !== 0 && spin % 3 === 1);
    multiplier = 3;
  } else if (choiceRaw === "2nd") { // 2nd Column: 2, 5, 8... (n%3 == 2)
    didWin = (spin !== 0 && spin % 3 === 2);
    multiplier = 3;
  } else if (choiceRaw === "3rd") { // 3rd Column: 3, 6, 9... (n%3 == 0)
    didWin = (spin !== 0 && spin % 3 === 0);
    multiplier = 3;
  } else if (choiceRaw === "1-18") {
    didWin = (spin >= 1 && spin <= 18);
    multiplier = 2;
  } else if (choiceRaw === "19-36") {
    didWin = (spin >= 19 && spin <= 36);
    multiplier = 2;
  } else {
    const numChoice = parseInt(choiceRaw);
    if (!isNaN(numChoice) && numChoice >= 0 && numChoice <= 36) {
      didWin = (spin === numChoice);
      multiplier = 36;
    } else {
      // Clean up if error
      await spinMsg.delete().catch(() => { });
      return message.reply({ embeds: [errorEmbed(message.author, "Invalid Choice", "Bet on `red`, `black`, `odd`, `even`, `1-12`, `13-24`, `25-36`, `1st`, `2nd`, `3rd`, `1-18`, `19-36`, or a number `0-36`.")] });
    }
  }
  let payout = await placeBetWithTransaction(
    user.discordId,
    user.wallet!.id,
    "roulette",
    amount,
    choiceRaw,
    didWin,
    didWin ? Math.floor(amount * multiplier * luckyCoinMult) : 0,
    message.guildId!
  );
  await setCasinoCooldown("roulette", user.discordId, message.guildId!);
  await updateQuestProgress(user.discordId, "GAMBLE").catch(console.error);
  if (didWin) await updateQuestProgress(user.discordId, "WIN_ROULETTE").catch(console.error);

  // Cleanup spinning message
  await spinMsg.delete().catch(() => { });

  // LOGGING
  const logColor = didWin ? 0x00FF00 : 0xFF0000;
  await import("../../utils/discordLogger").then(({ logToChannel }) => {
    logToChannel(message.client, {
      guild: message.guild!,
      type: "ECONOMY",
      title: "Roulette Game",
      description: `**User:** ${message.author.toString()}\n**Bet on:** ${choiceRaw}\n**Result:** ${isRed ? "RED" : (isBlack ? "BLACK" : "ZERO")} (${spin})\n**Bet:** ${fmtCurrency(amount, emoji)}\n**Payout:** ${fmtCurrency(payout, emoji)}`,
      color: logColor,
      thumbnail: message.author.displayAvatarURL()
    }).catch(() => { });
  });

  const eRedCoin = "<:redcoin:1446217599439343772>";
  const eBlackCoin = "<:BlackCoin:1446217613632999565>";
  const displayColor = spin === 0 ? "🟢" : (isRed ? eRedCoin : eBlackCoin);
  const resultEmbed = new EmbedBuilder()
    .setTitle(didWin ? `${Mascot.Emotes.Money} Winner!` : `${Mascot.Emotes.Fail} You Lost`)
    .setColor(didWin ? Colors.Green : Colors.Red)
    .setDescription(
      `**Result:** ${displayColor} **${spin}**\n` +
      `**Your Bet:** ${choiceRaw}\n` +
      `**${didWin ? "Won" : "Lost"}:** ${fmtCurrency(didWin ? payout : amount, emoji)}`
    )
    .setFooter({ text: `${Mascot.Name} • ${message.author.username}'s Wallet: ${(user.wallet!.balance - amount + payout).toLocaleString('en-US')}` });

  return message.reply({ content: `<@${message.author.id}>`, embeds: [resultEmbed] });
}
