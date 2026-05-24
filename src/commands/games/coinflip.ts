import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  Message,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { checkCasinoCooldown, setCasinoCooldown, formatCasinoCooldownMessage, acquireActiveGameLock, releaseActiveGameLock } from "../../services/casinoCooldownService";
import { Mascot } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { questBus } from "../../services/questEvents";
import { checkLuckyCoin, applyLuckToChance, checkCrownOfGreed, recordPotentialSoulLedgerLoss } from "../../services/shopBuffs";

const COINFLIP_ACCENT = 0xF1C40F;

function buildCoinflipContainer(title: string, body: string, accent = COINFLIP_ACCENT) {
  return new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body),
    );
}

function buildChoiceRow(ownerId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`coinflip:${ownerId}:heads`)
      .setLabel("Heads")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`coinflip:${ownerId}:tails`)
      .setLabel("Tails")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildDisabledChoiceRow(ownerId: string, choice: "heads" | "tails") {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`coinflip:${ownerId}:heads:done`)
      .setLabel("Heads")
      .setStyle(choice === "heads" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`coinflip:${ownerId}:tails:done`)
      .setLabel("Tails")
      .setStyle(choice === "tails" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

function parseCoinChoice(choiceRaw: string): "heads" | "tails" | null {
  if (["heads", "head", "h"].includes(choiceRaw)) return "heads";
  if (["tails", "tail", "t"].includes(choiceRaw)) return "tails";
  return null;
}

export async function handleCoinflip(message: Message, args: string[]) {
  const config = await getGuildConfig(message.guildId!);
  const amountStr = args[0];
  const choiceRaw = (args[1] || "").toLowerCase();

  if (!amountStr) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}coinflip <amount> [h/t]\`\nExample: \`${config.prefix}coinflip 1000 h\``)],
    });
  }

  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  const amount = parseBetAmount(amountStr, user.wallet!.balance);
  if (!Number.isInteger(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Wager", "Please bet a valid whole amount.")] });
  }

  const emoji = config.currencyEmoji;
  const immediateChoice = choiceRaw ? parseCoinChoice(choiceRaw) : null;
  if (choiceRaw && !immediateChoice) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Choice", "Please choose `heads` or `tails`.")] });
  }

  const cd = await checkCasinoCooldown("coinflip", message.author.id);
  if (cd.active) {
    const msg = cd.unavailable
      ? "Casino cooldown service is temporarily unavailable. Try again soon."
      : formatCasinoCooldownMessage("coinflip", cd.availableAtUnix!);
    const cdMsg = await message.reply({ embeds: [errorEmbed(message.author, "Cooldown Active", msg)] });
    setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
    return;
  }

  const { min, max } = getGameBetLimits(config, "coinflip");
  if (amount < min) {
    return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Coinflip is **${fmtCurrency(min, emoji)}**.`)] });
  }
  if (amount > max) {
    return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Coinflip is **${fmtCurrency(max, emoji)}**.`)] });
  }
  if (!user.wallet || user.wallet.balance < amount) {
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money in your wallet.")] });
  }

  // Active-game lock acquired AFTER all validation — so failed checks never lock the user out
  const lockAcquired = await acquireActiveGameLock("coinflip", message.author.id);
  if (!lockAcquired) {
    const cdMsg = await message.reply({ embeds: [errorEmbed(message.author, "Game In Progress", "You already have an active Coinflip. Resolve it first.")] });
    setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
    return;
  }

  const luckyWinChance = await applyLuckToChance(message.author.id, 0.5, 0.03);
  const crownMult = await checkCrownOfGreed(message.author.id);

  async function settle(choice: "heads" | "tails") {
    // Lucky Coin consumed here — only if the game actually settles
    const luckyCoinMult = await checkLuckyCoin(message.author.id);

    // Luck slightly adjusts win probability (max ±3% from 50% base)
    const didWin = Math.random() < luckyWinChance;
    // For display: if won, show the choice as result; if lost, show opposite
    const result: "heads" | "tails" = didWin ? choice : (choice === "heads" ? "tails" : "heads");

    // Apply Crown of Greed: boost net profit on win, increase net loss on loss
    const baseGrossPayout = didWin ? Math.floor(amount * 2 * luckyCoinMult) : 0;
    let adjustedPayout: number;
    let effectiveStake = amount;
    if (didWin) {
      const netProfit = baseGrossPayout - amount;
      adjustedPayout = amount + Math.floor(netProfit * crownMult);
    } else {
      // Crown increases the loss but cap to current wallet balance to avoid transaction failure
      const walletBalance = user.wallet!.balance;
      effectiveStake = Math.min(Math.floor(amount * crownMult), walletBalance);
      adjustedPayout = 0;
    }

    if (!didWin && effectiveStake > 300_000) {
      await recordPotentialSoulLedgerLoss(user.discordId, effectiveStake);
    }

    const payout = await placeBetWithTransaction(
      user.discordId,
      user.wallet!.id,
      "coinflip",
      effectiveStake,
      choice,
      didWin,
      adjustedPayout,
      message.guildId!
    );

    await releaseActiveGameLock("coinflip", user.discordId);
    await setCasinoCooldown("coinflip", user.discordId, message.guildId!);
    questBus.emit("casino:play", { discordId: user.discordId, bet: amount });
    if (didWin) questBus.emit("casino:win", { discordId: user.discordId, game: "coinflip" });

    await import("../../utils/discordLogger").then(({ logToChannel }) => {
      logToChannel(message.client, {
        guild: message.guild!,
        type: "ECONOMY",
        title: "Coinflip Game",
        description: `**User:** ${message.author.toString()}\n**Choice:** ${choice.toUpperCase()}\n**Result:** ${result.toUpperCase()}\n**Bet:** ${fmtCurrency(amount, emoji)}\n**Payout:** ${fmtCurrency(payout, emoji)}`,
        color: didWin ? 0x00FF00 : 0xFF0000,
        thumbnail: message.author.displayAvatarURL()
      }).catch(() => { });
    });

    const finalWalletBalance = user.wallet!.balance - effectiveStake + payout;
    const body = [
      `Choice: **${choice.toUpperCase()}**`,
      `Result: **${result.toUpperCase()}**`,
      `Bet: **${fmtCurrency(amount, emoji)}**`,
      didWin ? `Payout: **${fmtCurrency(payout, emoji)}**` : `Lost: **${fmtCurrency(effectiveStake, emoji)}**`,
      `Wallet: **${fmtCurrency(finalWalletBalance, emoji)}**`
    ].join("\n");

    return {
      components: [
        buildCoinflipContainer(didWin ? "Coinflip Won" : "Coinflip Lost", body, didWin ? 0x2ECC71 : 0xE74C3C),
        buildDisabledChoiceRow(message.author.id, choice)
      ],
    };
  }

  if (immediateChoice) {
    const r = await settle(immediateChoice);
    return message.reply({ ...r, flags: MessageFlags.IsComponentsV2 });
  }

  const prompt = buildCoinflipContainer(
    "Coinflip",
    [`Bet: **${fmtCurrency(amount, emoji)}**`, "Choose heads or tails to flip.", `Only you can use these buttons. Tip: \`coinflip ${amountStr} h\` or \`t\` to skip this step.`].join("\n")
  );
  const msg = await message.reply({ components: [prompt, buildChoiceRow(message.author.id)], flags: MessageFlags.IsComponentsV2 });
  let settled = false;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

  collector.on("collect", async (i) => {
    if (!i.customId.startsWith(`coinflip:${message.author.id}:`)) {
      await i.reply({ content: "This game isn't yours.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (settled) {
      await i.reply({ content: "This coinflip has already resolved.", flags: MessageFlags.Ephemeral });
      return;
    }

    const choice = i.customId.includes(":heads") ? "heads" : "tails";
    settled = true;
    collector.stop("settled");
    // Defer immediately to acknowledge within 3s, then do all async work
    await i.deferUpdate();
    const result = await settle(choice);
    await i.editReply(result);
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "settled" && !settled) {
      // Release lock — game abandoned, no cooldown
      await releaseActiveGameLock("coinflip", user.discordId);
      await msg.edit({
        components: [
          buildCoinflipContainer("Coinflip Expired", "No choice was made, so no wallet changes were made.", 0x95A5A6),
          buildDisabledChoiceRow(message.author.id, "heads")
        ],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }
  });
}
