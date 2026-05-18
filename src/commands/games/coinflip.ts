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
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { Mascot } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";
import { checkLuckyCoin } from "../../services/shopBuffs";

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
      embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}coinflip <amount>\``)],
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
    return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money in your wallet.")] });
  }

  const luckyCoinMult = await checkLuckyCoin(message.author.id);

  async function settle(choice: "heads" | "tails") {
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const didWin = choice === result;
    const payout = await placeBetWithTransaction(
      user.discordId,
      user.wallet!.id,
      "coinflip",
      amount,
      choice,
      didWin,
      didWin ? Math.floor(amount * 2 * luckyCoinMult) : 0,
      message.guildId!
    );

    await updateQuestProgress(user.discordId, "GAMBLE").catch(console.error);
    if (didWin) await updateQuestProgress(user.discordId, "WIN_COINFLIP").catch(console.error);

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

    const finalWalletBalance = user.wallet!.balance - amount + payout;
    const body = [
      `Choice: **${choice.toUpperCase()}**`,
      `Result: **${result.toUpperCase()}**`,
      `Bet: **${fmtCurrency(amount, emoji)}**`,
      didWin ? `Payout: **${fmtCurrency(payout, emoji)}**` : `Lost: **${fmtCurrency(amount, emoji)}**`,
      `Wallet: **${fmtCurrency(finalWalletBalance, emoji)}**`
    ].join("\n");

    return {
      components: [
        buildCoinflipContainer(didWin ? "Coinflip Won" : "Coinflip Lost", body, didWin ? 0x2ECC71 : 0xE74C3C),
        buildDisabledChoiceRow(message.author.id, choice)
      ],
      flags: MessageFlags.IsComponentsV2 as const
    };
  }

  if (immediateChoice) {
    return message.reply(await settle(immediateChoice));
  }

  const prompt = buildCoinflipContainer(
    "Coinflip",
    [`Bet: **${fmtCurrency(amount, emoji)}**`, "Choose heads or tails to flip.", "Only you can use these buttons."].join("\n")
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
    await i.update(await settle(choice));
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "settled" && !settled) {
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
