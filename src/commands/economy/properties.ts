import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import {
    PropertyService,
    seedGlobalProperties,
    collectIncome,
    REGULAR_PROPERTY_CATALOG,
    ZOO_KEYS,
} from "../../services/propertyService";
import { ZOO_CAPACITY } from "../../utils/animalCatalog";
import { fmtCurrency, fmtAmount } from "../../utils/format";
import { GLOBAL_CURRENCY_EMOJI, Mascot } from "../../config/branding";
import { Property } from "@prisma/client";
import { getGuildPrefix } from "../../utils/guildContext";

const PROPERTY_ACCENT_COLOR = 0x9B59B6;
const PROPERTIES_PER_PAGE = 3;

const PROPERTY_ASSET_MAP: Record<string, string> = {
  shack:      "shack",
  apartment:  "apartment",
  house:      "house",
  mansion:    "mansion",
  island:     "private island",
  mini_zoo:   "mini zoo",
  city_zoo:   "city zoo",
  world_zoo:  "world zoo",
};

function resolvePropertyAsset(key: string): { filePath: string; attachmentName: string } | null {
  const assetName = PROPERTY_ASSET_MAP[key];
  if (!assetName) return null;
  const assetDirs = [
    path.resolve(process.cwd(), "src", "assets"),
    path.resolve(process.cwd(), "assets"),
  ];
  for (const dir of assetDirs) {
    const filePath = [".png", ".jpg", ".jpeg", ".webp"]
      .map((ext) => path.join(dir, `${assetName}${ext}`))
      .find((f) => fs.existsSync(f));
    if (filePath) {
      const safeName = assetName.replace(/\s+/g, "_");
      return { filePath, attachmentName: `prop_${safeName}${path.extname(filePath)}` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number) {
    return amount.toLocaleString("en-US");
}

export function getPropertiesTotalPages(properties: Property[]) {
    return Math.max(1, Math.ceil(properties.length / PROPERTIES_PER_PAGE));
}

export function buildPropertiesNavigationRow(totalPages: number, page = 1) {
    const safeTotalPages = Math.max(1, totalPages);
    const safePage = Math.min(Math.max(page, 1), safeTotalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("property_page_first_1")
            .setLabel("First")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 1),
        new ButtonBuilder()
            .setCustomId(`property_page_prev_${Math.max(1, safePage - 1)}`)
            .setLabel("Prev")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage <= 1),
        new ButtonBuilder()
            .setCustomId(`property_page_next_${Math.min(safeTotalPages, safePage + 1)}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage >= safeTotalPages),
        new ButtonBuilder()
            .setCustomId(`property_page_last_${safeTotalPages}`)
            .setLabel("Last")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= safeTotalPages),
    );
}

function buildTextOnlyContainer(title: string, body: string, accentColor = PROPERTY_ACCENT_COLOR) {
    return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${title}**`),
            new TextDisplayBuilder().setContent(body),
        );
}

// ---------------------------------------------------------------------------
// Properties Market Container (with regular/zoo sections)
// ---------------------------------------------------------------------------

export function buildPropertiesMarketContainer(
    properties: Property[],
    options: { currencyEmoji: string; prefix: string; page?: number },
    files: AttachmentBuilder[],
) {
    const totalPages = getPropertiesTotalPages(properties);
    const page = Math.min(Math.max(options.page ?? 1, 1), totalPages);
    const startIndex = (page - 1) * PROPERTIES_PER_PAGE;
    const visibleProperties = properties.slice(startIndex, startIndex + PROPERTIES_PER_PAGE);
    const hasProperties = properties.length > 0;

    const container = new ContainerBuilder()
        .setAccentColor(PROPERTY_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## Real Estate Market\nInvest in properties to earn passive income and grow your net worth.`,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        );

    if (!hasProperties) {
        return container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent("No properties are available for sale right now. Ask an admin to create some."),
        );
    }

    visibleProperties.forEach((property, index) => {
        const isZoo = ZOO_KEYS.has(property.key);
        const capacity = isZoo ? ZOO_CAPACITY[property.key] : null;

        const incomeLabel = isZoo
            ? `Capacity: **${capacity} animal types** | Income from zoo animals`
            : `Income/24h: **${fmtCurrency(property.incomePerCycle * Math.floor(24 / property.incomeCycleHours))}**`;

        const typeLabel = isZoo ? "Zoo Property" : "Regular Property";

        const section = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${property.name}\n-# ${typeLabel}`,
                ),
                new TextDisplayBuilder().setContent(
                    `Price: **${fmtCurrency(property.price)}**\n${incomeLabel}`,
                ),
            );

        const asset = resolvePropertyAsset(property.key);
        if (asset) {
            section.setThumbnailAccessory(
                new ThumbnailBuilder()
                    .setURL(`attachment://${asset.attachmentName}`)
                    .setDescription(property.name),
            );
            if (!files.find(f => (f as any).name === asset.attachmentName)) {
                files.push(new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }));
            }
        }

        container.addSectionComponents(section);

        if (index < visibleProperties.length - 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(SeparatorSpacingSize.Small),
            );
        }
    });

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Page ${page}/${totalPages} — click a Buy button below to purchase`,
        ),
    );

    return container;
}

export function buildPropertyBuyRow(properties: Property[], page: number) {
    const totalPages = getPropertiesTotalPages(properties);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (safePage - 1) * PROPERTIES_PER_PAGE;
    const visible = properties.slice(startIndex, startIndex + PROPERTIES_PER_PAGE);
    const row = new ActionRowBuilder<ButtonBuilder>();
    visible.forEach((property) => {
        const isZoo = ZOO_KEYS.has(property.key);
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`buy_property_${property.key}`)
                .setLabel(`Buy ${property.name}`)
                .setStyle(isZoo ? ButtonStyle.Primary : ButtonStyle.Success),
        );
    });
    return row;
}

// ---------------------------------------------------------------------------
// My Properties Container
// ---------------------------------------------------------------------------

function buildMyPropertiesContainer(
    owned: Awaited<ReturnType<typeof PropertyService.getOwnedProperties>>,
    currencyEmoji: string,
    prefix: string,
): ContainerBuilder {
    const container = new ContainerBuilder()
        .setAccentColor(PROPERTY_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🏘️ Your Property Portfolio`),
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );

    const regularOwned = owned.filter((o) => !ZOO_KEYS.has(o.property.key));
    const zooOwned = owned.filter((o) => ZOO_KEYS.has(o.property.key));

    // Regular properties section
    if (regularOwned.length > 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**🏠 Regular Properties (${regularOwned.length})**`),
        );

        regularOwned.slice(0, 5).forEach((ownedProperty, index) => {
            const property = ownedProperty.property;
            const income24h = property.incomePerCycle * Math.floor(24 / property.incomeCycleHours);

            if (index > 0) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
                );
            }

            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**${property.name}**`),
                        new TextDisplayBuilder().setContent(
                            `Paid: ${fmtCurrency(ownedProperty.purchasedPrice)} | Value: ${fmtCurrency(property.price)}\nIncome/24h: **${fmtCurrency(income24h)}**`,
                        ),
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(`sell_property_${property.key}`)
                            .setLabel("Sell")
                            .setStyle(ButtonStyle.Danger),
                    ),
            );
        });
    }

    // Zoo properties section
    if (zooOwned.length > 0) {
        if (regularOwned.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            );
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**🦁 Zoo Properties (${zooOwned.length})**`),
        );

        zooOwned.forEach((ownedProperty, index) => {
            const property = ownedProperty.property;
            const capacity = ZOO_CAPACITY[property.key] ?? "?";

            if (index > 0) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
                );
            }

            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**${property.name}**`),
                        new TextDisplayBuilder().setContent(
                            `Paid: ${fmtCurrency(ownedProperty.purchasedPrice)} | Value: ${fmtCurrency(property.price)}\nCapacity: **${capacity} animal slots** | Use \`!zoo\` to manage`,
                        ),
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(`sell_property_${property.key}`)
                            .setLabel("Sell")
                            .setStyle(ButtonStyle.Danger),
                    ),
            );
        });
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `Use \`${prefix}sell-property <key>\` to sell a property back for ~75% of its current value.`,
        ),
    );

    return container;
}

// ---------------------------------------------------------------------------
// Collect Receipt Container
// ---------------------------------------------------------------------------

function buildCollectReceiptContainer(
    result: Awaited<ReturnType<typeof collectIncome>>,
): ContainerBuilder {
    const container = new ContainerBuilder().setAccentColor(0x2ECC71);

    if (result.nothingReady) {
        let nextText = "Check back later.";
        const soonest = [result.nextPropertyCollect, result.nextZooCollect]
            .filter((d): d is Date => d !== null)
            .sort((a, b) => a.getTime() - b.getTime())[0];

        if (soonest) {
            const ts = Math.floor(soonest.getTime() / 1000);
            nextText = `Nothing is ready yet. Earliest collection: <t:${ts}:R>`;
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🏠 Income Collected\n\n${nextText}`),
        );
        return container;
    }

    let headerContent = `## 🏠 Income Collected`;
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerContent),
    );
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // Regular properties breakdown
    if (result.propertyBreakdown.length > 0) {
        const propertyLines = result.propertyBreakdown
            .map((entry) => `  ${entry.name}: **+${fmtCurrency(entry.income)}**`)
            .join("\n");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**🏠 Regular Properties** (+${fmtCurrency(result.propertyTotal)})\n${propertyLines}`,
            ),
        );
    }

    // Zoo income breakdown
    if (result.zooBreakdown.length > 0) {
        if (result.propertyBreakdown.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
            );
        }

        // Group by rarity for a cleaner display
        const rarityGroups: Record<string, { count: number; total: number }> = {};
        for (const entry of result.zooBreakdown) {
            if (!rarityGroups[entry.rarity]) {
                rarityGroups[entry.rarity] = { count: 0, total: 0 };
            }
            rarityGroups[entry.rarity].count++;
            rarityGroups[entry.rarity].total += entry.income;
        }

        const zooLines = Object.entries(rarityGroups)
            .map(([rarity, { count, total }]) => `  ${count}x ${rarity}: **+${fmtCurrency(total)}**`)
            .join("\n");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**🦁 Zoo Income** (+${fmtCurrency(result.zooTotal)})\n${zooLines}`,
            ),
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

    // Grand total and next collection timestamps
    const totalLine = `**Total Collected: ${fmtCurrency(result.grandTotal)}**`;
    const lines: string[] = [totalLine];

    if (result.nextPropertyCollect) {
        const ts = Math.floor(result.nextPropertyCollect.getTime() / 1000);
        lines.push(`Next property collection: <t:${ts}:R>`);
    }
    if (result.nextZooCollect) {
        const ts = Math.floor(result.nextZooCollect.getTime() / 1000);
        lines.push(`Next zoo collection: <t:${ts}:R>`);
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(lines.join("\n")),
    );

    return container;
}

// ---------------------------------------------------------------------------
// Handler: !properties [subcommand]
// ---------------------------------------------------------------------------

export const propertiesHandler = async (message: Message, args: string[]) => {
    const subCommand = args[0]?.toLowerCase();
    const guildId = message.guildId!;
    const prefix = await getGuildPrefix(guildId);
    const currencyEmoji = GLOBAL_CURRENCY_EMOJI;
    
    

    // ---- !properties collect ----
    if (subCommand === "collect") {
        try {
            const result = await collectIncome(message.author.id, guildId);
            const container = buildCollectReceiptContainer(result);
            return message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (err) {
            console.error("collectIncome error:", err);
            return message.reply({
                components: [
                    buildTextOnlyContainer(
                        "Collection Failed",
                        "Something went wrong while collecting income. Please try again.",
                        0xE74C3C,
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }

    // ---- !properties mine ----
    if (subCommand === "mine") {
        return myPropertiesHandler(message);
    }

    // ---- !properties (market, default) ----
    await seedGlobalProperties(guildId);
    const properties = await PropertyService.getAllProperties(guildId);
    const totalPages = getPropertiesTotalPages(properties);
    const files: AttachmentBuilder[] = [];
    const container = buildPropertiesMarketContainer(properties, { currencyEmoji, prefix }, files);
    const buyRow = buildPropertyBuyRow(properties, 1);
    const navigationRow = buildPropertiesNavigationRow(totalPages);

    const components: any[] = [container];
    if (properties.length > 0) components.push(buyRow);
    if (totalPages > 1) components.push(navigationRow);

    try {
        return await message.reply({
            components,
            files,
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        console.error("Failed to send properties V2 market:", err);
        return message.reply({
            components: [
                buildTextOnlyContainer(
                    "Real Estate Market",
                    "The property market could not be rendered. Check the bot logs for the Discord API validation error.",
                    0xE74C3C,
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }
};

// ---------------------------------------------------------------------------
// Handler: !buy-property <key>
// ---------------------------------------------------------------------------

export const buyPropertyHandler = async (message: Message, args: string[]) => {
    const prefix = await getGuildPrefix(message.guildId!);
    
    const key = args[0]?.toLowerCase();

    if (!key) {
        return message.reply({
            components: [
                buildTextOnlyContainer(
                    "Property Key Required",
                    `Use \`${prefix}buy-property <key>\` or press a Buy Property button in \`${prefix}properties\`.`,
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    // Seed first so the property exists
    await seedGlobalProperties(message.guildId!);

    const result = await PropertyService.buyProperty(message.author.id, message.guildId!, key);

    return message.reply({
        components: [
            buildTextOnlyContainer(
                result.success ? "Purchase Successful" : "Purchase Failed",
                result.message,
                result.success ? 0x2ECC71 : 0xE74C3C,
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
};

// ---------------------------------------------------------------------------
// Handler: !sell-property <key>
// ---------------------------------------------------------------------------

export const sellPropertyHandler = async (message: Message, args: string[]) => {
    const prefix = await getGuildPrefix(message.guildId!);
    
    const key = args[0]?.toLowerCase();

    if (!key) {
        return message.reply({
            components: [
                buildTextOnlyContainer(
                    "Property Key Required",
                    `Use \`${prefix}sell-property <key>\`. This sells back to the bank for about 75% value. Use \`${prefix}market\` to sell to players.`,
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    const result = await PropertyService.sellPropertySystem(message.author.id, message.guildId!, key);

    return message.reply({
        components: [
            buildTextOnlyContainer(
                result.success ? "Sale Successful" : "Sale Failed",
                result.message,
                result.success ? 0x2ECC71 : 0xE74C3C,
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
};

// ---------------------------------------------------------------------------
// Handler: !my-properties
// ---------------------------------------------------------------------------

export const myPropertiesHandler = async (message: Message) => {
    const prefix = await getGuildPrefix(message.guildId!);
    const currencyEmoji = GLOBAL_CURRENCY_EMOJI;
    
    
    const owned = await PropertyService.getOwnedProperties(message.author.id, message.guildId!);

    if (owned.length === 0) {
        return message.reply({
            components: [
                buildTextOnlyContainer(
                    "Property Portfolio",
                    `You don't own any properties yet. Use \`${prefix}properties\` to view the market.`,
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    const container = buildMyPropertiesContainer(owned, currencyEmoji, prefix);

    return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
};

// ---------------------------------------------------------------------------
// Handler: !collect-rent (legacy — redirects to collectIncome)
// ---------------------------------------------------------------------------

export const collectRentHandler = async (message: Message) => {
    try {
        const result = await collectIncome(message.author.id, message.guildId!);
        const container = buildCollectReceiptContainer(result);
        return message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        console.error("collectRentHandler error:", err);
        return message.reply({
            components: [
                buildTextOnlyContainer(
                    "Collection Failed",
                    "Something went wrong while collecting income. Please try again.",
                    0xE74C3C,
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }
};
