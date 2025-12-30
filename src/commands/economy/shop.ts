import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ComponentType,
  GuildMember,
  ButtonInteraction,
  CacheType
} from "discord.js";
import { getShopItems, buyItem, getUserInventory } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { logToChannel } from "../../utils/discordLogger";

const ITEMS_PER_PAGE = 5;

import { Mascot, getEmoteUrl } from "../../config/branding";

function renderShopPage(items: any[], page: number, totalPages: number, currencyEmoji: string) {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const currentItems = items.slice(start, start + ITEMS_PER_PAGE);



  const embed = new EmbedBuilder()
    .setTitle(`Shop`)
    .setColor(Mascot.Colors.Base as any)
    .setFooter({ text: `${Mascot.Name} • Page ${page}/${totalPages} • Use buttons to buy` + "\u3000".repeat(25) });

  const url = getEmoteUrl(Mascot.Emotes.Money);
  if (url) embed.setThumbnail(url);

  if (currentItems.length > 0) {
    currentItems.forEach((item, index) => {
      const itemNumber = (page - 1) * ITEMS_PER_PAGE + index + 1;
      const name = `${itemNumber}. ${item.name} — ${fmtCurrency(item.price, currencyEmoji)}`;
      const value = `${item.description || "No description"}` + "\u3000".repeat(20);
      embed.addFields({ name, value, inline: false });
    });
  } else {
    embed.setDescription("No items available.");
  }

  const buyRow = new ActionRowBuilder<ButtonBuilder>();
  currentItems.forEach((item, index) => {
    buyRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_buy_${item.id}`)
        .setLabel(`${(page - 1) * ITEMS_PER_PAGE + index + 1}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji("🛒")
    );
  });

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("shop_prev").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("shop_next").setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  );

  const components = currentItems.length > 0 ? [buyRow, navRow] : [navRow];
  return { embed, components };
}

export async function handleShop(message: Message, args: string[]) {
  try {
    const config = await getGuildConfig(message.guildId!);
    const emoji = config.currencyEmoji;
    const sub = args[0]?.toLowerCase();

    if (sub === "buy") {
      const itemName = args.slice(1).join(" ");
      if (!itemName) return message.reply(`Usage: \`${config.prefix}shop buy <item name>\``);

      try {
        await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
        const item = await buyItem(message.guildId!, message.author.id, itemName);

        if (item.roleId && message.guild) {
          const role = message.guild.roles.cache.get(item.roleId);
          if (role) try { await message.member?.roles.add(role); } catch { }
        }

        await logToChannel(message.client, {
          guild: message.guild!,
          type: "MARKET",
          title: "Shop Purchase",
          description: `**User:** ${message.author.tag}\n**Item:** ${item.name}\n**Price:** ${fmtCurrency(item.price, emoji)}`,
          color: 0x00FF00
        });

        return message.reply({ embeds: [successEmbed(message.author, "Purchase Successful", `You bought **${item.name}**!`)] });
      } catch (err) {
        return message.reply({ embeds: [errorEmbed(message.author, "Failed", (err as Error).message)] });
      }
    }

    if (sub === "inv" || sub === "inventory") {
      const inv = await getUserInventory(message.author.id, message.guildId!);
      if (inv.length === 0) return message.reply("Your inventory is empty.");
      const desc = inv.map(i => `• **${i.shopItem.name}** (x${i.amount})`).join("\n");
      const embed = new EmbedBuilder().setTitle(`${message.author.username}'s Inventory`).setColor(Colors.Blue).setDescription(desc || "Empty");
      return message.reply({ embeds: [embed] });
    }

    const allItems = await getShopItems(message.guildId!);
    if (allItems.length === 0) return message.reply({ embeds: [errorEmbed(message.author, "Shop Empty", "No items are currently for sale.")] });

    allItems.sort((a, b) => a.price - b.price);

    let currentPage = 1;
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    const ui = renderShopPage(allItems, currentPage, totalPages, emoji);
    const sentMessage = await message.reply({ embeds: [ui.embed], components: ui.components });

    const collector = sentMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "shop_prev") {
        currentPage--;
        const newUI = renderShopPage(allItems, currentPage, totalPages, emoji);
        await interaction.update({ embeds: [newUI.embed], components: newUI.components });
        return;
      }
      if (interaction.customId === "shop_next") {
        currentPage++;
        const newUI = renderShopPage(allItems, currentPage, totalPages, emoji);
        await interaction.update({ embeds: [newUI.embed], components: newUI.components });
        return;
      }
      if (interaction.customId.startsWith("shop_buy_")) {
        const itemId = interaction.customId.replace("shop_buy_", "");
        const item = allItems.find(i => i.id === itemId);
        if (!item) return interaction.reply({ content: "Item not found.", ephemeral: true });

        try {
          await interaction.deferReply({ ephemeral: true });
          await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
          const bought = await buyItem(interaction.guildId!, interaction.user.id, item.name);

          if (bought.roleId && interaction.guild) {
            const role = interaction.guild.roles.cache.get(bought.roleId);
            if (role) {
              const member = interaction.member as GuildMember;
              try { await member.roles.add(role); } catch { }
            }
          }

          await logToChannel(interaction.client, {
            guild: interaction.guild!,
            type: "MARKET",
            title: "Shop Purchase",
            description: `**User:** ${interaction.user.tag}\n**Item:** ${bought.name}\n**Price:** ${fmtCurrency(bought.price, emoji)}`,
            color: 0x00FF00
          });

          await interaction.editReply({ content: `${Mascot.Emotes.Accept} Purchased **${bought.name}** for **${fmtCurrency(bought.price, emoji)}**!` });
        } catch (err) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} Error: ${(err as Error).message}` });
          } else {
            await interaction.reply({ content: `${Mascot.Emotes.Fail} Error: ${(err as Error).message}`, ephemeral: true });
          }
        }
      }
    });

    collector.on("end", () => {
      try {
        const finalUI = renderShopPage(allItems, currentPage, totalPages, emoji);
        finalUI.components.forEach(row => row.components.forEach(c => c.setDisabled(true)));
        sentMessage.edit({ components: finalUI.components }).catch(() => { });
      } catch { }
    });

  } catch (err) {
    console.error("handleShop error:", err);
    try { await message.reply("Failed to load shop."); } catch { }
  }
}
