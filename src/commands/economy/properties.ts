import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import { Property } from "@prisma/client";
import { PropertyService } from "../../services/propertyService";
import { Mascot } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";

const PROPERTY_ACCENT_COLOR = 0x9B59B6;
const PROPERTY_BANNER_NAME = "property-banner.png";
const PROPERTY_BANNER_URL = `attachment://${PROPERTY_BANNER_NAME}`;
const PROPERTY_BANNER_PATH = "./assets/property_banner.png";
const PROPERTIES_PER_PAGE = 3;

function formatAmount(amount: number) {
    return amount.toLocaleString("en-US");
}

export function propertyBannerAttachment() {
    return new AttachmentBuilder(PROPERTY_BANNER_PATH, { name: PROPERTY_BANNER_NAME });
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

export function buildPropertiesMarketContainer(
    properties: Property[],
    options: { currencyEmoji: string; prefix: string; page?: number },
) {
    const totalPages = getPropertiesTotalPages(properties);
    const page = Math.min(Math.max(options.page ?? 1, 1), totalPages);
    const startIndex = (page - 1) * PROPERTIES_PER_PAGE;
    const visibleProperties = properties.slice(startIndex, startIndex + PROPERTIES_PER_PAGE);
    const hasProperties = properties.length > 0;
    const currencyEmoji = options.currencyEmoji;
    const container = new ContainerBuilder()
        .setAccentColor(PROPERTY_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${Mascot.Name} Real Estate Market\n> Invest in properties to earn passive income and grow your net worth!\n> Prices fluctuate based on market demand.`,
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
        container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${startIndex + index + 1}. ${property.name} (${property.key})`),
                        new TextDisplayBuilder().setContent(
                            `Base: **${currencyEmoji} ${formatAmount(property.basePrice)}**\nIncome: **${currencyEmoji} ${formatAmount(property.incomePerCycle)}**/${property.incomeCycleHours}h\nSold: ${property.totalSold}`,
                    ),
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`buy_property_${property.key}`)
                        .setLabel(`Price: ${formatAmount(property.price)}`)
                        .setStyle(ButtonStyle.Success),
                ),
        );

        if (index < visibleProperties.length - 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(SeparatorSpacingSize.Small),
            );
        }
    });

    container
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(PROPERTY_BANNER_URL)
                    .setDescription(`${Mascot.Name} real estate market banner`),
            ),
        );

    return container
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `Page ${page}/${totalPages} - Use \`${options.prefix}buy-property <key>\` to purchase`,
            ),
        );
}

function buildPropertyContainer(property: Property, currencyEmoji: string) {
    return new ContainerBuilder()
        .setAccentColor(PROPERTY_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${property.name}**`),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**Price:** ${formatAmount(property.price)} ${currencyEmoji}`),
                    new TextDisplayBuilder().setContent(`**Rent Income:** ${formatAmount(property.incomePerCycle)} ${currencyEmoji}`),
                    new TextDisplayBuilder().setContent(`**Collection Cycle:** Every ${property.incomeCycleHours} hours`),
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`buy_property_${property.key}`)
                        .setLabel(`Price: ${formatAmount(property.price)}`)
                        .setStyle(ButtonStyle.Success),
                ),
        )
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_property_${property.key}`)
                    .setLabel("Buy Property")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("cancel_property_buy")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary),
            ),
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

export const propertiesHandler = async (message: Message, args: string[]) => {
    const subCommand = args[0]?.toLowerCase();
    const guildId = message.guildId!;
    const guildConfig = await getGuildConfig(guildId);
    const prefix = guildConfig.prefix || "!";
    const currencyEmoji = guildConfig.currencyEmoji || Mascot.Emotes.Blackcoin;

    if (!subCommand) {
        const properties = await PropertyService.getAllProperties(guildId);
        const container = buildPropertiesMarketContainer(properties, { currencyEmoji, prefix });
        const navigationRow = buildPropertiesNavigationRow(getPropertiesTotalPages(properties));

        try {
            return await message.reply({
                components: [container, navigationRow],
                files: properties.length > 0 ? [propertyBannerAttachment()] : [],
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
    }
};

export const buyPropertyHandler = async (message: Message, args: string[]) => {
    const guildConfig = await getGuildConfig(message.guildId!);
    const prefix = guildConfig.prefix || "!";
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

export const sellPropertyHandler = async (message: Message, args: string[]) => {
    const guildConfig = await getGuildConfig(message.guildId!);
    const prefix = guildConfig.prefix || "!";
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

export const myPropertiesHandler = async (message: Message) => {
    const guildConfig = await getGuildConfig(message.guildId!);
    const prefix = guildConfig.prefix || "!";
    const currencyEmoji = guildConfig.currencyEmoji || Mascot.Emotes.Blackcoin;
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

    const components = owned.slice(0, 5).map((ownedProperty) => {
        const property = ownedProperty.property;
        return new ContainerBuilder()
            .setAccentColor(PROPERTY_ACCENT_COLOR)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${property.name}**`),
            )
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(SeparatorSpacingSize.Small),
            )
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**Purchase Price:** ${formatAmount(ownedProperty.purchasedPrice)} ${currencyEmoji}`),
                        new TextDisplayBuilder().setContent(`**Current Value:** ${formatAmount(property.price)} ${currencyEmoji}`),
                        new TextDisplayBuilder().setContent(`**Rent Income:** ${formatAmount(property.incomePerCycle)} ${currencyEmoji}`),
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(`buy_property_${property.key}`)
                            .setLabel("Owned")
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                    ),
            );
    });

    return message.reply({
        components,
        flags: MessageFlags.IsComponentsV2,
    });
};

export const collectRentHandler = async (message: Message) => {
    const result = await PropertyService.collectRent(message.author.id, message.guildId!);

    return message.reply({
        components: [
            buildTextOnlyContainer(
                result.success ? "Rent Collected" : "Rent Collection Failed",
                result.message,
                result.success ? 0x2ECC71 : 0xE74C3C,
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });
};
