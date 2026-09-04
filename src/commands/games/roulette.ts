import {
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
  AttachmentBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} from "discord.js";
import path from "path";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { checkCasinoCooldown, setCasinoCooldown, formatCasinoCooldownMessage } from "../../services/casinoCooldownService";
import { formatDuration } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { questBus } from "../../services/questEvents";
import { checkLuckyCoin } from "../../services/shopBuffs";
import { getGuildPrefix } from "../../utils/guildContext";
import { GAME_UI_TIMINGS } from "../../utils/economyConfig";
import { assetPath } from "../../utils/assetPaths";

export async function handleRouletteMenu(message: Message) {
  const prefix = await getGuildPrefix(message.guildId!);
  const eCasino = "<a:casino:1456568719374553138>";
  const eScroll = "<:scroll:1456569017530716254>";
  const eDicesBtn = "<a:dices:1456568817621925991>";
  const eBlackCoin = "<:BlackCoin:1446217613632999565>";
  const eRedCoin = "<:redcoin:1456569008273883176>";
  const eDiceSpecific = "<a:dice:1446217848551899300>";
  const parseEmojiId = (str: string) => str.match(/:(\d+)>/)?.[1] ?? (str.match(/^\d+$/) ? str : str);

  const bannerPath = assetPath("roulette_banner.png");
  const attachment = new AttachmentBuilder(bannerPath, { name: "roulette_banner.png" });

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

  const menuContainer = plainContainer(
    `## ${eCasino} Roulette Table\n` +
    `Welcome to ${Mascot.Name}'s Casino! Test your luck on the wheel.`
  );
  menuContainer.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("attachment://roulette_banner.png")
    )
  );
  menuContainer.addActionRowComponents(row);

  const sent = await message.reply(v2Reply(menuContainer, [attachment]));
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
      const bannerPath = assetPath("roulette_guide.png");
      const guideAttachment = new AttachmentBuilder(bannerPath, { name: "roulette_guide.png" });

      const guideContainer = plainContainer(
        `## Roulette Rules\n` +
        `**Payout Multipliers:**\n` +
        `[x36] Single Number\n` +
        `[x 3] Dozens (1-12, 13-24, 25-36)\n` +
        `[x 3] Columns (1st, 2nd, 3rd)\n` +
        `[x 2] Halves (1-18, 19-36)\n` +
        `[x 2] Odd/Even\n` +
        `[x 2] Colours (red, black)`
      );
      guideContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL("attachment://roulette_guide.png")
        )
      );

      await i.reply(v2Reply(guideContainer, [guideAttachment], MessageFlags.Ephemeral));
    }
    if (i.customId === "roul_play") {
      await i.reply({
        content: `To place a bet, type:\n\`${prefix}bet <amount> <choice>\`\n\n**Examples:**\n\`${prefix}bet 100 red\`\n\`${prefix}bet 500 17\`\n\`${prefix}bet 1000 odd\``,
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
    return message.reply(v2Reply(errorContainer("Invalid Wager", "Please bet a valid positive amount.")));
  }
  const prefix = await getGuildPrefix(message.guildId!);

  const { min, max } = getGameBetLimits("roulette");
  if (amount < min) {
    return message.reply(v2Reply(errorContainer("Bet Too Low", `The minimum bet for Roulette is **${fmtCurrency(min)}**.`)));
  }
  if (amount > max) {
    return message.reply(v2Reply(errorContainer("Bet Too High", `The maximum bet for Roulette is **${fmtCurrency(max)}**.`)));
  }
  const cd = await checkCasinoCooldown("roulette", message.author.id);
  if (cd.active) {
    const msg = cd.unavailable
      ? "Casino cooldown service is temporarily unavailable. Try again soon."
      : formatCasinoCooldownMessage("roulette", cd.availableAtUnix!);
    const cdMsg = await message.reply(v2Reply(errorContainer("Cooldown Active", msg)));
    setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
    return;
  }
  // ... (validations passed) ...
  if (user.wallet!.balance < amount) {
    return message.reply(v2Reply(errorContainer("Insufficient Funds", "You don't have enough money in your wallet.")));
  }

  const luckyCoinMult = await checkLuckyCoin(message.author.id);

  // SPIN ANIMATION
  const spinTime = GAME_UI_TIMINGS.rouletteSpinSeconds;
  const eCasino = "<a:casino:1456568719374553138>";
  const spinningContainer = plainContainer(
    `## ${eCasino} The wheel is spinning...\n` +
    `Rolling the ball... Good luck!`
  );
  spinningContainer.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("https://media.tenor.com/7gKkK6W85GgAAAAC/roulette-casino.gif")
    )
  );

  const spinMsg = await message.reply(v2Reply(spinningContainer));
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
      return message.reply(v2Reply(errorContainer("Invalid Choice", "Bet on `red`, `black`, `odd`, `even`, `1-12`, `13-24`, `25-36`, `1st`, `2nd`, `3rd`, `1-18`, `19-36`, or a number `0-36`.")));
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
  questBus.emit("casino:play", { discordId: user.discordId, bet: amount });
  if (didWin) questBus.emit("casino:win", { discordId: user.discordId, game: "roulette" });

  // Cleanup spinning message
  await spinMsg.delete().catch(() => { });

  // LOGGING
  const logColor = didWin ? 0x00FF00 : 0xFF0000;
  await import("../../utils/discordLogger").then(({ logToChannel }) => {
    logToChannel(message.client, {
      guild: message.guild!,
      type: "ECONOMY",
      title: "Roulette Game",
      description: `**User:** ${message.author.toString()}\n**Bet on:** ${choiceRaw}\n**Result:** ${isRed ? "RED" : (isBlack ? "BLACK" : "ZERO")} (${spin})\n**Bet:** ${fmtCurrency(amount)}\n**Payout:** ${fmtCurrency(payout)}`,
      color: logColor,
      thumbnail: message.author.displayAvatarURL()
    }).catch(() => { });
  });

  const eRedCoin = "<:redcoin:1456569008273883176>";
  const eBlackCoin = "<:BlackCoin:1446217613632999565>";
  const displayColor = spin === 0 ? "🟢" : (isRed ? eRedCoin : eBlackCoin);
  const resultTitle = didWin ? `${Mascot.Emotes.Money} Winner!` : `${Mascot.Emotes.Fail} You Lost`;
  const resultBody =
    `**Result:** ${displayColor} **${spin}**\n` +
    `**Your Bet:** ${choiceRaw}\n` +
    `**${didWin ? "Won" : "Lost"}:** ${fmtCurrency(didWin ? payout : amount)}`;

  const resultBlocks = [`<@${message.author.id}>\n## ${resultTitle}\n${resultBody}`];
  const hint = nextStepHint("casino", prefix);
  if (hint) resultBlocks.push(hint);

  return message.reply(v2Reply(plainContainer(...resultBlocks)));
}
