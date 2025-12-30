import { Message, EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getUserInventory } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency, fmtAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleInventory(message: Message, args: string[]) {
  try {
    let targetUser = message.mentions.users.first() || message.author;
    if (targetUser.bot) {
      return message.reply({ embeds: [errorEmbed(message.author, "Error", "Bots cannot hold items.")] });
    }
    await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);
    const config = await getGuildConfig(message.guildId!);
    let emoji = config.currencyEmoji;
    if (/^\d+$/.test(emoji)) {
      const resolved = message.guild?.emojis.cache.get(emoji);
      emoji = resolved ? resolved.toString() : "💰";
    }
    const items = await getUserInventory(targetUser.id, message.guildId!);
    const eInv = emojiInline("inventory", message.guild) || "🎒";



    if (items.length === 0) {
      const url = getEmoteUrl(Mascot.Emotes.Think);
      const emptyEmbed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Inventory`)
        .setColor(Mascot.Colors.Base as any)
        .setDescription(`Your inventory is empty.\nCheck out the store with \`${config.prefix}shop\`!`)
        .setTimestamp();
      if (url) emptyEmbed.setThumbnail(url);
      return message.reply({ embeds: [emptyEmbed] });
    }

    const netWorth = items.reduce((sum, slot) => sum + (slot.shopItem.price * slot.amount), 0);
    const options = items.slice(0, 25).map(slot => ({
      label: `${slot.shopItem.name} (x${slot.amount})`,
      description: `Value: ${fmtAmount(slot.shopItem.price)} | Quick Sell: ${fmtAmount(Math.floor(slot.shopItem.price * 0.5))}`,
      value: slot.shopItem.id
    }));

    const displayItems = items.slice(0, 15);
    const description = displayItems.map((slot, index) => {
      const item = slot.shopItem;
      return `**${index + 1}. ${item.name}**\n` +
        `Quantity: \`x${slot.amount}\` • Price: ${fmtCurrency(item.price, emoji)}`;
    }).join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username}'s Inventory`)
      .setColor(Mascot.Colors.Base as any)
      .setDescription(description)
      .addFields({
        name: `Total Asset Value`,
        value: fmtCurrency(netWorth, emoji),
        inline: false
      })
      .setFooter({ text: `${Mascot.Name} • Select an item below to Sell, Trade, or List.` })
      .setTimestamp();

    // Use Money emote for populated inventory or keep eInv if it was significant? 
    // The user wants "custom emojis as thumbnails". Money fits "Asset Value".
    const moneyUrl = getEmoteUrl(Mascot.Emotes.Money);
    if (moneyUrl) embed.setThumbnail(moneyUrl);

    const rows = [];
    if (targetUser.id === message.author.id) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("inv_select_item")
        .setPlaceholder("Select an item to manage...")
        .addOptions(options);
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    }
    return message.reply({ embeds: [embed], components: rows });
  } catch (err) {
    console.error("Inventory Error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Error", "Failed to fetch inventory.")] });
  }
}