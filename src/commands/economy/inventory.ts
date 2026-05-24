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
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { handleSpecialItemUse } from "../../services/shopItemEffects";
import {
  COCK_SHOP_CATALOG,
  GENERAL_SHOP_CATALOG,
  HUNT_SHOP_CATALOG,
  JOB_SHOP_CATALOG,
  SHOP_CATALOG,
  UNI_SHOP_CATALOG,
} from "../../utils/shopCatalog";
import { useItem } from "../../services/shopService";

const ITEMS_PER_PAGE = 5;
const INV_ACCENT_COLOR = 0x9B59B6;
const COLLECTOR_TIMEOUT = 120_000;

type InventorySlot = Awaited<ReturnType<typeof getInventory>>[number];
type InventoryCategory = "ALL" | "GENERAL" | "HUNT" | "JOB" | "UNI" | "COCK" | "OTHER";

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  ALL: "All Items",
  GENERAL: "General",
  HUNT: "Hunt",
  JOB: "Job",
  UNI: "Uni",
  COCK: "Cock",
  OTHER: "Other",
};

const CATEGORY_ORDER: InventoryCategory[] = ["ALL", "GENERAL", "HUNT", "JOB", "UNI", "COCK", "OTHER"];

const CATALOGS = [
  ...GENERAL_SHOP_CATALOG,
  ...HUNT_SHOP_CATALOG,
  ...JOB_SHOP_CATALOG,
  ...UNI_SHOP_CATALOG,
  ...COCK_SHOP_CATALOG,
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findCatalogByName(name: string) {
  const norm = normalize(name);
  return CATALOGS.find((item) => normalize(item.name) === norm) ?? SHOP_CATALOG.find((item) => normalize(item.name) === norm);
}

function categoryOf(slot: InventorySlot): InventoryCategory {
  const raw = String(slot.shopItem.category ?? "").toUpperCase();
  if (raw === "GENERAL" || raw === "HUNT" || raw === "JOB" || raw === "UNI" || raw === "COCK") return raw;

  const catalog = findCatalogByName(slot.shopItem.name);
  if (catalog?.category === "GENERAL" || catalog?.category === "HUNT" || catalog?.category === "JOB" || catalog?.category === "UNI" || catalog?.category === "COCK") {
    return catalog.category;
  }

  return "OTHER";
}

function categoryEmoji(category: InventoryCategory) {
  switch (category) {
    case "GENERAL": return Mascot.Emotes.Shop || Mascot.Emotes.Currency;
    case "HUNT": return Mascot.Emotes.Gun || Mascot.Emotes.Sparks;
    case "JOB": return Mascot.Emotes.JobWorking || Mascot.Emotes.Sparks;
    case "UNI": return Mascot.Emotes.University || Mascot.Emotes.Graduate || Mascot.Emotes.Sparks;
    case "COCK": return Mascot.Emotes.Chicken || Mascot.Emotes.Sparks;
    case "OTHER": return Mascot.Emotes.Lootbox || Mascot.Emotes.Sparks;
    default: return Mascot.Emotes.Inventory || Mascot.Emotes.Lootbox || "";
  }
}

function shortText(text: string | null | undefined, max = 130) {
  const clean = (text || "No description.").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}...`;
}

function metaSummary(meta: unknown) {
  if (!meta || typeof meta !== "object") return "";
  const data = meta as Record<string, any>;
  const parts: string[] = [];

  if (typeof data.durability === "number") parts.push(`Durability ${Math.max(0, Math.floor(data.durability))}/100`);
  if (typeof data.level === "number") parts.push(`Level ${data.level}`);
  if (typeof data.xp === "number") parts.push(`XP ${data.xp}`);
  if (data.injured) parts.push("Injured");
  if (data.critical) parts.push("Critical");
  if (data.training?.stat) parts.push(`Training ${String(data.training.stat).toUpperCase()}`);

  return parts.length > 0 ? `\n-# ${parts.join(" | ")}` : "";
}

async function getInventory(discordId: string) {
  return prisma.inventory.findMany({
    where: { userId: discordId, amount: { gt: 0 }, shopItem: { showInInventory: true } },
    include: { shopItem: true },
    orderBy: [{ shopItem: { category: "asc" } }, { shopItem: { name: "asc" } }],
  });
}

function filterInventory(items: InventorySlot[], category: InventoryCategory) {
  if (category === "ALL") return items;
  return items.filter((slot) => categoryOf(slot) === category);
}

function inventoryValue(items: InventorySlot[]) {
  return items.reduce((sum, slot) => sum + Number(slot.shopItem.price || 0) * slot.amount, 0);
}

function buildCategoryCounts(items: InventorySlot[]) {
  const counts = new Map<InventoryCategory, number>();
  for (const category of CATEGORY_ORDER) counts.set(category, 0);
  counts.set("ALL", items.length);
  for (const slot of items) {
    const cat = categoryOf(slot);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return counts;
}

function buildCategorySelect(category: InventoryCategory, items: InventorySlot[], ownerId: string, disabled = false) {
  const counts = buildCategoryCounts(items);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`inv2_cat:${ownerId}`)
      .setPlaceholder("Filter inventory")
      .setDisabled(disabled)
      .addOptions(
        CATEGORY_ORDER.map((cat) => ({
          label: CATEGORY_LABELS[cat],
          value: cat,
          description: `${counts.get(cat) ?? 0} item type${(counts.get(cat) ?? 0) === 1 ? "" : "s"}`,
          default: cat === category,
        })),
      ),
  );
}

function buildNav(page: number, totalPages: number, ownerId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv2_prev:${ownerId}`)
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId(`inv2_page:${ownerId}`)
      .setLabel(`${page}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`inv2_next:${ownerId}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages),
  );
}

function buildInventoryPayload(
  items: InventorySlot[],
  page: number,
  category: InventoryCategory,
  username: string,
  ownerId: string,
  canAct: boolean,
  disabled = false,
) {
  const filtered = filterInventory(items, category);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const currentItems = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const totalAmount = items.reduce((sum, slot) => sum + slot.amount, 0);

  const container = new ContainerBuilder()
    .setAccentColor(INV_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${categoryEmoji("ALL")} ${username}'s Inventory\n` +
        `-# ${items.length} item type${items.length === 1 ? "" : "s"} | ${totalAmount} total | Value ${fmtCurrency(inventoryValue(items))} | ${CATEGORY_LABELS[category]} ${safePage}/${totalPages}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (currentItems.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        category === "ALL"
          ? "No items yet. Visit `shop` to start filling this up."
          : `No ${CATEGORY_LABELS[category].toLowerCase()} items in this inventory.`,
      ),
    );
  } else {
    currentItems.forEach((slot) => {
      const item = slot.shopItem;
      const cat = categoryOf(slot);
      const details = [
        `${categoryEmoji(cat)} ${CATEGORY_LABELS[cat]}`,
        item.itemType,
        item.usable ? "Usable" : "Not usable",
        item.consumable ? "Consumable" : "Permanent",
      ].filter(Boolean).join(" | ");

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${item.name} x${slot.amount}\n` +
            `${Mascot.Emotes.Currency} ${Number(item.price || 0).toLocaleString("en-US")} each\n` +
            `-# ${details}${metaSummary(slot.meta)}`,
          ),
          new TextDisplayBuilder().setContent(shortText(item.description)),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`inv2_info:${slot.id}:${ownerId}`)
            .setLabel("Details")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        );

      container
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    });
  }

  if (!canAct) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Viewing another user's inventory. Actions are disabled."));
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Open Details to use, sell, or inspect an item."));
  }

  const components: any[] = [container, buildCategorySelect(category, items, ownerId, disabled)];
  if (totalPages > 1) components.push(buildNav(safePage, totalPages, ownerId, disabled));

  return { components, flags: MessageFlags.IsComponentsV2 } as any;
}

function buildItemDetailPayload(slot: InventorySlot, ownerId: string, canAct: boolean) {
  const item = slot.shopItem;
  const cat = categoryOf(slot);
  const sellValue = Math.floor(Number(item.price || 0) * 0.5);
  const catalog = findCatalogByName(item.name);

  const container = new ContainerBuilder()
    .setAccentColor(INV_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${categoryEmoji(cat)} ${item.name}`),
      new TextDisplayBuilder().setContent(
        `${item.description || "No description."}\n\n` +
        `**Owned:** ${slot.amount}\n` +
        `**Category:** ${CATEGORY_LABELS[cat]}\n` +
        `**Type:** ${item.itemType}\n` +
        `**Usable:** ${item.usable ? "Yes" : "No"}\n` +
        `**Sell value:** ${fmtCurrency(sellValue)} each${metaSummary(slot.meta)}`,
      ),
    );

  if (catalog?.shortDescription) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${catalog.shortDescription}`));
  }

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`inv2_back:${ownerId}`)
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  ];

  if (canAct) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`inv2_use:${slot.id}:${ownerId}`)
        .setLabel("Use")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!item.usable),
      new ButtonBuilder()
        .setCustomId(`inv2_sell:${slot.id}:${ownerId}`)
        .setLabel(`Sell ${fmtCurrency(sellValue)}`)
        .setStyle(ButtonStyle.Danger),
    );
  }

  return {
    components: [container, new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  } as any;
}

async function consumeSlot(slotId: string) {
  const fresh = await prisma.inventory.findUnique({ where: { id: slotId } });
  if (!fresh) return;

  if (fresh.amount <= 1) {
    await prisma.inventory.delete({ where: { id: fresh.id } });
  } else {
    await prisma.inventory.update({ where: { id: fresh.id }, data: { amount: { decrement: 1 } } });
  }
}

async function sellOne(slotId: string, discordId: string) {
  const slot = await prisma.inventory.findUnique({ where: { id: slotId }, include: { shopItem: true } });
  if (!slot || slot.userId !== discordId || slot.amount <= 0) throw new Error("Item not found in your inventory.");

  const sellValue = Math.floor(Number(slot.shopItem.price || 0) * 0.5);
  await prisma.$transaction([
    slot.amount <= 1
      ? prisma.inventory.delete({ where: { id: slot.id } })
      : prisma.inventory.update({ where: { id: slot.id }, data: { amount: { decrement: 1 } } }),
    prisma.wallet.update({ where: { userId: discordId }, data: { balance: { increment: sellValue } } }),
  ]);

  return { itemName: slot.shopItem.name, sellValue };
}

async function useInventorySlot(slotId: string, discordId: string, guildId: string, member: any) {
  const slot = await prisma.inventory.findUnique({ where: { id: slotId }, include: { shopItem: true } });
  if (!slot || slot.userId !== discordId || slot.amount <= 0) throw new Error("Item not found in your inventory.");
  if (!slot.shopItem.usable) throw new Error(`${slot.shopItem.name} is not usable.`);

  const catalog = findCatalogByName(slot.shopItem.name);
  if (catalog) {
    const result = await handleSpecialItemUse(catalog.key, discordId, guildId, member);
    if (result) {
      if (result.success && result.shouldConsume !== false && slot.shopItem.consumable) {
        await consumeSlot(slot.id);
      }
      return result.message;
    }
  }

  const used = await useItem(discordId, guildId, slot.shopItem.name, member);
  const messages = used.results.map((result: any) => result.message).filter(Boolean);
  return messages.join("\n") || `${slot.shopItem.name} used.`;
}

export async function handleInventory(message: Message, args: string[]) {
  try {
    if (!message.guild || !message.member) return;

    const targetUser = message.mentions.users.first() || message.author;
    if (targetUser.bot) {
      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0xE74C3C).addTextDisplayComponents(new TextDisplayBuilder().setContent("Bots cannot hold items."))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);

    let category: InventoryCategory = "ALL";
    let page = 1;
    const ownerId = message.author.id;
    const canAct = targetUser.id === ownerId;

    const loadPayload = async (disabled = false) => {
      const inventory = await getInventory(targetUser.id);
      return buildInventoryPayload(inventory, page, category, targetUser.username, ownerId, canAct, disabled);
    };

    const reply = await message.reply(await loadPayload());

    const collector = reply.createMessageComponentCollector({
      time: COLLECTOR_TIMEOUT,
      filter: (interaction) => interaction.user.id === ownerId,
    });

    collector.on("collect", async (interaction) => {
      const customId = interaction.customId;

      if (customId === `inv2_prev:${ownerId}`) {
        page = Math.max(1, page - 1);
        await interaction.update(await loadPayload());
        return;
      }

      if (customId === `inv2_next:${ownerId}`) {
        page += 1;
        await interaction.update(await loadPayload());
        return;
      }

      if (customId === `inv2_back:${ownerId}`) {
        await interaction.update(await loadPayload());
        return;
      }

      if (customId === `inv2_cat:${ownerId}` && interaction.isStringSelectMenu()) {
        category = interaction.values[0] as InventoryCategory;
        page = 1;
        await interaction.update(await loadPayload());
        return;
      }

      if (customId.startsWith("inv2_info:") && customId.endsWith(`:${ownerId}`)) {
        const slotId = customId.split(":")[1];
        const slot = await prisma.inventory.findUnique({ where: { id: slotId }, include: { shopItem: true } });
        if (!slot || slot.userId !== targetUser.id) {
          await interaction.reply({ content: "Item is no longer in this inventory.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply(buildItemDetailPayload(slot, ownerId, canAct));
        return;
      }

      if (customId.startsWith("inv2_use:") && customId.endsWith(`:${ownerId}`)) {
        if (!canAct) {
          await interaction.reply({ content: "You can only use items from your own inventory.", flags: MessageFlags.Ephemeral });
          return;
        }

        const slotId = customId.split(":")[1];
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const messageText = await useInventorySlot(slotId, ownerId, message.guildId!, message.member);
          await interaction.editReply({ content: messageText });
          await reply.edit(await loadPayload()).catch(() => {});
        } catch (err: any) {
          await interaction.editReply({ content: err.message || "Failed to use item." });
        }
        return;
      }

      if (customId.startsWith("inv2_sell:") && customId.endsWith(`:${ownerId}`)) {
        if (!canAct) {
          await interaction.reply({ content: "You can only sell items from your own inventory.", flags: MessageFlags.Ephemeral });
          return;
        }

        const slotId = customId.split(":")[1];
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const result = await sellOne(slotId, ownerId);
          await interaction.editReply({ content: `${Mascot.Emotes.Currency} Sold **${result.itemName}** for **${result.sellValue.toLocaleString("en-US")}**.` });
          await reply.edit(await loadPayload()).catch(() => {});
        } catch (err: any) {
          await interaction.editReply({ content: err.message || "Failed to sell item." });
        }
      }
    });

    collector.on("end", async () => {
      await reply.edit(await loadPayload(true)).catch(() => {});
    });
  } catch (err) {
    console.error("Inventory Error:", err);
    return message.reply({
      components: [new ContainerBuilder().setAccentColor(0xE74C3C).addTextDisplayComponents(new TextDisplayBuilder().setContent("Failed to fetch inventory."))],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
