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
import { buyItem, getUserInventory, seedGeneralShop, seedHuntShop, seedJobShop, seedUniShop } from "../../services/shopService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { Mascot } from "../../config/branding";
import {
  GENERAL_SHOP_CATALOG,
  HUNT_SHOP_CATALOG,
  JOB_SHOP_CATALOG,
  UNI_SHOP_CATALOG,
  SHOP_CATEGORIES,
  ShopCategory,
  ShopCatalogItem,
} from "../../utils/shopCatalog";
import { ItemEffectResult } from "../../services/effectService";

const ITEMS_PER_PAGE = 4;
const SHOP_ACCENT_COLOR = 0x9B59B6;

// Asset paths resolved at module load time
const ASSETS_DIR = path.resolve(process.cwd(), "src", "assets");
const GS_MASCOT_PATH  = path.join(ASSETS_DIR, "generalstore_mascot.png");
const HS_MASCOT_PATH  = path.join(ASSETS_DIR, "huntstore_mascot.png");
const HS_PAGE1_PATH   = path.join(ASSETS_DIR, "hunt_store1.png");
const JS_PAGE1_PATH   = path.join(ASSETS_DIR, "jobstore_page1.png");
const JS_PAGE2_PATH   = path.join(ASSETS_DIR, "jobstore_page2.png");
const JS_MASCOT_PATH  = path.join(ASSETS_DIR, "jobstore_fortuna.png");
const US_PAGE1_PATH   = path.join(ASSETS_DIR, "unistore.png");
const US_MASCOT_PATH  = path.join(ASSETS_DIR, "unistore_fortuna.png");
const CS_PAGE1_PATH   = path.join(ASSETS_DIR, "cockstore.png");
const CS_MASCOT_PATH  = path.join(ASSETS_DIR, "cockstore_mascot.png");

// Hunt Store: 9 items on a single image page
const HS_ITEMS: string[] = [
  "hunting_permit",
  "wooden_rifle",
  "echo_whistle",
  "bait_box",
  "camouflage_kit",
  "iron_rifle",
  "hunters_compass",
  "sniper_rifle",
  "legendary_rifle",
];

// Job Store: 2 image pages
const JS_TOTAL_PAGES = 2;
const JS_PAGES: Record<number, string> = {
  1: JS_PAGE1_PATH,
  2: JS_PAGE2_PATH,
};

// Job Store slot mapping per page (9 per page, 18 total)
const JS_PAGE_ITEMS: Record<number, string[]> = {
  1: [
    "work_laptop", "medical_kit", "business_briefcase",
    "legal_case_file", "service_uniform", "mechanic_toolkit",
    "freelance_starter_pack", "repair_coupon", "warranty_card",
  ],
  2: [
    "stress_pills", "energy_flask", "focus_headphones",
    "lucky_tie", "premium_tools_oil", "emergency_pager",
    "overtime_contract", "blackmarket_resume", "corporate_blessing",
  ],
};

// Uni Store: 9 items on 1 image page
const US_PAGE_ITEMS: string[] = [
  "study_laptop", "textbook_bundle", "lab_kit", "calculator_pro",
  "coffee_thermos", "focus_notes", "cheat_sheet", "tutor_pass",
  "scholarship_letter",
];

// Cock Store: 1 image page

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
    case "JOB":     return JOB_SHOP_CATALOG;
    case "UNI":     return UNI_SHOP_CATALOG;
    default:        return [];
  }
}

// ---------------------------------------------------------------------------
// Dropdown — all emojis from Mascot.Emotes in branding.ts
// ---------------------------------------------------------------------------

function extractEmojiForAPI(s: string): { name: string; id: string; animated?: boolean } | null {
  const m = s.match(/^<(a?):(\w+):(\d+)>$/);
  if (!m) return null;
  const result: { name: string; id: string; animated?: boolean } = { name: m[2], id: m[3] };
  if (m[1] === "a") result.animated = true;
  return result;
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
  const mascotName = "generalstore_mascot.png";
  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(pageData.asset, { name: attachmentName }),
    new AttachmentBuilder(GS_MASCOT_PATH, { name: mascotName }),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${Mascot.Emotes.Currency} General Store\n-# Page ${safePage}/${GS_TOTAL_PAGES} — press a number to view item details`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${mascotName}`)
            .setDescription("General Store mascot"),
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

// ---------------------------------------------------------------------------
// Hunt Store — image layout with numbered info buttons
// ---------------------------------------------------------------------------

function buildHuntStoreMessage(ownerId: string, disabled = false) {
  const attachmentName = "hunt_store1.png";
  const mascotName = "huntstore_mascot.png";
  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(HS_PAGE1_PATH, { name: attachmentName }),
    new AttachmentBuilder(HS_MASCOT_PATH, { name: mascotName }),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${Mascot.Emotes.Gun} Hunt Store\n-# Press a number to view item details`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${mascotName}`)
            .setDescription("Hunt Store mascot"),
        ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${attachmentName}`)
          .setDescription("Hunt Store"),
      ),
    );

  // Numbered info buttons: 1–9 in two rows (5 + 4)
  const infoRow1 = new ActionRowBuilder<ButtonBuilder>();
  const infoRow2 = new ActionRowBuilder<ButtonBuilder>();

  for (let slot = 1; slot <= 9; slot++) {
    const btn = new ButtonBuilder()
      .setCustomId(`shop_info_slot:HUNT:1:${slot}:${ownerId}`)
      .setLabel(String(slot))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
    if (slot <= 5) infoRow1.addComponents(btn);
    else infoRow2.addComponents(btn);
  }

  // Nav row — both disabled (Hunt Store has 1 page)
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_page:HUNT:0:${ownerId}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`shop_page_display_hunt:${ownerId}`)
      .setLabel("1 / 1")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`shop_page:HUNT:2:${ownerId}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

  const dropdown = buildCategoryDropdown("HUNT", ownerId, disabled);

  return {
    components: [container, dropdown, infoRow1, infoRow2, navRow],
    files,
    flags: MessageFlags.IsComponentsV2,
  } as any;
}

// ---------------------------------------------------------------------------
// Job Store — image layout, 2 pages, no item buttons (visual only for now)
// ---------------------------------------------------------------------------

function buildJobStoreMessage(page: number, ownerId: string, disabled = false) {
  const safePage = Math.min(Math.max(page, 1), JS_TOTAL_PAGES);
  const attachmentName = `jobstore_page${safePage}.png`;
  const mascotName = "jobstore_fortuna.png";
  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(JS_PAGES[safePage], { name: attachmentName }),
    new AttachmentBuilder(JS_MASCOT_PATH, { name: mascotName }),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${CATEGORY_EMOJI_STRINGS["JOB"] ?? ""} Job Store\n-# Page ${safePage}/${JS_TOTAL_PAGES} — browse available job items`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${mascotName}`)
            .setDescription("Job Store mascot"),
        ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${attachmentName}`)
          .setDescription(`Job Store page ${safePage}`),
      ),
    );

  // Numbered info buttons for this page's items
  const pageItems = JS_PAGE_ITEMS[safePage] ?? [];
  const infoRow1 = new ActionRowBuilder<ButtonBuilder>();
  const infoRow2 = new ActionRowBuilder<ButtonBuilder>();
  pageItems.forEach((_, idx) => {
    const slot = idx + 1;
    const btn = new ButtonBuilder()
      .setCustomId(`shop_info_slot:JOB:${safePage}:${slot}:${ownerId}`)
      .setLabel(String(slot))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
    if (slot <= 5) infoRow1.addComponents(btn);
    else infoRow2.addComponents(btn);
  });

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_page:JOB:${safePage - 1}:${ownerId}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`shop_page_display_job:${ownerId}`)
      .setLabel(`${safePage} / ${JS_TOTAL_PAGES}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`shop_page:JOB:${safePage + 1}:${ownerId}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage >= JS_TOTAL_PAGES),
  );

  const dropdown = buildCategoryDropdown("JOB", ownerId, disabled);

  const components: any[] = [container, dropdown];
  if (infoRow1.components.length > 0) components.push(infoRow1);
  if (infoRow2.components.length > 0) components.push(infoRow2);
  components.push(navRow);

  return {
    components,
    files,
    flags: MessageFlags.IsComponentsV2,
  } as any;
}

// ---------------------------------------------------------------------------
// Uni Store — image layout, 1 page, visual only
// ---------------------------------------------------------------------------

function buildUniStoreMessage(ownerId: string, disabled = false) {
  const attachmentName = "unistore.png";
  const mascotName = "unistore_fortuna.png";
  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(US_PAGE1_PATH, { name: attachmentName }),
    new AttachmentBuilder(US_MASCOT_PATH, { name: mascotName }),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${CATEGORY_EMOJI_STRINGS["UNI"] ?? ""} Uni Store\n-# Browse university items and courses`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${mascotName}`)
            .setDescription("Uni Store mascot"),
        ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${attachmentName}`)
          .setDescription("Uni Store"),
      ),
    );

  const dropdown = buildCategoryDropdown("UNI", ownerId, disabled);

  // Numbered info buttons (5 + 4)
  const infoRow1 = new ActionRowBuilder<ButtonBuilder>();
  const infoRow2 = new ActionRowBuilder<ButtonBuilder>();
  US_PAGE_ITEMS.forEach((_, idx) => {
    const slot = idx + 1;
    const btn = new ButtonBuilder()
      .setCustomId(`shop_info_slot:UNI:1:${slot}:${ownerId}`)
      .setLabel(String(slot))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
    if (slot <= 5) infoRow1.addComponents(btn);
    else infoRow2.addComponents(btn);
  });

  return {
    components: [container, dropdown, infoRow1, infoRow2],
    files,
    flags: MessageFlags.IsComponentsV2,
  } as any;
}

// ---------------------------------------------------------------------------
// Cock Store — image layout, 1 page, visual only
// ---------------------------------------------------------------------------

function buildCockStoreMessage(ownerId: string, disabled = false) {
  const attachmentName = "cockstore.png";
  const mascotName = "cockstore_mascot.png";
  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(CS_PAGE1_PATH, { name: attachmentName }),
    new AttachmentBuilder(CS_MASCOT_PATH, { name: mascotName }),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(SHOP_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${CATEGORY_EMOJI_STRINGS["COCK"] ?? ""} Cock Store\n-# Browse cockfighting items and equipment`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${mascotName}`)
            .setDescription("Cock Store mascot"),
        ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${attachmentName}`)
          .setDescription("Cock Store"),
      ),
    );

  const dropdown = buildCategoryDropdown("COCK", ownerId, disabled);

  return {
    components: [container, dropdown],
    files,
    flags: MessageFlags.IsComponentsV2,
  } as any;
}

// Map item keys to their exact asset filenames in src/assets
const ITEM_ASSET_MAP: Record<string, string> = {
  // General Store — page 1
  tax_shield:           "tax shield.png",
  bandage:              "bandage.png",
  counterfeit_kit:      "counterfeit kit.png",
  lucky_coin:           "lucky coin.png",
  thief_gloves:         "thieves gloves.png",
  energy_drink:         "energy drink.png",
  padlock:              "padlock.png",
  mystery_box:          "mystery box.png",
  treasure_map:         "treasure map.png",
  // General Store — page 2
  loaded_dice_of_ruin:  "dice.png",
  celestial_harp:       "angelic harp.png",
  demonic_harp:         "demonic harp.png",
  pandora_box:          "pandoras box.png",
  eclipse_mask:         "eclipse mask.png",
  mirror_of_fate:       "mirror of fate.png",
  crown_of_greed:       "crown of greed.png",
  devil_contract:       "devils contract.png",
  soul_ledger:          "soul ledger.png",
  // Job Store — gear
  work_laptop:            "work laptop.png",
  medical_kit:            "medical kit.png",
  business_briefcase:     "business briefcase.png",
  legal_case_file:        "legal case file.png",
  service_uniform:        "service uniform.png",
  mechanic_toolkit:       "mechanic toolkit.png",
  freelance_starter_pack: "freelance starter kit.png",
  // Job Store — consumables
  repair_coupon:          "repair token.png",
  warranty_card:          "warranty card.png",
  stress_pills:           "stress pills.png",
  energy_flask:           "energy flask.png",
  focus_headphones:       "focus headphones.png",
  lucky_tie:              "lucky tie.png",
  premium_tools_oil:      "premium tools oil.png",
  emergency_pager:        "emergency pager.png",
  overtime_contract:      "overtime contract.png",
  blackmarket_resume:     "blackmarket resume.png",
  corporate_blessing:     "golden resume.png",
  // Uni Store
  study_laptop:         "study laptop.png",
  textbook_bundle:      "textbook bundle.png",
  lab_kit:              "lab kit.png",
  calculator_pro:       "calculator pro.png",
  coffee_thermos:       "coffee thermos.png",
  focus_notes:          "focus notes.png",
  cheat_sheet:          "cheat sheet.png",
  tutor_pass:           "tutor pass.png",
  scholarship_letter:   "scholarship letter.png",
  // Hunt Store
  hunting_permit:       "hunting permit.png",
  wooden_rifle:         "wooden rifle.png",
  echo_whistle:         "echo whistle.png",
  bait_box:             "bait box.png",
  camouflage_kit:       "camouflage kit.png",
  iron_rifle:           "iron rifle.png",
  hunters_compass:      "hunter's compass.png",
  sniper_rifle:         "sniper rifle.png",
  legendary_rifle:      "legendary rifle.png",
};

// Ephemeral info card for one item slot, with thumbnail if asset exists
function buildItemInfoCard(item: ShopCatalogItem, ownerId: string) {
  const typeLabel = item.consumable ? "Consumable" : item.itemType === "EQUIPMENT" ? "Equipment" : "Collectible";
  const usableLabel = item.usable ? "Yes" : "No";
  const maxStackLabel = item.maxStack === 1 ? "1 (one-time use)" : item.maxStack ? String(item.maxStack) : "Unlimited";

  const assetFile = ITEM_ASSET_MAP[item.key];
  const assetPath = assetFile
    ? path.join(path.resolve(process.cwd(), "src", "assets"), assetFile)
    : null;
  const hasAsset = assetPath !== null && fs.existsSync(assetPath);
  const safeName = assetFile ? assetFile.replace(/\s+/g, "_") : null;
  const attachmentRef = safeName ? `attachment://${safeName}` : null;

  const container = new ContainerBuilder().setAccentColor(SHOP_ACCENT_COLOR);

  // Header: use SectionBuilder with thumbnail if asset available, else plain TextDisplay
  if (hasAsset && attachmentRef && safeName) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${item.name}\n${Mascot.Emotes.Currency} **${formatAmount(item.price)}**`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(attachmentRef)
            .setDescription(item.name),
        ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${item.name}\n${Mascot.Emotes.Currency} **${formatAmount(item.price)}**`,
      ),
    );
  }

  container
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

  const currencyEmoji = extractEmojiForAPI(Mascot.Emotes.Currency);
  const buyBtn = new ButtonBuilder()
    .setCustomId(`shop_buy:${item.key}:${ownerId}`)
    .setLabel(`Buy — ${formatAmount(item.price)}`)
    .setStyle(ButtonStyle.Success);
  if (currencyEmoji) buyBtn.setEmoji(currencyEmoji);

  const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buyBtn);

  const files: AttachmentBuilder[] = [];
  if (hasAsset && assetPath && safeName) {
    files.push(new AttachmentBuilder(assetPath, { name: safeName }));
  }

  return {
    components: [container, buyRow],
    files,
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
): Promise<{ components: any[]; files: AttachmentBuilder[]; flags: number }> {
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

  // Build purchase confirmation with thumbnail and usage hint
  const assetFile = ITEM_ASSET_MAP[catalogItem.key];
  const assetPath = assetFile
    ? path.join(path.resolve(process.cwd(), "src", "assets"), assetFile)
    : null;
  const hasAsset = assetPath !== null && fs.existsSync(assetPath);
  const safeName = assetFile ? assetFile.replace(/\s+/g, "_") : null;

  const effectLines = results?.length ? results.map(r => r.message).join("\n") : null;
  const usageHint = catalogItem.usable
    ? `-# To use: \`use ${catalogItem.name.toLowerCase()}\``
    : catalogItem.itemType === "EQUIPMENT"
      ? `-# This is equipment — it activates automatically when you work or use your job.`
      : `-# This item activates automatically.`;

  const container = new ContainerBuilder().setAccentColor(0x2ECC71);

  if (hasAsset && assetPath && safeName) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Purchased!\n**${item.name}** — ${Mascot.Emotes.Currency} **${fmtCurrency(item.price)}**`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${safeName}`)
            .setDescription(item.name),
        ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Purchased!\n**${item.name}** — ${Mascot.Emotes.Currency} **${fmtCurrency(item.price)}**`,
      ),
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(catalogItem.description),
    );

  if (effectLines) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(effectLines),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(usageHint),
  );

  const files: AttachmentBuilder[] = [];
  if (hasAsset && assetPath && safeName) {
    files.push(new AttachmentBuilder(assetPath, { name: safeName }));
  }

  // Add a "Use Now" button for usable items
  const components: any[] = [container];
  if (catalogItem.usable) {
    const useBtn = new ButtonBuilder()
      .setCustomId(`shop_use:${catalogItem.key}:${userId}`)
      .setLabel(`Use ${catalogItem.name.length > 20 ? catalogItem.name.slice(0, 19) + "…" : catalogItem.name}`)
      .setStyle(ButtonStyle.Primary);
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(useBtn));
  }

  return {
    components,
    files,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
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
        // Seed the correct store before buying so the item exists in the DB
        const normalizedName = itemName.trim().toLowerCase();
        if (HUNT_SHOP_CATALOG.some(i => i.name.toLowerCase() === normalizedName)) {
          await seedHuntShop(message.guildId!);
        } else if (JOB_SHOP_CATALOG.some(i => i.name.toLowerCase() === normalizedName)) {
          await seedJobShop(message.guildId!);
        } else if (UNI_SHOP_CATALOG.some(i => i.name.toLowerCase() === normalizedName)) {
          await seedUniShop(message.guildId!);
        }
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
    } else if (sub === "job") {
      await seedJobShop(message.guildId!);
      currentCategory = "JOB";
      currentItems = getCatalogForCategory(currentCategory);
    } else if (sub === "uni") {
      await seedUniShop(message.guildId!);
      currentCategory = "UNI";
      currentItems = getCatalogForCategory(currentCategory);
    } else if (sub === "cock") {
      currentCategory = "COCK";
      currentItems = getCatalogForCategory(currentCategory);
    }

    const isGeneral = () => currentCategory === "GENERAL";
    const isHunt    = () => currentCategory === "HUNT";
    const isJob     = () => currentCategory === "JOB";
    const isUni     = () => currentCategory === "UNI";
    const isCock    = () => currentCategory === "COCK";

    const getPayload = (disabled = false) => {
      if (isGeneral()) return buildGeneralStoreMessage(currentPage, ownerId, disabled);
      if (isHunt())    return buildHuntStoreMessage(ownerId, disabled);
      if (isJob())     return buildJobStoreMessage(currentPage, ownerId, disabled);
      if (isUni())     return buildUniStoreMessage(ownerId, disabled);
      if (isCock())    return buildCockStoreMessage(ownerId, disabled);
      return buildShopMessage(currentItems, currentPage, currentCategory, ownerId, disabled);
    };

    const sentMessage = await message.reply(getPayload());

    // No owner filter — collector sees all interactions, handles non-owner in-handler
    const collector = sentMessage.createMessageComponentCollector();

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
        if (newCategory === "JOB") await seedJobShop(interaction.guildId!);
        if (newCategory === "UNI") await seedUniShop(interaction.guildId!);
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

      // ── Job Store page navigation: shop_page:JOB:<page>:<owner> ─
      if (customId.startsWith("shop_page:JOB:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const parts = customId.split(":");
        const newPage = parseInt(parts[2], 10);
        if (!isNaN(newPage) && newPage >= 1 && newPage <= JS_TOTAL_PAGES) {
          await interaction.deferUpdate();
          currentPage = newPage;
          await interaction.editReply(buildJobStoreMessage(currentPage, ownerId));
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

      // ── Hunt Store numbered info slot: shop_info_slot:HUNT:1:<slot>:<owner> ─
      if (customId.startsWith("shop_info_slot:HUNT:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const parts = customId.split(":");
        // format: shop_info_slot:HUNT:1:<slot>:<ownerId>
        const slot = parseInt(parts[3], 10);
        if (isNaN(slot) || slot < 1 || slot > 9) return;

        const itemKey = HS_ITEMS[slot - 1];
        const catalogItem = HUNT_SHOP_CATALOG.find(i => i.key === itemKey);
        if (!catalogItem) return;

        await interaction.reply(buildItemInfoCard(catalogItem, ownerId));
        return;
      }

      // ── Job Store numbered info slot: shop_info_slot:JOB:<page>:<slot>:<owner> ─
      if (customId.startsWith("shop_info_slot:JOB:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const parts = customId.split(":");
        // format: shop_info_slot:JOB:<page>:<slot>:<ownerId>
        const slotPage = parseInt(parts[2], 10);
        const slot = parseInt(parts[3], 10);
        const pageItems = JS_PAGE_ITEMS[slotPage];
        if (!pageItems || isNaN(slot) || slot < 1 || slot > pageItems.length) return;

        const itemKey = pageItems[slot - 1];
        const catalogItem = JOB_SHOP_CATALOG.find(i => i.key === itemKey);
        if (!catalogItem) return;

        await interaction.reply(buildItemInfoCard(catalogItem, ownerId));
        return;
      }

      // ── Uni Store numbered info slot: shop_info_slot:UNI:1:<slot>:<owner> ─
      if (customId.startsWith("shop_info_slot:UNI:") && customId.endsWith(`:${ownerId}`)) {
        if (!isOwner) {
          await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
          return;
        }
        const parts = customId.split(":");
        const slot = parseInt(parts[3], 10);
        if (isNaN(slot) || slot < 1 || slot > US_PAGE_ITEMS.length) return;

        const itemKey = US_PAGE_ITEMS[slot - 1];
        const catalogItem = UNI_SHOP_CATALOG.find(i => i.key === itemKey);
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
          ?? HUNT_SHOP_CATALOG.find(i => i.key === itemKey)
          ?? JOB_SHOP_CATALOG.find(i => i.key === itemKey)
          ?? UNI_SHOP_CATALOG.find(i => i.key === itemKey)
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
          const payload = await executeBuy(
            interaction.user.id,
            interaction.guildId!,
            interaction.user.tag,
            interaction.member as GuildMember,
            catalogItem,
            interaction.client,
            interaction.guild!,
          );
          await interaction.editReply(payload);
        } catch (err) {
          const errContainer = v2Container("Purchase Failed", (err as Error).message.slice(0, 1800), 0xE74C3C);
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              components: [errContainer],
              flags: MessageFlags.IsComponentsV2,
            });
          } else {
            await interaction.reply({
              components: [errContainer],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
          }
        }
        return;
      }
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

// ---------------------------------------------------------------------------
// Global shop_buy handler — called from index.ts for buttons outside collectors
// (e.g. Buy button inside ephemeral info cards which have no collector)
// ---------------------------------------------------------------------------

export async function handleShopBuyInteraction(interaction: import("discord.js").ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  // customId format: shop_buy:<itemKey>:<ownerId>
  const parts = customId.split(":");
  const itemKey = parts[1];
  const ownerId = parts[2];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This shop belongs to someone else.", flags: MessageFlags.Ephemeral });
    return;
  }

  const catalogItem = GENERAL_SHOP_CATALOG.find(i => i.key === itemKey)
    ?? HUNT_SHOP_CATALOG.find(i => i.key === itemKey)
    ?? JOB_SHOP_CATALOG.find(i => i.key === itemKey)
    ?? UNI_SHOP_CATALOG.find(i => i.key === itemKey);

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
    const payload = await executeBuy(
      interaction.user.id,
      interaction.guildId!,
      interaction.user.tag,
      interaction.member as GuildMember,
      catalogItem,
      interaction.client,
      interaction.guild!,
    );
    await interaction.editReply(payload);
  } catch (err) {
    const errContainer = v2Container("Purchase Failed", (err as Error).message.slice(0, 1800), 0xE74C3C);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
    } else {
      await interaction.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
  }
}

// ---------------------------------------------------------------------------
// Global shop_use handler — handles "Use Now" buttons on purchase confirmation cards
// ---------------------------------------------------------------------------

export async function handleShopUseInteraction(interaction: import("discord.js").ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  // customId format: shop_use:<itemKey>:<ownerId>
  const parts = customId.split(":");
  const itemKey = parts[1];
  const ownerId = parts[2];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This isn't yours.", flags: MessageFlags.Ephemeral });
    return;
  }

  const allCatalogs = [...GENERAL_SHOP_CATALOG, ...HUNT_SHOP_CATALOG, ...JOB_SHOP_CATALOG, ...UNI_SHOP_CATALOG];
  const catalogItem = allCatalogs.find(i => i.key === itemKey);

  if (!catalogItem || !catalogItem.usable) {
    await interaction.reply({
      components: [v2Container("Error", "This item cannot be used directly.", 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Verify ownership before using
    const inv = await import("../../utils/prisma").then(m =>
      m.default.inventory.findMany({
        where: { userId: interaction.user.id },
        include: { shopItem: true },
      })
    ) as any[];

    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const entry = inv.find((i: any) => normalize(i.shopItem.name) === normalize(catalogItem.name) && i.amount > 0);
    if (!entry) {
      await interaction.editReply({
        components: [v2Container("Error", `You don't own a **${catalogItem.name}** to use.`, 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const { handleSpecialItemUse } = await import("../../services/shopItemEffects");
    const result = await handleSpecialItemUse(
      itemKey,
      interaction.user.id,
      interaction.guildId!,
      interaction.member as GuildMember,
    );

    if (result) {
      const shouldConsume = result.success && result.shouldConsume !== false;
      if (shouldConsume) {
        const prismaModule = await import("../../utils/prisma");
        const prisma = prismaModule.default;
        if (entry.amount <= 1) {
          await prisma.inventory.delete({ where: { id: entry.id } });
        } else {
          await prisma.inventory.update({ where: { id: entry.id }, data: { amount: { decrement: 1 } } });
        }
      }
      const color = result.success ? 0x2ECC71 : 0xE74C3C;
      await interaction.editReply({
        components: [v2Container(catalogItem.name, result.message, color)],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      await interaction.editReply({
        components: [v2Container("Error", "This item has no special effect.", 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch (err) {
    const errMsg = (err as Error).message.slice(0, 1800);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        components: [v2Container("Error", errMsg, 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      await interaction.reply({
        components: [v2Container("Error", errMsg, 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  }
}
