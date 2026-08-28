import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ContainerBuilder,
  Interaction,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  sellAllInventoryAnimals,
  sellAnimalsByKey,
} from "../services/huntService";
import { claimZooIncome, feedAll, getZooStatus, houseAnimals, removeAnimalsByKey } from "../services/zooService";
import { buildZooContainer, formatCareNote, formatFeedShortfall } from "../commands/games/zoo";
import { successContainer, v2Reply } from "../utils/componentsV2";
import { fmtCurrency } from "../utils/format";
import { getAnimal } from "../utils/animalCatalog";
import {
  getAvailableSpeciesParts,
  listMultipleSpeciesPartsFromAnimals,
  listSpeciesPartFromAnimals,
  storeSpeciesPartsFromAnimals,
} from "../services/huntPartService";
import { buildHuntCraftPayload, craftHuntRecipe } from "../services/huntCraftService";
import { Mascot } from "../config/branding";
import {
  ensureDeferredEphemeralReply,
  ensureDeferredUpdate,
  refreshMessageComponent,
  safeEditReply,
  safeFollowUp,
  safeReply,
} from "../utils/interactionHelpers";

const V2_FLAGS = MessageFlags.IsComponentsV2 as const;

async function replyEphemeral(interaction: ButtonInteraction | import("discord.js").StringSelectMenuInteraction | import("discord.js").ModalSubmitInteraction, content: string) {
  if (interaction.deferred || interaction.replied) {
    await safeFollowUp(interaction, { content, flags: MessageFlags.Ephemeral });
  } else {
    await safeReply(interaction, { content, flags: MessageFlags.Ephemeral });
  }
}

function textContainer(title: string, body: string, color = 0x2C2F33) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body),
    );
}

export async function handleHuntInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

  const customId = interaction.customId;
  const parts = customId.split(":");

  if (customId.startsWith("hunt_craft_page:") && interaction.isButton()) {
    const [, pageRaw, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your craft dashboard.");
    await refreshMessageComponent(interaction, () =>
      buildHuntCraftPayload(ownerId, ownerId, parseInt(pageRaw, 10) || 1),
    );
    return;
  }

  if (customId.startsWith("hunt_craft_make:") && interaction.isButton()) {
    const [, recipeKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your craft dashboard.");

    if (!await ensureDeferredEphemeralReply(interaction)) return;
    try {
      const result = await craftHuntRecipe(ownerId, interaction.guildId ?? "", recipeKey);
      await safeEditReply(interaction, {
        components: [textContainer(`${Mascot.Emotes.Accept} Crafted`, `**${result.recipe.name}** crafted.\n\n${result.effectMessage}`, 0x2ECC71)],
        flags: V2_FLAGS,
      });
    } catch (err: any) {
      await safeEditReply(interaction, {
        components: [textContainer(`${Mascot.Emotes.Decline} Craft Failed`, err.message || "Could not craft this recipe.", 0xE74C3C)],
        flags: V2_FLAGS,
      });
    }
    return;
  }

  if (customId.startsWith("hunt_sell_all:") && interaction.isButton()) {
    const [, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      const { earned, count, summary } = await sellAllInventoryAnimals(ownerId, interaction.user.username);
      const lines = Object.entries(summary)
        .slice(0, 10)
        .map(([name, amount]) => `**${name}:** ${amount}`)
        .join(" | ");
      await safeFollowUp(interaction, v2Reply(
        successContainer(
          "All Hunted Animals Sold",
          `Sold **${count}** hunted animal${count === 1 ? "" : "s"} for **${fmtCurrency(earned)}**.\n\n${lines}`,
        ),
        undefined,
        MessageFlags.Ephemeral,
      ));
      await disableAllHuntButtons(interaction, ownerId);
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message || "Could not sell hunted animals.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("hunt_sell:") && interaction.isButton()) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      const def = getAnimal(animalKey);
      const { earned, count } = await sellAnimalsByKey(ownerId, animalKey, interaction.user.username);
      await safeFollowUp(interaction, v2Reply(
        successContainer(
          "Animals Sold",
          `Sold **${count}x** **${def?.name ?? animalKey}** for **${fmtCurrency(earned)}**.`,
        ),
        undefined,
        MessageFlags.Ephemeral,
      ));
      await disableGroupButtons(interaction, animalKey, ownerId);
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("hunt_market:") && interaction.isButton()) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    try {
      const def = getAnimal(animalKey);
      if (!def) return replyEphemeral(interaction, "Unknown animal type.");

      const available = await getAvailableSpeciesParts(ownerId, animalKey);
      if (available.parts.length === 0) {
        await safeReply(interaction, { content: "No harvestable parts are left on this animal group.", flags: MessageFlags.Ephemeral });
        return;
      }

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`hunt_part_select:${animalKey}:${ownerId}`)
          .setPlaceholder("Choose a part to list...")
          .setMinValues(1)
          .setMaxValues(Math.min(available.parts.length, 5))
          .addOptions(
            available.parts.slice(0, 25).map((part) => ({
              label: `${part.partName} x${part.amount}`,
              value: part.partKey,
              description: `Base value: ${fmtCurrency(part.baseValue)} each`,
            })),
          ),
      );

      await safeReply(interaction, {
        components: [
          textContainer(
            `Black Market Parts: ${def.name}`,
            "Choose a species-specific part to list. Buyers pay your price plus 5%; you receive the listed price minus 10%.",
          ),
          selectRow,
        ],
        flags: V2_FLAGS | MessageFlags.Ephemeral,
      });
    } catch (err: any) {
      await safeReply(interaction, { content: err.message || "Could not open part listing.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("hunt_store_parts:") && interaction.isButton()) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      const result = await storeSpeciesPartsFromAnimals(ownerId, animalKey);
      const lines = result.parts
        .slice(0, 10)
        .map((part) => `**${part.partName}:** ${part.amount}`)
        .join(" | ");

      await safeFollowUp(interaction, {
        components: [textContainer(
          `${Mascot.Emotes.Accept} Parts Stored`,
          `Stored parts from **${result.totalAnimals}x ${result.animalName}** into your hunt materials inventory.\n\n${lines}\n\n` +
          "-# Stored parts cannot be sold as whole animals or sent to the zoo, but you can craft with them or list them on the Black Market from `inventory`.",
          0x2ECC71,
        )],
        flags: V2_FLAGS | MessageFlags.Ephemeral,
      });
      await disableGroupButtons(interaction, animalKey, ownerId);
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message || "Could not store parts.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("hunt_part_select:") && interaction.isStringSelectMenu()) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    const partKeys = interaction.values;
    const modal = new ModalBuilder()
      .setCustomId(`hunt_part_modal:${animalKey}:${partKeys.join(",")}:${ownerId}`)
      .setTitle("List Animal Part");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("quantity")
          .setLabel("Quantity per selected part")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("price")
          .setLabel("Price per selected part listing")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("100000")
          .setRequired(true),
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith("hunt_part_modal:") && interaction.isModalSubmit()) {
    const [, animalKey, partKeyCsv, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    const quantity = parseInt(interaction.fields.getTextInputValue("quantity"), 10);
    const price = parseInt(interaction.fields.getTextInputValue("price"), 10);

    try {
      const partKeys = partKeyCsv.split(",").filter(Boolean);
      const result = partKeys.length > 1
        ? await listMultipleSpeciesPartsFromAnimals(ownerId, animalKey, partKeys, quantity, price)
        : { listed: [await listSpeciesPartFromAnimals(ownerId, animalKey, partKeys[0], quantity, price)] };
      const listedLines = result.listed
        .map((item) => `**${item.partName}** x${item.amount} — ${fmtCurrency(item.totalPrice)} (you get ${fmtCurrency(item.fees.sellerPayout)})`)
        .join("\n");
      await safeReply(interaction, {
        components: [textContainer(
          `${Mascot.Emotes.Accept} Part Listed`,
          `${listedLines}\n\n` +
          `${Mascot.Emotes.Cooldown} Expires in 7 days.`,
          0x2ECC71,
        )],
        flags: V2_FLAGS | MessageFlags.Ephemeral,
      });
    } catch (err: any) {
      await safeReply(interaction, {
        components: [textContainer(`${Mascot.Emotes.Decline} Listing Failed`, err.message || "Could not list this part.", 0xE74C3C)],
        flags: V2_FLAGS | MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (customId.startsWith("hunt_zoo:") && interaction.isButton()) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your hunt result.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      const def = getAnimal(animalKey);
      const { housed, reason } = await houseAnimals(ownerId, animalKey);
      if (housed === 0) {
        await safeFollowUp(interaction, { content: reason ?? "Couldn't house that animal.", flags: MessageFlags.Ephemeral });
        return;
      }
      const { count } = { count: housed };
      await safeFollowUp(interaction, {
        content: `Sent **${count}x ${def?.name ?? animalKey}** to your zoo!`,
        flags: MessageFlags.Ephemeral,
      });
      await disableGroupButtons(interaction, animalKey, ownerId);
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("zoo_remove:") && interaction.isButton()) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your zoo.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      const def = getAnimal(animalKey);
      const { count } = await removeAnimalsByKey(ownerId, animalKey);
      await safeFollowUp(interaction, {
        content: `Removed **${count}x ${def?.name ?? animalKey}** from your zoo.`,
        flags: MessageFlags.Ephemeral,
      });
      const container = await buildZooContainer(ownerId, interaction.user.username, interaction.guildId ?? "", interaction.guild);
      const files = (container as any).__files ?? [];
      await safeEditReply(interaction, { components: [container], files, flags: MessageFlags.IsComponentsV2 });
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("zoo_feed_all:") && interaction.isButton()) {
    const ownerId = parts[1];
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your zoo.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      // Captured before feedAll mutates anything below: feedAll runs its own
      // purgeDead/enforceHousing pass and discards the result, and by the time
      // buildZooContainer re-reads status afterward there's nothing left to
      // report. This read is the only place that death/eviction is visible.
      const { died, evicted } = await getZooStatus(ownerId);
      const careNote = formatCareNote(died, evicted);
      const result = await feedAll(ownerId);
      const shortfall = result.missing.length ? ` ${formatFeedShortfall(result.missing)}` : "";
      await safeFollowUp(interaction, {
        content: (result.fed > 0
          ? `Fed **${result.fed}** animal${result.fed !== 1 ? "s" : ""}.${shortfall}`
          : `You have no feed for the hungry animals in your zoo.${shortfall}`) + careNote,
        flags: MessageFlags.Ephemeral,
      });
      const container = await buildZooContainer(ownerId, interaction.user.username, interaction.guildId ?? "", interaction.guild);
      const files = (container as any).__files ?? [];
      await safeEditReply(interaction, { components: [container], files, flags: MessageFlags.IsComponentsV2 });
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith("zoo_collect:") && interaction.isButton()) {
    const ownerId = parts[1];
    if (interaction.user.id !== ownerId) return replyEphemeral(interaction, "This isn't your zoo.");

    if (!await ensureDeferredUpdate(interaction)) return;
    try {
      // Same reasoning as zoo_feed_all: claimZooIncome runs its own
      // purgeDead/enforceHousing internally, so this has to be read before the
      // claim or the death/eviction event is gone by the time we look.
      const { died, evicted } = await getZooStatus(ownerId);
      const careNote = formatCareNote(died, evicted);
      const { claimed, fedAnimals, hungryAnimals } = await claimZooIncome(ownerId, interaction.user.username);
      await safeFollowUp(interaction, v2Reply(
        successContainer(
          "Zoo Income Collected",
          `Collected **${fmtCurrency(claimed)}** from **${fedAnimals}** fed animal${fedAnimals !== 1 ? "s" : ""}.` +
          (hungryAnimals > 0 ? `\n${hungryAnimals} hungry animal${hungryAnimals !== 1 ? "s" : ""} earned nothing.` : "") +
          careNote,
        ),
        undefined,
        MessageFlags.Ephemeral,
      ));
      const container = await buildZooContainer(ownerId, interaction.user.username, interaction.guildId ?? "", interaction.guild);
      const files = (container as any).__files ?? [];
      await safeEditReply(interaction, { components: [container], files, flags: MessageFlags.IsComponentsV2 });
    } catch (err: any) {
      await safeFollowUp(interaction, { content: err.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }
}

async function disableGroupButtons(interaction: ButtonInteraction, animalKey: string, ownerId: string) {
  try {
    const msg = interaction.message;
    if (!msg?.components) return;

    const sellId = `hunt_sell:${animalKey}:${ownerId}`;
    const marketId = `hunt_market:${animalKey}:${ownerId}`;
    const storeId = `hunt_store_parts:${animalKey}:${ownerId}`;
    const zooId = `hunt_zoo:${animalKey}:${ownerId}`;

    const updated = msg.components.map((component: any) => {
      if (component.type !== 1) return component;
      return {
        ...component,
        components: component.components.map((btn: any) => {
          if ([sellId, marketId, storeId, zooId].includes(btn.custom_id)) return { ...btn, disabled: true };
          return btn;
        }),
      };
    });

    await safeEditReply(interaction, { components: updated });
  } catch {
    // Non-critical UI cleanup.
  }
}

async function disableAllHuntButtons(interaction: ButtonInteraction, ownerId: string) {
  try {
    const msg = interaction.message;
    if (!msg?.components) return;

    const updated = msg.components.map((component: any) => {
      if (component.type !== 1) return component;
      return {
        ...component,
        components: component.components.map((btn: any) => {
          if (typeof btn.custom_id === "string" && btn.custom_id.includes(`:${ownerId}`) && btn.custom_id.startsWith("hunt_")) {
            return { ...btn, disabled: true };
          }
          return btn;
        }),
      };
    });

    await safeEditReply(interaction, { components: updated });
  } catch {
    // Non-critical UI cleanup.
  }
}
