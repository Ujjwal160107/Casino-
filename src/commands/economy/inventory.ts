import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ContainerBuilder,
  GuildMember,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import prisma from "../../utils/prisma";
import { refreshMessageComponent, ensureDeferredEphemeralReply, ensureDeferredUpdate, safeEditReply, safeFollowUp, safeReply } from "../../utils/interactionHelpers";
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
import { buildHuntCraftPayload } from "../../services/huntCraftService";
import { getHuntParts, listPartFromInventory } from "../../services/huntPartService";
import { getInventoryAnimals } from "../../services/huntService";
import { listItem } from "../../services/marketService";

const ITEMS_PER_PAGE = 4;
const COLLECTOR_TIMEOUT = 120_000;

type InventorySession = {
  guildId: string;
  targetUserId: string;
  canAct: boolean;
  member: GuildMember;
  refreshDashboard: () => Promise<void>;
};

const inventorySessions = new Map<string, InventorySession>();

function registerInventorySession(ownerId: string, session: InventorySession) {
  inventorySessions.set(ownerId, session);
  setTimeout(() => inventorySessions.delete(ownerId), COLLECTOR_TIMEOUT + 5_000);
}

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
  if (norm === "komodo venom flask") {
    return {
      key: "komodo_venom_flask",
      name: "Komodo Venom Flask",
      category: "HUNT",
      shortDescription: "Target loses 20 Luck for 2 hours. Use with `use Komodo Venom Flask @user`.",
    } as any;
  }
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

function getQuickSellValue(price: number) {
  const basePrice = Math.max(0, Math.floor(price));
  if (basePrice <= 0) return { value: 0, rate: 0.5 };

  // Fortuna's pawn counter usually pays half, but occasionally lowballs harder.
  const rate = Math.random() < 0.8
    ? 0.5
    : (30 + Math.floor(Math.random() * 16)) / 100;

  return { value: Math.max(1, Math.floor(basePrice * rate)), rate };
}

function buildHuntAnimalCounts(huntAnimals: Awaited<ReturnType<typeof getInventoryAnimals>>) {
  const animalCounts = new Map<string, { name: string; count: number; rarity: string }>();
  for (const animal of huntAnimals) {
    const current = animalCounts.get(animal.animalKey);
    if (current) current.count++;
    else animalCounts.set(animal.animalKey, { name: animal.def.name, count: 1, rarity: animal.def.rarity });
  }
  return animalCounts;
}

function buildCategoryCounts(
  items: InventorySlot[],
  huntParts: Awaited<ReturnType<typeof getHuntParts>>,
  huntAnimals: Awaited<ReturnType<typeof getInventoryAnimals>>,
) {
  const counts = new Map<InventoryCategory, number>();
  for (const category of CATEGORY_ORDER) counts.set(category, 0);
  for (const slot of items) {
    const cat = categoryOf(slot);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const huntVirtualCount = buildHuntAnimalCounts(huntAnimals).size + huntParts.length;
  counts.set("HUNT", (counts.get("HUNT") ?? 0) + huntVirtualCount);
  counts.set("ALL", items.length + huntVirtualCount);
  return counts;
}

function buildCategorySelect(
  category: InventoryCategory,
  items: InventorySlot[],
  huntParts: Awaited<ReturnType<typeof getHuntParts>>,
  huntAnimals: Awaited<ReturnType<typeof getInventoryAnimals>>,
  ownerId: string,
  disabled = false,
) {
  const counts = buildCategoryCounts(items, huntParts, huntAnimals);

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
  huntParts: Awaited<ReturnType<typeof getHuntParts>>,
  huntAnimals: Awaited<ReturnType<typeof getInventoryAnimals>>,
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
  const huntAnimalCounts = buildHuntAnimalCounts(huntAnimals);
  const totalAmount = items.reduce((sum, slot) => sum + slot.amount, 0) + huntParts.reduce((sum, part) => sum + part.amount, 0) + huntAnimals.length;

  const container = new ContainerBuilder()
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

      container.addSectionComponents(section);
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    });
  }

  if (category === "HUNT" || category === "ALL") {
    const animalPreview = huntAnimalCounts.size > 0
      ? Array.from(huntAnimalCounts.values()).slice(0, 8).map((animal) => `**${animal.name}:** ${animal.count}`).join(" | ")
      : "No hunted animals stored. Go hunting to fill this up.";
    const partPreview = huntParts.length > 0
      ? huntParts.slice(0, 8).map((part) => `**${part.name}:** ${part.amount}`).join(" | ")
      : "No animal parts owned yet. Use the Hunt Black Market or buy parts from players.";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Hunted Animals\n${animalPreview}${huntAnimalCounts.size > 8 ? ` | +${huntAnimalCounts.size - 8} more` : ""}\n\n` +
        `### Hunt Materials\n${partPreview}${huntParts.length > 8 ? ` | +${huntParts.length - 8} more` : ""}`,
      ),
    );
    if (!canAct && category === "HUNT") {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Viewing another user's hunt inventory. Actions are disabled."));
    }
  } else if (!canAct) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Viewing another user's inventory. Actions are disabled."));
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Use **Details** to use, quick sell, or list on the Black Market."));
  }

  const components: any[] = [container, buildCategorySelect(category, items, huntParts, huntAnimals, ownerId, disabled)];
  if (category === "HUNT" && canAct) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`inv2_hunt_craft:${ownerId}`)
          .setLabel("Craft")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`inv2_hunt_market:${ownerId}`)
          .setLabel("List Parts")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || huntParts.length === 0),
      ),
    );
  }
  if (totalPages > 1) components.push(buildNav(safePage, totalPages, ownerId, disabled));

  return { components, flags: MessageFlags.IsComponentsV2 } as any;
}

function buildItemDetailPayload(slot: InventorySlot, ownerId: string, canAct: boolean, ephemeral = false) {
  const item = slot.shopItem;
  const cat = categoryOf(slot);
  const catalog = findCatalogByName(item.name);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${categoryEmoji(cat)} ${item.name}`),
      new TextDisplayBuilder().setContent(
        `${item.description || "No description."}\n\n` +
        `**Owned:** ${slot.amount}\n` +
        `**Category:** ${CATEGORY_LABELS[cat]}\n` +
        `**Type:** ${item.itemType}\n` +
        `**Usable:** ${item.usable ? "Yes" : "No"}\n` +
        `**Quick sell:** up to ${fmtCurrency(Math.floor(Number(item.price || 0) * 0.5))} each${metaSummary(slot.meta)}`,
      ),
    );

  if (catalog?.shortDescription) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${catalog.shortDescription}`));
  }

  const buttons: ButtonBuilder[] = [];

  if (ephemeral) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`inv2_detail_close:${ownerId}`)
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`inv2_back:${ownerId}`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (canAct) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`inv2_use:${slot.id}:${ownerId}`)
        .setLabel("Use")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!item.usable),
      new ButtonBuilder()
        .setCustomId(`inv2_sell:${slot.id}:${ownerId}`)
        .setLabel("Quick Sell")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`inv2_market:${slot.id}:${ownerId}`)
        .setLabel("Black Market")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return {
    components: [container, new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
    flags: MessageFlags.IsComponentsV2,
  } as any;
}

function buildHuntPartMarketPayload(
  huntParts: Awaited<ReturnType<typeof getHuntParts>>,
  ownerId: string,
  disabled = false,
) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Gun || ""} List Hunt Materials`),
      new TextDisplayBuilder().setContent(
        huntParts.length > 0
          ? "Choose a stored animal part, then set the quantity and listing price. Buyers pay your price plus 5%; you receive the listed price minus 10%."
          : "You don't have any stored hunt materials to list yet.",
      ),
    );

  const components: any[] = [container];
  if (huntParts.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`inv2_part_select:${ownerId}`)
          .setPlaceholder("Choose a stored part to list")
          .setDisabled(disabled)
          .addOptions(
            huntParts.slice(0, 25).map((part) => ({
              label: `${part.name} x${part.amount}`,
              value: part.partKey,
              description: "List this material on the Black Market",
            })),
          ),
      ),
    );
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv2_back:${ownerId}`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );

  return { components, flags: MessageFlags.IsComponentsV2 } as any;
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

  const { value: sellValue, rate } = getQuickSellValue(Number(slot.shopItem.price || 0));
  await prisma.$transaction([
    slot.amount <= 1
      ? prisma.inventory.delete({ where: { id: slot.id } })
      : prisma.inventory.update({ where: { id: slot.id }, data: { amount: { decrement: 1 } } }),
    prisma.wallet.update({ where: { userId: discordId }, data: { balance: { increment: sellValue } } }),
  ]);

  return { itemName: slot.shopItem.name, sellValue, rate };
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

function buildMarketModal(customId: string, title: string, maxAmount: number) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("quantity")
          .setLabel(`Quantity (max ${maxAmount})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("price")
          .setLabel("Total listing price")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("100000")
          .setRequired(true),
      ),
    );
}

async function handleInv2UseAction(interaction: ButtonInteraction, slotId: string, session: InventorySession) {
  if (!session.canAct) {
    await safeReply(interaction, { content: "You can only use items from your own inventory.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!await ensureDeferredEphemeralReply(interaction, MessageFlags.Ephemeral)) return;
  try {
    const messageText = await useInventorySlot(slotId, session.member.id, session.guildId, session.member);
    await safeEditReply(interaction, { content: messageText });
    await session.refreshDashboard();
  } catch (err: any) {
    await safeEditReply(interaction, { content: err.message || "Failed to use item." });
  }
}

async function handleInv2SellAction(interaction: ButtonInteraction, slotId: string, session: InventorySession) {
  if (!session.canAct) {
    await safeReply(interaction, { content: "You can only sell items from your own inventory.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!await ensureDeferredEphemeralReply(interaction, MessageFlags.Ephemeral)) return;
  try {
    const result = await sellOne(slotId, session.member.id);
    await safeEditReply(interaction, {
      content: `${Mascot.Emotes.Currency} Quick sold **${result.itemName}** for **${result.sellValue.toLocaleString("en-US")}** (${Math.round(result.rate * 100)}% resale).`,
    });
    await session.refreshDashboard();
  } catch (err: any) {
    await safeEditReply(interaction, { content: err.message || "Failed to sell item." });
  }
}

async function handleInv2MarketAction(interaction: ButtonInteraction, slotId: string, session: InventorySession) {
  if (!session.canAct) {
    await safeReply(interaction, { content: "You can only list items from your own inventory.", flags: MessageFlags.Ephemeral });
    return;
  }
  const slot = await prisma.inventory.findUnique({ where: { id: slotId }, include: { shopItem: true } });
  if (!slot || slot.userId !== session.member.id || slot.amount <= 0) {
    await safeReply(interaction, { content: "Item is no longer in your inventory.", flags: MessageFlags.Ephemeral });
    return;
  }
  const modalId = `inv2_market_modal:${slot.id}:${session.member.id}`;
  await interaction.showModal(buildMarketModal(modalId, `List ${slot.shopItem.name}`, slot.amount));
}

/** Routes detail-panel buttons on ephemeral follow-ups (outside the dashboard collector). */
export async function handleInv2EphemeralInteraction(interaction: ButtonInteraction): Promise<boolean> {
  const customId = interaction.customId;
  const isDetailAction =
    customId.startsWith("inv2_use:") ||
    customId.startsWith("inv2_sell:") ||
    customId.startsWith("inv2_market:") ||
    customId.startsWith("inv2_detail_close:");
  if (!isDetailAction) return false;

  const ownerId = interaction.user.id;
  const session = inventorySessions.get(ownerId);
  if (!session) {
    await safeReply(interaction, { content: "Open `!inventory` again to manage items.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (customId === `inv2_detail_close:${ownerId}`) {
    if (!await ensureDeferredUpdate(interaction)) return true;
    await interaction.deleteReply().catch(async () => {
      await safeEditReply(interaction, { content: "Closed.", components: [] });
    });
    return true;
  }

  const slotId = customId.split(":")[1];
  if (customId.startsWith("inv2_use:") && customId.endsWith(`:${ownerId}`)) {
    await handleInv2UseAction(interaction, slotId, session);
    return true;
  }
  if (customId.startsWith("inv2_sell:") && customId.endsWith(`:${ownerId}`)) {
    await handleInv2SellAction(interaction, slotId, session);
    return true;
  }
  if (customId.startsWith("inv2_market:") && customId.endsWith(`:${ownerId}`)) {
    await handleInv2MarketAction(interaction, slotId, session);
    return true;
  }

  return false;
}

export async function handleInv2ModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("inv2_market_modal:")) return false;

  const [, slotId, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) return true;

  const session = inventorySessions.get(ownerId);
  if (!session) {
    await safeReply(interaction, { content: "Open `!inventory` again to list items.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!await ensureDeferredEphemeralReply(interaction, MessageFlags.Ephemeral)) return true;
  try {
    const quantity = parseInt(interaction.fields.getTextInputValue("quantity"), 10);
    const price = parseInt(interaction.fields.getTextInputValue("price"), 10);
    const slot = await prisma.inventory.findUnique({ where: { id: slotId }, include: { shopItem: true } });
    if (!slot || slot.userId !== ownerId) throw new Error("Item is no longer in your inventory.");
    const result = await listItem(ownerId, slot.shopItemId, quantity, price);
    await safeEditReply(interaction, {
      content:
        `${Mascot.Emotes.Accept} Listed **${result.itemName} x${result.amount}** for **${fmtCurrency(result.totalPrice)}**.\n` +
        `Seller payout after fee: **${fmtCurrency(result.fees.sellerPayout)}**.`,
    });
    await session.refreshDashboard();
  } catch (err: any) {
    await safeEditReply(interaction, { content: err.message || "Failed to list item." });
  }
  return true;
}

export async function handleInventory(message: Message, args: string[]) {
  try {
    if (!message.guild || !message.member) return;

    const targetUser = message.mentions.users.first() || message.author;
    if (targetUser.bot) {
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("Bots cannot hold items."))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);

    let category: InventoryCategory = "ALL";
    let page = 1;
    const ownerId = message.author.id;
    const canAct = targetUser.id === ownerId;

    const loadPayload = async (disabled = false) => {
      const [inventory, huntParts, huntAnimals] = await Promise.all([
        getInventory(targetUser.id),
        getHuntParts(targetUser.id),
        getInventoryAnimals(targetUser.id),
      ]);
      return buildInventoryPayload(inventory, huntParts, huntAnimals, page, category, targetUser.username, ownerId, canAct, disabled);
    };

    const reply = await message.reply(await loadPayload());

    registerInventorySession(ownerId, {
      guildId: message.guild.id,
      targetUserId: targetUser.id,
      canAct,
      member: message.member,
      refreshDashboard: async () => {
        await reply.edit(await loadPayload()).catch(() => {});
      },
    });

    const collector = reply.createMessageComponentCollector({
      time: COLLECTOR_TIMEOUT,
      filter: (interaction) => interaction.user.id === ownerId,
    });

    collector.on("collect", async (interaction) => {
      const customId = interaction.customId;

      if (customId === `inv2_prev:${ownerId}`) {
        page = Math.max(1, page - 1);
        await refreshMessageComponent(interaction, () => loadPayload());
        return;
      }

      if (customId === `inv2_next:${ownerId}`) {
        page += 1;
        await refreshMessageComponent(interaction, () => loadPayload());
        return;
      }

      if (customId === `inv2_back:${ownerId}`) {
        await refreshMessageComponent(interaction, () => loadPayload());
        return;
      }

      if (customId === `inv2_cat:${ownerId}` && interaction.isStringSelectMenu()) {
        category = interaction.values[0] as InventoryCategory;
        page = 1;
        await refreshMessageComponent(interaction, () => loadPayload());
        return;
      }

      if (customId === `inv2_hunt_craft:${ownerId}`) {
        if (!canAct) {
          await safeReply(interaction, { content: "You can only craft from your own inventory.", flags: MessageFlags.Ephemeral });
          return;
        }
        await ensureDeferredEphemeralReply(interaction, MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
        const payload = await buildHuntCraftPayload(ownerId, ownerId, 1);
        await safeEditReply(interaction, { ...payload, flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (customId === `inv2_hunt_market:${ownerId}`) {
        if (!canAct) {
          await safeReply(interaction, { content: "You can only list parts from your own inventory.", flags: MessageFlags.Ephemeral });
          return;
        }
        await refreshMessageComponent(interaction, async () => {
          const huntParts = await getHuntParts(ownerId);
          return buildHuntPartMarketPayload(huntParts, ownerId);
        });
        return;
      }

      if (customId.startsWith("inv2_info:") && customId.endsWith(`:${ownerId}`)) {
        const slotId = customId.split(":")[1];
        if (!await ensureDeferredUpdate(interaction)) return;
        const slot = await prisma.inventory.findUnique({ where: { id: slotId }, include: { shopItem: true } });
        if (!slot || slot.userId !== targetUser.id) {
          await safeFollowUp(interaction, { content: "Item is no longer in this inventory.", flags: MessageFlags.Ephemeral });
          return;
        }
        const detail = buildItemDetailPayload(slot, ownerId, canAct, true);
        await safeFollowUp(interaction, {
          ...detail,
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      if (customId.startsWith("inv2_part_select:") && customId.endsWith(`:${ownerId}`) && interaction.isStringSelectMenu()) {
        if (!canAct) {
          await interaction.reply({ content: "You can only list parts from your own inventory.", flags: MessageFlags.Ephemeral });
          return;
        }

        const partKey = interaction.values[0];
        const part = (await getHuntParts(ownerId)).find((row) => row.partKey === partKey);
        if (!part) {
          await interaction.reply({ content: "That part is no longer in your inventory.", flags: MessageFlags.Ephemeral });
          return;
        }

        const modalId = `inv2_part_modal:${partKey}:${ownerId}`;
        await interaction.showModal(buildMarketModal(modalId, `List ${part.name}`, part.amount));
        const modal = await interaction.awaitModalSubmit({
          time: 60_000,
          filter: (submit) => submit.customId === modalId && submit.user.id === ownerId,
        }).catch(() => null);
        if (!modal) return;

        await modal.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const quantity = parseInt(modal.fields.getTextInputValue("quantity"), 10);
          const price = parseInt(modal.fields.getTextInputValue("price"), 10);
          const result = await listPartFromInventory(ownerId, partKey, quantity, price);
          await modal.editReply({
            content:
              `${Mascot.Emotes.Accept} Listed **${result.partName} x${result.amount}** for **${fmtCurrency(result.totalPrice)}**.\n` +
              `Seller payout after fee: **${fmtCurrency(result.fees.sellerPayout)}**.`,
          });
          await reply.edit(await loadPayload()).catch(() => {});
        } catch (err: any) {
          await modal.editReply({ content: err.message || "Failed to list this part." });
        }
        return;
      }
    });

    collector.on("end", async () => {
      inventorySessions.delete(ownerId);
      await reply.edit(await loadPayload(true)).catch(() => {});
    });
  } catch (err) {
    console.error("Inventory Error:", err);
    return message.reply({
      components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("Failed to fetch inventory."))],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
