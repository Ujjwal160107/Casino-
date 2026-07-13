import {
  AttachmentBuilder,
  ContainerBuilder,
  Interaction,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import {
  buildPropertiesMarketContainer,
  buildPropertiesNavigationRow,
  buildPropertyBuyRow,
  getPropertiesTotalPages,
} from "../commands/economy/properties";
import { PropertyService, seedGlobalProperties } from "../services/propertyService";
import { GLOBAL_CURRENCY_EMOJI, Mascot } from "../config/branding";
import { ensureDeferredEphemeralReply, ensureDeferredUpdate, safeEditReply, safeReply } from "../utils/interactionHelpers";
import { getGuildPrefix } from "../utils/guildContext";

function textContainer(title: string, body: string, color = 0x9B59B6) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

export async function handleMarketInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;

  const id = interaction.customId;
  const guildId = interaction.guildId;
  if (!guildId) {
    await safeReply(interaction, { content: "This interaction only works inside a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (id.startsWith("property_page_")) {
    await ensureDeferredUpdate(interaction);
    const parts = id.split("_");
    const page = parseInt(parts[parts.length - 1], 10) || 1;

    await seedGlobalProperties(guildId);
    const [properties, prefix] = await Promise.all([
      PropertyService.getAllProperties(guildId),
      getGuildPrefix(guildId),
    ]);

    const totalPages = getPropertiesTotalPages(properties);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const files: AttachmentBuilder[] = [];
    const container = buildPropertiesMarketContainer(properties, {
      currencyEmoji: GLOBAL_CURRENCY_EMOJI,
      prefix,
      page: safePage,
    }, files);

    const components: any[] = [container];
    if (properties.length > 0) components.push(buildPropertyBuyRow(properties, safePage));
    if (totalPages > 1) components.push(buildPropertiesNavigationRow(totalPages, safePage));

    await safeEditReply(interaction, { components, files });
    return;
  }

  if (id.startsWith("buy_property_")) {
    const key = id.replace("buy_property_", "");
    await ensureDeferredEphemeralReply(interaction, MessageFlags.Ephemeral);
    await seedGlobalProperties(guildId);

    const result = await PropertyService.buyProperty(interaction.user.id, guildId, key);
    await safeEditReply(interaction, {
      components: [
        textContainer(
          result.success ? `${Mascot.Emotes.Accept} Property Purchased` : `${Mascot.Emotes.Decline} Purchase Failed`,
          result.message,
          result.success ? 0x2ECC71 : 0xE74C3C,
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (id.startsWith("sell_property_")) {
    const key = id.replace("sell_property_", "");
    await ensureDeferredEphemeralReply(interaction, MessageFlags.Ephemeral);

    const result = await PropertyService.sellPropertySystem(interaction.user.id, guildId, key);
    await safeEditReply(interaction, {
      components: [
        textContainer(
          result.success ? `${Mascot.Emotes.Accept} Property Sold` : `${Mascot.Emotes.Decline} Sale Failed`,
          result.message,
          result.success ? 0x2ECC71 : 0xE74C3C,
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
