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
import { ensureUserAndWallet } from "../../services/walletService";
import { getBankByUserId } from "../../services/bankService";
import { getUserInventory } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { emojiInline } from "../../utils/emojiRegistry";
import { generateProfileImage } from "../../services/imageService";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleProfile(message: Message, args: string[]) {
  try {
    const targetUser = message.mentions.users.first() || message.author;
    if (targetUser.bot) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Bots do not have profiles.")] });
    const user = await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);
    const [inventory, bank, config] = await Promise.all([
      getUserInventory(targetUser.id, message.guildId!),
      getBankByUserId(user.id),
      getGuildConfig(message.guildId!)
    ]);
    const currencyEmoji = config.currencyEmoji;
    const walletBal = user.wallet?.balance ?? 0;
    const bankBal = bank?.balance ?? 0;
    const inventoryValue = inventory.reduce((sum, slot) => {
      return sum + (slot.shopItem.price * slot.amount);
    }, 0);
    const netWorth = walletBal + bankBal + inventoryValue;
    let attachment: AttachmentBuilder;
    try {
      attachment = await generateProfileImage(
        { username: targetUser.username, creditScore: user.creditScore, level: user.level },
        walletBal,
        bankBal,
        netWorth,
        targetUser.displayAvatarURL({ extension: "png", size: 256 }),
        user.profileTheme
      );
    } catch (e) {
      console.error("Canvas Error:", e);
      return message.reply("Failed to generate profile image.");
    }
    const eWallet = emojiInline("wallet", message.guild) || "👛";
    const eInv = emojiInline("inventory", message.guild) || "🎒";
    const eGraph = emojiInline("graph", message.guild) || "📈";
    const parseEmojiForButton = (str: string) => str.match(/:(\d+)>/)?.[1] ?? (str.match(/^\d+$/) ? str : str);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("prof_inv")
        .setLabel("Inventory")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(parseEmojiForButton(eInv)),
      new ButtonBuilder()
        .setCustomId("prof_bal")
        .setLabel("Balance")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(parseEmojiForButton(eWallet))
    );
    const sentMsg = await message.reply({
      files: [attachment],
      components: [row]
    });
    const collector = sentMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.user.id === message.author.id
    });
    collector.on("collect", async (interaction: ButtonInteraction) => {
      if (interaction.customId === "prof_inv") {
        if (inventory.length === 0) {
          await interaction.reply({ content: "Inventory is empty.", ephemeral: true });
        } else {
          const itemsList = inventory.slice(0, 10).map(i => `• ${i.shopItem.name} (x${i.amount})`).join("\n");


          const invEmbed = new EmbedBuilder()
            .setTitle(`Quick Inventory`)
            .setColor(Mascot.Colors.Base as any)
            .setDescription(itemsList + (inventory.length > 10 ? `\n...and ${inventory.length - 10} more` : ""));

          const thinkUrl = getEmoteUrl(Mascot.Emotes.Think);
          if (thinkUrl) invEmbed.setThumbnail(thinkUrl);

          await interaction.reply({ embeds: [invEmbed], ephemeral: true });
        }
      }
      if (interaction.customId === "prof_bal") {
        const balEmbed = new EmbedBuilder()
          .setTitle(`Detailed Balance`)
          .setColor(Colors.Green)
          .addFields(
            { name: "Wallet", value: fmtCurrency(walletBal, currencyEmoji), inline: true },
            { name: "Bank", value: fmtCurrency(bankBal, currencyEmoji), inline: true },
            { name: "Inventory", value: fmtCurrency(inventoryValue, currencyEmoji), inline: true },
            { name: "Net Worth", value: fmtCurrency(netWorth, currencyEmoji), inline: true }
          )
          .setFooter({ text: `${Mascot.Name} Private View` });

        const moneyUrl = getEmoteUrl(Mascot.Emotes.Money);
        if (moneyUrl) balEmbed.setThumbnail(moneyUrl);

        await interaction.reply({ embeds: [balEmbed], ephemeral: true });
      }
    });
    collector.on("end", () => {
      try {
        const disabledRow = ActionRowBuilder.from(row).setComponents(
          row.components.map(c => ButtonBuilder.from(c).setDisabled(true))
        );
        sentMsg.edit({ components: [disabledRow as ActionRowBuilder<ButtonBuilder>] }).catch(() => { });
      } catch { }
    });
  } catch (err) {
    console.error("Profile Error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Error", "Failed to load profile.")] });
  }
}