import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  Message,
} from "discord.js";
import { Mascot } from "../../config/branding";
import {
  getLoadedDiceRarePlusChance,
  getLoadedDiceStatus,
  LoadedDiceError,
  LoadedDiceRollResult,
  rollLoadedDice,
} from "../../services/loadedDiceService";
import { emojiInline } from "../../utils/emojiRegistry";
import { fmtCurrency } from "../../utils/format";
import { getLoadedDiceRollConfig, LOADED_DICE_ITEM_KEY } from "../../utils/loadedDiceConfig";
import {
  getShopApplicationEmojiName,
  resolveShopItemThumbnailAsset,
} from "../../utils/shopItemAssets";

const CONFIRM_WINDOW_MS = 60_000;
const DICE_COLOR = 0x9B59B6;

const CATEGORY_COLORS = {
  COMMON: 0x95A5A6,
  UNCOMMON: 0x2ECC71,
  RARE: 0x3498DB,
  EPIC: 0x9B59B6,
  MYTHIC: 0xF1C40F,
} as const;

function shopEmoji(itemKey: string, fallback: string): string {
  return emojiInline(getShopApplicationEmojiName(itemKey)) ?? fallback;
}

function diceEmoji(): string {
  return shopEmoji(LOADED_DICE_ITEM_KEY, "🎲");
}

function diceAttachment(): { attachment: AttachmentBuilder | null; thumbnailUrl: string | null } {
  const asset = resolveShopItemThumbnailAsset(LOADED_DICE_ITEM_KEY);
  if (!asset) return { attachment: null, thumbnailUrl: null };
  return {
    attachment: new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }),
    thumbnailUrl: `attachment://${asset.attachmentName}`,
  };
}

function unix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function withDiceThumbnail(embed: EmbedBuilder, thumbnailUrl: string | null): EmbedBuilder {
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

function buildNoDiceEmbed(prefix: string, thumbnailUrl: string | null): EmbedBuilder {
  return withDiceThumbnail(
    new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle("Loaded Dice of Ruin")
      .setDescription(
        `${diceEmoji()} You do not own this relic. Buy one from the General Shop before trying to roll.`,
      )
      .addFields(
        { name: `${Mascot.Emotes.Inventory} Rolls`, value: "**0**", inline: true },
        { name: `${Mascot.Emotes.Shop} Get One`, value: "`" + prefix + "shop`", inline: true },
      ),
    thumbnailUrl,
  );
}

function buildCooldownEmbed(
  completedRolls: number,
  availableAt: Date,
  thumbnailUrl: string | null,
): EmbedBuilder {
  return withDiceThumbnail(
    new EmbedBuilder()
      .setColor(DICE_COLOR)
      .setTitle("The Dice Is Resting")
      .setDescription(`${Mascot.Emotes.Cooldown} The curse only answers once every 24 hours.`)
      .addFields(
        { name: `${Mascot.Emotes.Dices} Rolls Survived`, value: `**${completedRolls}**`, inline: true },
        { name: `${Mascot.Emotes.Cooldown} Next Roll`, value: `<t:${unix(availableAt)}:R>`, inline: true },
      ),
    thumbnailUrl,
  );
}

function buildConfirmationEmbed(
  rollNumber: number,
  condition: string,
  thumbnailUrl: string | null,
): EmbedBuilder {
  const config = getLoadedDiceRollConfig(rollNumber);
  const rarePlusChance = getLoadedDiceRarePlusChance(rollNumber);
  return withDiceThumbnail(
    new EmbedBuilder()
      .setColor(DICE_COLOR)
      .setTitle(`Loaded Dice of Ruin — Roll #${rollNumber}`)
      .setDescription(
        `${diceEmoji()} The die is **${condition}**. Its rewards have grown richer, but the cracks are spreading.`,
      )
      .addFields(
        { name: `${Mascot.Emotes.Sparks} Rare or Better`, value: `**${rarePlusChance}%**`, inline: true },
        { name: `${Mascot.Emotes.Alert} Shatter Risk`, value: `**${config.shatterChance}%**`, inline: true },
        { name: `${Mascot.Emotes.Cooldown} Daily Turn`, value: "Ready now", inline: true },
      )
      .setFooter({ text: "Your reward is secured before the shatter check." }),
    thumbnailUrl,
  );
}

function rewardText(result: LoadedDiceRollResult): string {
  if (result.reward.kind === "ITEM") {
    return `${shopEmoji(result.reward.itemKey, Mascot.Emotes.Lootbox)} **${result.reward.itemName}**\nShop value: ${fmtCurrency(result.reward.shopValue)}`;
  }

  const capNote = result.reward.capped
    ? `\n-# Wallet capacity limited the payout from ${fmtCurrency(result.reward.requestedAmount)}.`
    : "";
  return `${Mascot.Emotes.Currency} **${fmtCurrency(result.reward.amount)}** added to your wallet.${capNote}`;
}

function buildResultEmbed(result: LoadedDiceRollResult, thumbnailUrl: string | null): EmbedBuilder {
  const shattered = result.shattered;
  const title = shattered
    ? `The Dice Shattered on Roll #${result.rollNumber}`
    : `${result.category[0]}${result.category.slice(1).toLowerCase()} Reward — Roll #${result.rollNumber}`;
  const fateText = shattered
    ? `${Mascot.Emotes.Rip} The relic broke after paying out. The reward is safe, but you must buy a new die.`
    : `${Mascot.Emotes.Success} The die survived. Its condition is now **${result.conditionAfter}**.`;
  const rollCountText = shattered
    ? `**${result.rollNumber}** on the shattered die\nNew dice begin at **0**`
    : `**${result.completedRolls}**`;

  return withDiceThumbnail(
    new EmbedBuilder()
      .setColor(shattered ? 0xE74C3C : CATEGORY_COLORS[result.category])
      .setTitle(title)
      .setDescription(`${diceEmoji()} The cursed die stops spinning...`)
      .addFields(
        { name: `${Mascot.Emotes.Lootbox} ${result.category} Prize`, value: rewardText(result) },
        { name: `${Mascot.Emotes.Dices} Fate`, value: fateText },
        { name: `${Mascot.Emotes.GraphUp} Roll Count`, value: rollCountText, inline: true },
        { name: `${Mascot.Emotes.Cooldown} Daily Lock Ends`, value: `<t:${unix(result.nextRollAt)}:R>`, inline: true },
      )
      .setFooter({ text: "Loaded Dice rewards are not affected by global Luck." }),
    thumbnailUrl,
  );
}

function buildFailureEmbed(error: unknown, thumbnailUrl: string | null): EmbedBuilder {
  const description = error instanceof LoadedDiceError
    ? error.message
    : "The roll could not be completed. Nothing was consumed; please try again.";
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle("The Dice Refused to Roll")
    .setDescription(`${Mascot.Emotes.Fail} ${description}`);

  if (error instanceof LoadedDiceError && error.availableAt) {
    embed.addFields({
      name: `${Mascot.Emotes.Cooldown} Next Roll`,
      value: `<t:${unix(error.availableAt)}:R>`,
    });
  }
  return withDiceThumbnail(embed, thumbnailUrl);
}

function confirmationButtons(ownerId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`loaded_dice:roll:${ownerId}`)
      .setLabel("Roll the Dice")
      .setEmoji(diceEmoji())
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`loaded_dice:cancel:${ownerId}`)
      .setLabel("Walk Away")
      .setEmoji(Mascot.Emotes.Decline)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

async function denyOtherUser(interaction: ButtonInteraction, ownerId: string): Promise<boolean> {
  if (interaction.user.id === ownerId) return false;
  await interaction.reply({ content: "This Loaded Dice belongs to someone else.", ephemeral: true });
  return true;
}

export async function handleRoll(message: Message, prefix: string): Promise<unknown> {
  const visual = diceAttachment();
  const files = visual.attachment ? [visual.attachment] : [];
  const status = await getLoadedDiceStatus(message.author.id);

  if (!status.owned) {
    return message.reply({ embeds: [buildNoDiceEmbed(prefix, visual.thumbnailUrl)], files });
  }
  if (!status.canRoll && status.nextRollAt) {
    return message.reply({
      embeds: [buildCooldownEmbed(status.completedRolls, status.nextRollAt, visual.thumbnailUrl)],
      files,
    });
  }

  const sent = await message.reply({
    embeds: [buildConfirmationEmbed(status.nextRollNumber, status.condition, visual.thumbnailUrl)],
    components: [confirmationButtons(message.author.id)],
    files,
  });

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: CONFIRM_WINDOW_MS,
    filter: (interaction) => interaction.customId.startsWith("loaded_dice:"),
  });
  let resolved = false;

  collector.on("collect", async (interaction) => {
    if (await denyOtherUser(interaction, message.author.id)) return;

    if (interaction.customId.startsWith("loaded_dice:cancel:")) {
      resolved = true;
      collector.stop("cancelled");
      await interaction.update({
        embeds: [
          withDiceThumbnail(
            new EmbedBuilder()
              .setColor(DICE_COLOR)
              .setTitle("The Dice Waits")
              .setDescription(`${diceEmoji()} You stepped away. Your daily roll and die were left untouched.`),
            visual.thumbnailUrl,
          ),
        ],
        components: [],
      });
      return;
    }

    resolved = true;
    collector.stop("rolled");
    await interaction.deferUpdate();
    try {
      const result = await rollLoadedDice(message.author.id);
      await interaction.editReply({
        embeds: [buildResultEmbed(result, visual.thumbnailUrl)],
        components: [],
      });
    } catch (error) {
      console.error("Loaded Dice roll failed:", error);
      await interaction.editReply({
        embeds: [buildFailureEmbed(error, visual.thumbnailUrl)],
        components: [],
      });
    }
  });

  collector.on("end", async () => {
    if (resolved) return;
    try {
      await sent.edit({ components: [confirmationButtons(message.author.id, true)] });
    } catch {
      // The command message may have been removed before its confirmation expired.
    }
  });

  return sent;
}
