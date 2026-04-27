import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  GuildMember,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextChannel,
  TextDisplayBuilder,
} from "discord.js";
import { getShopItems, buyItem, getUserInventory } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { Mascot } from "../../config/branding";

const ITEMS_PER_PAGE = 3;
const SHOP_ACCENT_COLOR = 0x9B59B6;

function formatAmount(amount: number) {
  return amount.toLocaleString("en-US");
}

function v2Container(title: string, body: string, accentColor = SHOP_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function getShopTotalPages(items: any[]) {
  return Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
}

function buildShopContainer(items: any[], page: number, totalPages: number, currencyEmoji: string, disabled = false) {
  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const start = (safePage - 1) * ITEMS_PER_PAGE;
  const currentItems = items.slice(start, start + ITEMS_PER_PAGE);
  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Name} Shop\n> Browse server items and buy directly from the buttons.\n> Prices use this server's configured currency.`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    );

  if (currentItems.length === 0) {
    return container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("No items available."),
    );
  }

  currentItems.forEach((item, index) => {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${start + index + 1}. ${item.name}`),
          new TextDisplayBuilder().setContent(item.description || "No description"),
          new TextDisplayBuilder().setContent(`Price: **${currencyEmoji} ${formatAmount(item.price)}**`),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`shop_buy_${item.id}`)
            .setLabel("Buy")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        ),
    );

    if (index < currentItems.length - 1) {
      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      );
    }
  });

  return container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`Page ${safePage}/${totalPages} - Use \`shop buy <item name>\` to purchase by name.`),
  );
}

function buildShopNavigationRow(page: number, totalPages: number, disabled = false) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_page_first_1")
      .setLabel("First")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`shop_page_prev_${Math.max(1, safePage - 1)}`)
      .setLabel("Prev")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`shop_page_next_${Math.min(safeTotalPages, safePage + 1)}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || safePage >= safeTotalPages),
    new ButtonBuilder()
      .setCustomId(`shop_page_last_${safeTotalPages}`)
      .setLabel("Last")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage >= safeTotalPages),
  );
}

async function sendEffectMessages(target: Message | any, results: any[]) {
  if (!results || results.length === 0) return;

  const customMessages = results.filter((r: any) => r.type === "CUSTOM_MESSAGE");
  const otherEffects = results.filter((r: any) => r.type !== "CUSTOM_MESSAGE");

  for (const msgEffect of customMessages) {
    if ("followUp" in target) {
      await target.followUp({
        components: [v2Container("Item Effect", msgEffect.message, 0xF1C40F)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } else if ("send" in target.channel) {
      await (target.channel as TextChannel).send({
        components: [v2Container("Item Effect", msgEffect.message, 0xF1C40F)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  if (otherEffects.length > 0) {
    const effectMsg = otherEffects.map((r: any) => r.message).join("\n");
    if ("followUp" in target) {
      await target.followUp({
        components: [v2Container("Item Effects", effectMsg, 0xF1C40F)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } else if ("send" in target.channel) {
      await (target.channel as TextChannel).send({
        components: [v2Container("Item Effects", effectMsg, 0xF1C40F)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }
}

export async function handleShop(message: Message, args: string[]) {
  try {
    const config = await getGuildConfig(message.guildId!);
    const emoji = config.currencyEmoji || Mascot.Emotes.Blackcoin;
    const sub = args[0]?.toLowerCase();

    if (sub === "buy") {
      const itemName = args.slice(1).join(" ");
      if (!itemName) {
        return message.reply({
          components: [v2Container("Shop Purchase", `Usage: \`${config.prefix}shop buy <item name>\``)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      try {
        await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
        if (!message.member) return;
        const { item, results } = await buyItem(message.guildId!, message.author.id, itemName, message.member);

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

        await message.reply({
          components: [v2Container("Purchase Successful", `You bought **${item.name}**!`, 0x2ECC71)],
          flags: MessageFlags.IsComponentsV2,
        });

        await sendEffectMessages(message, results);
        return;
      } catch (err) {
        return message.reply({
          components: [v2Container("Purchase Failed", (err as Error).message, 0xE74C3C)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }

    if (sub === "inv" || sub === "inventory") {
      const inv = await getUserInventory(message.author.id, message.guildId!);
      if (inv.length === 0) {
        return message.reply({
          components: [v2Container("Inventory", "Your inventory is empty.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const desc = inv.map(i => `**${i.shopItem.name}** (x${i.amount})`).join("\n");
      return message.reply({
        components: [v2Container(`${message.author.username}'s Inventory`, desc)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const allItems = await getShopItems(message.guildId!);
    if (allItems.length === 0) {
      return message.reply({
        components: [v2Container("Shop Empty", "No items are currently for sale.", 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    allItems.sort((a, b) => a.price - b.price);

    let currentPage = 1;
    const totalPages = getShopTotalPages(allItems);

    const sentMessage = await message.reply({
      components: [
        buildShopContainer(allItems, currentPage, totalPages, emoji),
        buildShopNavigationRow(currentPage, totalPages),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = sentMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId.startsWith("shop_page_")) {
        const customIdParts = interaction.customId.split("_");
        currentPage = parseInt(customIdParts[customIdParts.length - 1] || "1", 10) || 1;
        await interaction.update({
          components: [
            buildShopContainer(allItems, currentPage, totalPages, emoji),
            buildShopNavigationRow(currentPage, totalPages),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (interaction.customId.startsWith("shop_buy_")) {
        const itemId = interaction.customId.replace("shop_buy_", "");
        const item = allItems.find(i => i.id === itemId);
        if (!item) {
          return interaction.reply({
            components: [v2Container("Item Not Found", "Item not found.", 0xE74C3C)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
          await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
          const { item: bought, results } = await buyItem(interaction.guildId!, interaction.user.id, itemId, interaction.member as GuildMember, true);

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

          await interaction.editReply({
            components: [
              v2Container(
                "Purchase Successful",
                `Purchased **${bought.name}** for **${fmtCurrency(bought.price, emoji)}**!`,
                0x2ECC71,
              ),
            ],
          });

          await sendEffectMessages(interaction, results);
        } catch (err) {
          const errorContainer = v2Container("Purchase Failed", (err as Error).message, 0xE74C3C);
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ components: [errorContainer] });
          } else {
            await interaction.reply({
              components: [errorContainer],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
          }
        }
      }
    });

    collector.on("end", () => {
      try {
        sentMessage.edit({
          components: [
            buildShopContainer(allItems, currentPage, totalPages, emoji, true),
            buildShopNavigationRow(currentPage, totalPages, true),
          ],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => { });
      } catch { }
    });

  } catch (err) {
    console.error("handleShop error:", err);
    try {
      await message.reply({
        components: [v2Container("Shop Error", "Failed to load shop.", 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch { }
  }
}
