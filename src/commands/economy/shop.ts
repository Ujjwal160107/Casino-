import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  GuildMember,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextChannel,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import { buyItem, getUserInventory, seedGeneralShop, seedHuntShop } from "../../services/shopService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { Mascot } from "../../config/branding";
import {
  GENERAL_SHOP_CATALOG,
  HUNT_SHOP_CATALOG,
  SHOP_CATEGORIES,
  ShopCategory,
  ShopCatalogItem,
} from "../../utils/shopCatalog";
import { ItemEffectResult } from "../../services/effectService";

const ITEMS_PER_PAGE = 4;
const SHOP_ACCENT_COLOR = 0x9B59B6;
const COLLECTOR_TIMEOUT = 120_000;

// General Store: 9 items per image page, 2 pages total
const GS_TOTAL_PAGES = 2;
const GS_PAGES: Record<number, { asset: string; items: string[] }> = {
  1: {
    asset: path.resolve(process.cwd(), "src", "assets", "gs_page1.png"),
    items: [
      "tax_shield",
      "bandage",
      "counterfeit_kit",
      "lucky_coin",
      "thief_gloves",
      "energy_drink",
      "padlock",
      "mystery_box",
      "treasure_map",
    ],
  },
  2: {
    asset: path.resolve(process.cwd(), "src", "assets", "gs_page2.png"),
    items: [
      "loaded_dice_of_ruin",
      "celestial_harp",
      "demonic_harp",
      "pandora_box",
      "eclipse_mask",
      "mirror_of_fate",
      "crown_of_greed",
      "devil_contract",
      "soul_ledger",
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function resolveShopAsset(assetName: string) {
  const assetDirs = [
    path.resolve(process.cwd(), "src", "assets"),
    path.resolve(process.cwd(), "assets"),
  ];
  for (const assetDir of assetDirs) {
    const filePath = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
      .map((ext) => path.join(assetDir, `${assetName}${ext}`))
      .find((candidate) => fs.existsSync(candidate));
    if (filePath) {
      const safeName = assetName.replace(/\s+/g, "_");
      return { filePath, attachmentName: `${safeName}${path.extname(filePath)}` };
    }
  }
  return null;
}

function getCatalogForCategory(category: ShopCategory): ShopCatalogItem[] {
  switch (category) {
    case "GENERAL": return GENERAL_SHOP_CATALOG;
    case "HUNT":    return HUNT_SHOP_CATALOG;
    default:        return [];
  }
}

// ---------------------------------------------------------------------------
// Dropdown — all emojis from Mascot.Emotes in branding.ts
// ---------------------------------------------------------------------------

function extractEmojiForAPI(s: string): { name: string; id: string; animated?: boolean } | null {
  const m = s.match(/^<(a?):(\w+):(\d+)>$/);
  if (!m) return null;
  return { animated: m[1] === "a", name: m[2], id: m[3] };
}

// Keyed by ShopCategory — all from Mascot.Emotes
const CATEGORY_EMOJI_STRINGS: Partial<Record<ShopCategory, string>> = {
  GENERAL: Mascot.Emotes.Currency,   // <:fortunes:...>
  JOB:     Mascot.Emotes.JobWorking, // <:fortuna_working:...>
  UNI:     Mascot.Emotes.Graduate,   // <:fortuna_graduate:...>
  COCK:    Mascot.Emotes.Chicken,    // <:cock:...>
  HUNT:    Mascot.Emotes.Gun,        // <:gun:...>
};

function buildCategoryDropdown(currentCategory: ShopCategory, ownerId: string, disabled = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`shop_cat:${ownerId}`)
    .setPlaceholder("Switch store...")
    .setDisabled(disabled);

  for (const cat of SHOP_CATEGORIES) {
    const emojiStr = CATEGORY_EMOJI_STRINGS[cat.key];
    const opt: any = { label: cat.label, value: cat.key, default: cat.key === currentCategory };
    if (emojiStr) {
      const parsed = extractEmojiForAPI(emojiStr);
      if (parsed) opt.emoji = parsed;
    }
    menu.addOptions(opt);
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

// ---------------------------------------------------------------------------
// General Store — image layout with numbered info buttons
// ---------------------------------------------------------------------------

function buildGeneralStoreMessage(page: number, ownerId: string, disabled = false) {
  const safePage = Math.min(Math.max(page, 1), GS_TOTAL_PAGES);
  const pageData = GS_PAGES[safePage];
  const attachmentName = `gs_page${safePage}.png`;
  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(pageData.asset, { name: attachmentName }),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.Currency} General Store\n-# Page ${safePage}/${GS_TOTAL_PAGES} — press a number to view item details`,
      ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${attachmentName}`)
          .setDescription(`General Store page ${safePage}`),
      ),
    );

  // Numbered info buttons: 1–9 in two rows (5 + 4)
  const infoRow1 = new ActionRowBuilder<ButtonBuilder>();
  const infoRow2 = new ActionRowBuilder<ButtonBuilder>();

  for (let slot = 1; slot <= 9; slot++) {
    const btn = new ButtonBuilder()
      .setCustomId(`shop_info_slot:GENERAL:${safePage}:${slot}:${ownerId}`)
      .setLabel(String(slot))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
    if (slot <= 5) infoRow1.addComponents(btn);
    else infoRow2.addComponents(btn);
  }

  // Navigation row
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_page:GENERAL:${safePage - 1}:${ownerId}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`shop_page_display:${ownerId}`)
      .setLabel(`${safePage} / ${GS_TOTAL_PAGES}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`shop_page:GENERAL:${safePage + 1}:${ownerId}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage >= GS_TOTAL_PAGES),
  );

  const dropdown = buildCategoryDropdown("GENERAL", ownerId, disabled);

  return {
    components: [container, dropdown, infoRow1, infoRow2, navRow],
    files,
    flags: MessageFlags.IsComponentsV2,
  } as any;
}

// Ephemeral info card for one item slot
function buildItemInfoCard(item: ShopCatalogItem, ownerId: string) {
  const typeLabel = item.consumable ? "Consumable" : item.itemType === "EQUIPMENT" ? "Equipment" : "Collectible";
  const usableLabel = item.usable ? "Yes" : "No";
  const maxStackLabel = item.maxStack === 1 ? "1 (one-time use)" : item.maxStack ? String(item.maxStack) : "Unlimited";

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${item.name}\n${Mascot.Emotes.Currency} **${formatAmount(item.price)}**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(item.description),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Type: ${typeLabel} • Usable: ${usableLabel} • Max stack: ${maxStackLabel}`,
      ),
    );

  const buyBtn = new ButtonBuilder()
    .setCustomId(`shop_buy:${item.key}:${ownerId}`)
    .setLabel(`Buy — ${fmtCurrency(item.price)}`)
    .setStyle(ButtonStyle.Success);

  const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buyBtn);

  return {
    components: [container, buyRow],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  } as any;
}

// ---------------------------------------------------------------------------
// Non-General stores — existing item-list layout (unchanged)
// ---------------------------------------------------------------------------

function buildShopContainer(
  items: ShopCatalogItem[],
  page: number,
  totalPages: number,
  category: ShopCategory,
  ownerId: string,
  files: AttachmentBuilder[],
  disabled = false
) {
  const categoryInfo = SHOP_CATEGORIES.find(c => c.key === category)!;
  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const start = (safePage - 1) * ITEMS_PER_PAGE;
  const currentItems = items.slice(start, start + ITEMS_PER_PAGE);

  const brandingEmoji = CATEGORY_EMOJI_STRINGS[category] ?? "";

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${brandingEmoji} ${categoryInfo.label}\n` +
        `-# Browse items and press Buy to purchase. Page ${safePage}/${totalPages}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

  if (currentItems.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("No items available in this store yet."),
    );
    return container;
  }

  currentItems.forEach((item) => {
    const section = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${item.name}\n${Mascot.Emotes.Currency} **${formatAmount(item.price)}**`,
      ),
      new TextDisplayBuilder().setContent(`-# ${item.shortDescription}`),
    );

    if (item.asset) {
      const asset = resolveShopAsset(item.asset);
      if (asset) {
        section.setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${asset.attachmentName}`)
            .setDescription(item.name),
        );
        files.push(new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }));
      }
    }

    container.addSectionComponents(section);
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
  });

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# \`shop buy <item name>\` • \`use <item name>\``),
  );

  return container;
}

function buildBuyButtons(items: ShopCatalogItem[], page: number, ownerId: string, disabled = false) {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const currentItems = items.slice(start, start + ITEMS_PER_PAGE);
  const row = new ActionRowBuilder<ButtonBuilder>();
  currentItems.forEach((item) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_buy:${item.key}:${ownerId}`)
        .setLabel(`Buy ${item.name.length > 14 ? item.name.slice(0, 13) + "…" : item.name}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
    );
  });
  return row;
}

function buildNavigation(page: number, totalPages: number, ownerId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_prev:${ownerId}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId(`shop_page_display:${ownerId}`)
      .setLabel(`${page}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`shop_next:${ownerId}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages),
  );
}

function buildShopMessage(
  items: ShopCatalogItem[],
  page: number,
  category: ShopCategory,
  ownerId: string,
  disabled = false
) {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const files: AttachmentBuilder[] = [];
  const container = buildShopContainer(items, page, totalPages, category, ownerId, files, disabled);
  const dropdown = buildCategoryDropdown(category, ownerId, disabled);
  const buyRow = buildBuyButtons(items, page, ownerId, disabled);
  const navRow = buildNavigation(page, totalPages, ownerId, disabled);

  const components: any[] = [container, dropdown];
  if (items.length > 0) components.push(buyRow);
  if (totalPages > 1) components.push(navRow);

  return { components, files, flags: MessageFlags.IsComponentsV2 } as any;
}

// ---------------------------------------------------------------------------
// Effect message helper
// ---------------------------------------------------------------------------

async function sendEffectMessages(message: Message, results: ItemEffectResult[]) {
  if (!results || results.length === 0) return;
  const channel = message.channel as TextChannel;

  const customMessages = results.filter(r => r.type === "CUSTOM_MESSAGE");
  const otherEffects = results.filter(r => r.type !== "CUSTOM_MESSAGE");

  for (const msgEffect of customMessages) {
    await channel.send({
      components: [v2Container("Item Effect", msgEffect.message, 0xF1C40F)],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  if (otherEffects.length > 0) {
    const effectMsg = otherEffects.map(r => r.message).join("\n");
    await channel.send({
      components: [v2Container("Item Effects", effectMsg, 0xF1C40F)],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

// ---------------------------------------------------------------------------
// Buy logic — shared by both text command and button interactions
// ---------------------------------------------------------------------------

async function executeBuy(
  userId: string,
  guildId: string,
  username: string,
  member: GuildMember,
  catalogItem: ShopCatalogItem,
  client: import("discord.js").Client,
  guild: import("discord.js").Guild,
): Promise<string> {
  const { item, results } = await buyItem(guildId, userId, catalogItem.name, member);

  if (item.roleId) {
    const role = guild.roles.cache.get(item.roleId);
    if (role) try { await member.roles.add(role); } catch { }
  }

  await logToChannel(client, {
    guild,
    type: "MARKET",
    title: "Shop Purchase",
    description: `**User:** ${username}\n**Item:** ${item.name}\n**Price:** ${fmtCurrency(item.price)}`,
    color: 0x00FF00,
  });

  let text = `Purchased **${item.name}** for **${fmtCurrency(item.price)}**!`;
  if (results?.length) text += "\n" + results.map(r => r.message).join("\n");
  if (text.length > 1900) text = text.slice(0, 1900) + "…";
  return text;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleShop(message: Message, args: string[]) {
  try {
    await seedGeneralShop(message.guildId!);
    const sub = args[0]?.toLowerCase();

    // ---- !shop buy <name> ----
    if (sub === "buy") {
      const itemName = args.slice(1).join(" ");
      if (!itemName) {
        return message.reply({
          components: [v2Container("Shop Purchase", "Usage: `shop buy <item name>`")],
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
          description: `**User:** ${message.author.tag}\n**Item:** ${item.name}\n**Price:** ${fmtCurrency(item.price)}`,
          color: 0x00FF00,
        });
        await message.reply({
          components: [v2Container("Purchase Successful", `You bought **${item.name}** for **${fmtCurrency(item.price)}**!`, 0x2ECC71)],
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

    // ---- !shop inv ----
    if (sub === "inv" || sub === "inventory") {
      const inv = await getUserInventory(message.author.id, message.guildId!);
      if (inv.length === 0) {
        return message.reply({
          components: [v2Container("Inventory", "Your inventory is empty.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      const desc = inv.map((i: any) => `**${i.shopItem.name}** (x${i.amount})`).join("\n");
      return message.reply({
        components: [v2Container(`${message.author.username}'s Inventory`, desc)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // ---- Main shop view ----
    let currentCategory: ShopCategory = "GENERAL";
    let currentItems = getCatalogForCategory(currentCategory);
    let currentPage = 1;
    const ownerId = message.author.id;

    if (sub === "hunt") {
      await seedHuntShop(message.guildId!);
      currentCategory = "HUNT";
      currentItems = getCatalogForCategory(currentCategory);
    }

    const isGeneral = () => currentCategory === "GENERAL";

    const getPayload = (disabled = false) =>
      isGeneral()
        ? buildGeneralStoreMessage(currentPage, ownerId, disabled)
        : buildShopMessage(currentItems, currentPage, currentCategory, ownerId, disabled);

    const sentMessage = await message.reply(getPayload());

    // No owner filter — collector sees all interactions, handles non-owner in-handler
    const collector = sentMessage.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

    collector.on("collect", async (interaction) => {
      const customId = interaction.customId;
      const isOwner = interaction.user.id === ownerId;

      // ── Category dropdown (owner only) ───────────────────────────────────
      if (customId === `shop_cat:${ownerId}` && interaction.isStringSelectMenu()) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const newCategory = interaction.values[0] as ShopCategory;
        await interaction.deferUpdate();
        if (newCategory === "HUNT") await seedHuntShop(interaction.guildId!);
        currentCategory = newCategory;
        currentItems = getCatalogForCategory(currentCategory);
        currentPage = 1;
        await interaction.editReply(getPayload());
        return;
      }

      // ── General Store page navigation: shop_page:GENERAL:<page>:<owner> ─
      if (customId.startsWith("shop_page:GENERAL:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const parts = customId.split(":");
        const newPage = parseInt(parts[2], 10);
        if (!isNaN(newPage) && newPage >= 1 && newPage <= GS_TOTAL_PAGES) {
          await interaction.deferUpdate();
          currentPage = newPage;
          await interaction.editReply(buildGeneralStoreMessage(currentPage, ownerId));
        }
        return;
      }

      // ── Non-General prev/next ─────────────────────────────────────────────
      if (customId === `shop_prev:${ownerId}`) {
        if (!isOwner) { await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral }); return; }
        await interaction.deferUpdate();
        currentPage = Math.max(1, currentPage - 1);
        await interaction.editReply(getPayload());
        return;
      }

      if (customId === `shop_next:${ownerId}`) {
        if (!isOwner) { await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral }); return; }
        await interaction.deferUpdate();
        const totalPages = Math.max(1, Math.ceil(currentItems.length / ITEMS_PER_PAGE));
        currentPage = Math.min(totalPages, currentPage + 1);
        await interaction.editReply(getPayload());
        return;
      }

      // ── Numbered info slot: shop_info_slot:GENERAL:<page>:<slot>:<owner> ─
      if (customId.startsWith("shop_info_slot:GENERAL:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const parts = customId.split(":");
        // format: shop_info_slot:GENERAL:<page>:<slot>:<ownerId>
        const slotPage = parseInt(parts[2], 10);
        const slot = parseInt(parts[3], 10);
        const pageData = GS_PAGES[slotPage];
        if (!pageData || isNaN(slot) || slot < 1 || slot > 9) return;

        const itemKey = pageData.items[slot - 1];
        const catalogItem = GENERAL_SHOP_CATALOG.find(i => i.key === itemKey);
        if (!catalogItem) return;

        await interaction.reply(buildItemInfoCard(catalogItem, ownerId));
        return;
      }

      // ── Buy button: shop_buy:<key>:<owner> ───────────────────────────────
      // Can appear on ephemeral info cards — any user who opened their own shop
      if (customId.startsWith("shop_buy:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const itemKey = customId.split(":")[1];
        const catalogItem = GENERAL_SHOP_CATALOG.find(i => i.key === itemKey)
          ?? currentItems.find(i => i.key === itemKey);

        if (!catalogItem) {
          await interaction.reply({
            components: [v2Container("Error", "Item not found.", 0xE74C3C)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
          const text = await executeBuy(
            interaction.user.id,
            interaction.guildId!,
            interaction.user.tag,
            interaction.member as GuildMember,
            catalogItem,
            interaction.client,
            interaction.guild!,
          );
          await interaction.editReply({ content: text });
        } catch (err) {
          const msg = (err as Error).message.slice(0, 1900);
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: msg });
          } else {
            await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
          }
        }
        return;
      }
    });

    collector.on("end", () => {
      try { sentMessage.edit(getPayload(true)).catch(() => { }); } catch { }
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
