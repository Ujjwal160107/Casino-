import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { handleSpecialItemUse } from "../../services/shopItemEffects";
import { GENERAL_SHOP_CATALOG } from "../../utils/shopCatalog";
import { useItem } from "../../services/shopService";

const ITEMS_PER_PAGE = 4;
const INV_ACCENT_COLOR = 0x9B59B6;
const COLLECTOR_TIMEOUT = 120_000;

function v2Container(title: string, body: string, accentColor = INV_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

async function getGlobalInventory(discordId: string) {
  return prisma.inventory.findMany({
    where: { userId: discordId },
    include: { shopItem: true },
    orderBy: { shopItem: { name: "asc" } },
  }) as any;
}

function findCatalogKeyByName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  const item = GENERAL_SHOP_CATALOG.find(i => i.name.toLowerCase() === normalized);
  return item?.key ?? null;
}

function buildInventoryContainer(
  items: any[],
  page: number,
  totalPages: number,
  username: string,
  ownerId: string,
  disabled = false
) {
  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const start = (safePage - 1) * ITEMS_PER_PAGE;
  const currentItems = items.slice(start, start + ITEMS_PER_PAGE);
  const netWorth = items.reduce((sum: number, slot: any) => sum + (slot.shopItem.price * slot.amount), 0);

  const container = new ContainerBuilder()
    .setAccentColor(INV_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🎒 ${username}'s Inventory\n` +
        `-# ${items.length} item${items.length !== 1 ? "s" : ""} • Net value: ${fmtCurrency(netWorth)} • Page ${safePage}/${totalPages}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

  if (currentItems.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Your inventory is empty. Check out `shop` to buy items!"),
    );
    return container;
  }

  currentItems.forEach((slot: any, index: number) => {
    const item = slot.shopItem;
    const isUsable = item.usable || item.consumable;

    const section = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${item.name}  ×${slot.amount}\n` +
        `${Mascot.Emotes.Currency} ${item.price.toLocaleString("en-US")} each`,
      ),
      new TextDisplayBuilder().setContent(
        `-# ${item.description?.slice(0, 80) || "No description"}`,
      ),
    );

    if (isUsable) {
      section.setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`inv_use:${item.id}:${ownerId}`)
          .setLabel("Use")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
      );
    } else {
      section.setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`inv_info:${item.id}:${ownerId}`)
          .setLabel("Info")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      );
    }

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
  });

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# 💡 \`use <item name>\` • \`shop\` to buy more`,
    ),
  );

  return container;
}

function buildNavigation(page: number, totalPages: number, ownerId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_prev:${ownerId}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId(`inv_page:${ownerId}`)
      .setLabel(`${page}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`inv_next:${ownerId}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages),
  );
}

function buildInventoryMessage(items: any[], page: number, username: string, ownerId: string, disabled = false) {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const container = buildInventoryContainer(items, page, totalPages, username, ownerId, disabled);

  const components: any[] = [container];
  if (totalPages > 1) {
    components.push(buildNavigation(page, totalPages, ownerId, disabled));
  }

  return { components, flags: MessageFlags.IsComponentsV2 } as any;
}

export async function handleInventory(message: Message, args: string[]) {
  try {
    let targetUser = message.mentions.users.first() || message.author;
    if (targetUser.bot) {
      return message.reply({
        components: [v2Container("Error", "Bots cannot hold items.", 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);
    const items = await getGlobalInventory(targetUser.id);
    const ownerId = message.author.id;

    if (items.length === 0) {
      return message.reply({
        components: [v2Container(`${targetUser.username}'s Inventory`, "Inventory is empty. Check out `shop` to buy items!")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    let currentPage = 1;
    const payload = buildInventoryMessage(items, currentPage, targetUser.username, ownerId);
    const sentMessage = await message.reply(payload);

    const collector = sentMessage.createMessageComponentCollector({
      time: COLLECTOR_TIMEOUT,
      filter: (i) => i.user.id === ownerId,
    });

    collector.on("collect", async (interaction) => {
      const customId = interaction.customId;

      if (customId === `inv_prev:${ownerId}`) {
        currentPage = Math.max(1, currentPage - 1);
        const payload = buildInventoryMessage(items, currentPage, targetUser.username, ownerId);
        await interaction.update(payload);
        return;
      }

      if (customId === `inv_next:${ownerId}`) {
        const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
        currentPage = Math.min(totalPages, currentPage + 1);
        const payload = buildInventoryMessage(items, currentPage, targetUser.username, ownerId);
        await interaction.update(payload);
        return;
      }

      if (customId.startsWith("inv_use:") && customId.endsWith(`:${ownerId}`)) {
        if (targetUser.id !== ownerId) {
          await interaction.reply({
            content: "❌ You can only use items from your own inventory.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const itemId = customId.split(":")[1];
        const slot = items.find((s: any) => s.shopItem.id === itemId);
        if (!slot) {
          await interaction.reply({ content: "❌ Item not found.", flags: MessageFlags.Ephemeral });
          return;
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const { item, results } = await useItem(
            ownerId,
            message.guildId!,
            slot.shopItem.name,
            message.member!,
          );

          const catalogKey = findCatalogKeyByName(item.name);
          let replyText: string;

          if (catalogKey) {
            const specialResult = await handleSpecialItemUse(catalogKey, ownerId, message.guildId!, message.member!);
            if (specialResult) {
              replyText = specialResult.message;
            } else {
              replyText = results.map((r: any) => r.message).join("\n") || "✨ Item used!";
            }
          } else {
            replyText = results.map((r: any) => r.message).join("\n") || "✨ Item used!";
          }

          await interaction.editReply({ content: replyText });

          slot.amount -= 1;
          const updatedItems = items.filter((s: any) => s.amount > 0);
          const totalPages = Math.max(1, Math.ceil(updatedItems.length / ITEMS_PER_PAGE));
          currentPage = Math.min(currentPage, totalPages);
          const newPayload = buildInventoryMessage(updatedItems, currentPage, targetUser.username, ownerId);
          await sentMessage.edit(newPayload).catch(() => {});
        } catch (err: any) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `❌ ${err.message}` });
          } else {
            await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
          }
        }
        return;
      }

      if (customId.startsWith("inv_info:") && customId.endsWith(`:${ownerId}`)) {
        const itemId = customId.split(":")[1];
        const slot = items.find((s: any) => s.shopItem.id === itemId);
        if (!slot) {
          await interaction.reply({ content: "❌ Item not found.", flags: MessageFlags.Ephemeral });
          return;
        }

        const item = slot.shopItem;
        await interaction.reply({
          content: `**${item.name}**\n${item.description || "No description"}\nType: ${item.itemType} • ${item.consumable ? "Consumable" : "Non-consumable"}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    });

    collector.on("end", () => {
      try {
        const payload = buildInventoryMessage(items, currentPage, targetUser.username, ownerId, true);
        sentMessage.edit(payload).catch(() => {});
      } catch {}
    });
  } catch (err) {
    console.error("Inventory Error:", err);
    return message.reply({
      components: [v2Container("Error", "Failed to fetch inventory.", 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
