
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ComponentType,
  ButtonInteraction,
  GuildMember
} from "discord.js";
import { getShopItems, buyItem } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";

const ITEMS_PER_PAGE = 5;

// Helper to render the shop page with "Price Tag" visuals and Direct Buy Buttons
async function renderStorePage(interaction: ChatInputCommandInteraction, items: any[], page: number, emoji: string) {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  page = Math.max(1, Math.min(page, totalPages));

  const start = (page - 1) * ITEMS_PER_PAGE;
  const currentItems = items.slice(start, start + ITEMS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle("🛒 Store")
    .setColor(Colors.DarkGrey)
    .setFooter({ text: `Page ${page}/${totalPages} • Click the buttons below to buy OR use /buy <name>` });

  if (currentItems.length > 0) {
    const description = currentItems.map((item, index) => {
      const stockText = item.stock === -1 ? "" : ` • Stock: ${item.stock}`;
      const buyAction = `</buy:0>`; // We don't have ID handy easily without fetching, just text hint or generic
      const displayEmoji = (item as any).emoji || emoji;

      return `**${displayEmoji} ${item.name}** — **${fmtCurrency(item.price, emoji)}**\n*${item.description || "No description"}*${stockText}`;
    }).join("\n\n");

    embed.setDescription(description);
  } else {
    embed.setDescription("No items available.");
  }

  const buyRow = new ActionRowBuilder<ButtonBuilder>();
  if (currentItems.length > 0) {
    currentItems.forEach((item) => {
      buyRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_buy_${item.id}`)
          .setLabel(item.name.length > 20 ? item.name.substring(0, 18) + ".." : item.name)
          .setStyle(ButtonStyle.Success)
          .setEmoji("🛒")
      );
    });
  }

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`shop_prev`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`shop_next`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  );

  const components = currentItems.length > 0 ? [buyRow, navRow] : [navRow];
  return { embed, components, page, totalPages };
}

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("View the server shop");

export async function execute(interaction: ChatInputCommandInteraction) {
  const config = await getGuildConfig(interaction.guildId!);
  const emoji = config.currencyEmoji;

  try {
    await interaction.deferReply();
    const allItems = await getShopItems(interaction.guildId!);

    if (allItems.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Shop Empty", "No items are currently for sale.")] });
    }

    allItems.sort((a, b) => a.price - b.price);

    let currentPage = 1;
    const ui = await renderStorePage(interaction, allItems, currentPage, emoji);
    const sentMessage = await interaction.editReply({ embeds: [ui.embed], components: ui.components });

    const collector = sentMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000, filter: (i) => i.user.id === interaction.user.id });

    collector.on("collect", async (btnInteraction: ButtonInteraction) => {
      if (btnInteraction.customId === "shop_prev") {
        currentPage--;
        const newUI = await renderStorePage(interaction, allItems, currentPage, emoji);
        await btnInteraction.update({ embeds: [newUI.embed], components: newUI.components });
        return;
      }

      if (btnInteraction.customId === "shop_next") {
        currentPage++;
        const newUI = await renderStorePage(interaction, allItems, currentPage, emoji);
        await btnInteraction.update({ embeds: [newUI.embed], components: newUI.components });
        return;
      }

      if (btnInteraction.customId.startsWith("shop_buy_")) {
        const itemId = btnInteraction.customId.replace("shop_buy_", "");
        const item = allItems.find(i => i.id === itemId);

        if (!item) {
          await btnInteraction.reply({ content: "Item no longer exists.", ephemeral: true });
          return;
        }

        try {
          await ensureUserAndWallet(btnInteraction.user.id, btnInteraction.guildId!, btnInteraction.user.tag);
          const { item: bought, results } = await buyItem(btnInteraction.guildId!, btnInteraction.user.id, item.name);

          if (bought.roleId && btnInteraction.guild) {
            const role = btnInteraction.guild.roles.cache.get(bought.roleId);
            if (role) {
              const member = btnInteraction.member as GuildMember;
              try { await member.roles.add(role); } catch (e) { }
            }
          }

          await btnInteraction.reply({
            content: `${Mascot.Emotes.Accept} Successfully purchased **${bought.name}** for **${fmtCurrency(bought.price, emoji)}**.`,
            ephemeral: true
          });

          if (results && results.length > 0) {
            const customMessages = results.filter((r: any) => r.type === "CUSTOM_MESSAGE");
            const otherEffects = results.filter((r: any) => r.type !== "CUSTOM_MESSAGE");

            for (const msgEffect of customMessages) {
              const msgEmbed = new EmbedBuilder().setColor(Colors.Gold).setDescription(msgEffect.message);
              if (btnInteraction.channel && 'send' in btnInteraction.channel) await (btnInteraction.channel as any).send({ embeds: [msgEmbed] });
            }

            if (otherEffects.length > 0) {
              const effectMsg = otherEffects.map((r: any) => r.message).join("\n");
              const effectEmbed = new EmbedBuilder().setColor(Colors.Gold).setDescription(effectMsg);
              await btnInteraction.followUp({ embeds: [effectEmbed], ephemeral: true });
            }
          }
        } catch (err) {
          await btnInteraction.reply({ content: `${Mascot.Emotes.Fail} Purchase failed: ${(err as Error).message}`, ephemeral: true });
        }
      }
    });

    collector.on("end", async () => {
      try {
        const endUI = await renderStorePage(interaction, allItems, currentPage, emoji);
        const disabledRows = endUI.components.map(row => { row.components.forEach(btn => btn.setDisabled(true)); return row; });
        sentMessage.edit({ components: disabledRows }).catch(() => { });
      } catch { }
    });

  } catch (err) {
    if (interaction.replied || interaction.deferred) await interaction.followUp("Failed to load shop.");
    else await interaction.reply("Failed to load shop.");
  }
}