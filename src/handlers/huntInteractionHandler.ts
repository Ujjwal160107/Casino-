import { ButtonInteraction, ContainerBuilder, Interaction, MessageFlags } from "discord.js";
import {
  sellAnimalsByKey,
  sellAllPartsByKey,
  addAnimalsByKeyToZoo,
  removeAnimalsByKey,
  claimZooIncome,
} from "../services/huntService";
import { buildZooContainer } from "../commands/games/zoo";
import { successEmbed } from "../utils/embed";
import { fmtCurrency } from "../utils/format";
import { PART_VALUES, getAnimal } from "../utils/animalCatalog";

async function replyEphemeral(interaction: ButtonInteraction, content: string) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

export async function handleHuntInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  const parts = customId.split(":");

  // hunt_sell:<animalKey>:<ownerId>
  if (customId.startsWith("hunt_sell:")) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) {
      return replyEphemeral(interaction, "This isn't your hunt result.");
    }

    await interaction.deferUpdate();

    try {
      const def = getAnimal(animalKey);
      const { earned, count } = await sellAnimalsByKey(ownerId, animalKey, interaction.user.username);
      await interaction.followUp({
        embeds: [successEmbed(
          interaction.user,
          "Animals Sold",
          `Sold **${count}×** **${def?.name ?? animalKey}** for **${fmtCurrency(earned)}**.`
        )],
        flags: MessageFlags.Ephemeral,
      });
      await disableGroupButtons(interaction, animalKey, ownerId);
    } catch (err: any) {
      await interaction.followUp({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // hunt_market:<animalKey>:<ownerId>
  if (customId.startsWith("hunt_market:")) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) {
      return replyEphemeral(interaction, "This isn't your hunt result.");
    }

    await interaction.deferUpdate();

    try {
      const def = getAnimal(animalKey);
      if (!def) {
        await interaction.followUp({ content: "❌ Unknown animal type.", flags: MessageFlags.Ephemeral });
        return;
      }

      const { totalEarned, partsSummary } = await sellAllPartsByKey(ownerId, animalKey, interaction.user.username);

      const partLines = Object.entries(partsSummary)
        .map(([part, qty]) => `${part.charAt(0).toUpperCase() + part.slice(1)} ×${qty}: ${fmtCurrency((PART_VALUES[part] ?? 0) * qty)}`)
        .join("\n");

      await interaction.followUp({
        embeds: [successEmbed(
          interaction.user,
          "Parts Sold on Black Market",
          `Sold all parts from **${def.name}** for **${fmtCurrency(totalEarned)}**.\n\n${partLines}`
        )],
        flags: MessageFlags.Ephemeral,
      });

      await disableGroupButtons(interaction, animalKey, ownerId);
    } catch (err: any) {
      await interaction.followUp({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // hunt_zoo:<animalKey>:<ownerId>
  if (customId.startsWith("hunt_zoo:")) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) {
      return replyEphemeral(interaction, "This isn't your hunt result.");
    }

    await interaction.deferUpdate();

    try {
      const def = getAnimal(animalKey);
      const { count } = await addAnimalsByKeyToZoo(ownerId, animalKey, interaction.guildId ?? "");
      await interaction.followUp({
        content: `✅ Sent **${count}× ${def?.name ?? animalKey}** to your zoo!`,
        flags: MessageFlags.Ephemeral,
      });
      await disableGroupButtons(interaction, animalKey, ownerId);
    } catch (err: any) {
      await interaction.followUp({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // zoo_remove:<animalKey>:<ownerId>
  if (customId.startsWith("zoo_remove:")) {
    const [, animalKey, ownerId] = parts;
    if (interaction.user.id !== ownerId) {
      return replyEphemeral(interaction, "This isn't your zoo.");
    }

    await interaction.deferUpdate();

    try {
      const def = getAnimal(animalKey);
      const { count } = await removeAnimalsByKey(ownerId, animalKey);
      await interaction.followUp({
        content: `✅ Removed **${count}× ${def?.name ?? animalKey}** from your zoo.`,
        flags: MessageFlags.Ephemeral,
      });
      const container = await buildZooContainer(ownerId, interaction.user.username, interaction.guildId ?? "", interaction.guild);
      const files = (container as any).__files ?? [];
      await interaction.editReply({ components: [container], files });
    } catch (err: any) {
      await interaction.followUp({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // zoo_collect:<ownerId>
  if (customId.startsWith("zoo_collect:")) {
    const ownerId = parts[1];
    if (interaction.user.id !== ownerId) {
      return replyEphemeral(interaction, "This isn't your zoo.");
    }

    await interaction.deferUpdate();

    try {
      const { claimed, hoursSinceLastClaim } = await claimZooIncome(ownerId, interaction.user.username);
      await interaction.followUp({
        embeds: [successEmbed(
          interaction.user,
          "Zoo Income Collected",
          `Collected **${fmtCurrency(claimed)}** for **${hoursSinceLastClaim}h** of zoo income.`
        )],
        flags: MessageFlags.Ephemeral,
      });
      const container = await buildZooContainer(ownerId, interaction.user.username, interaction.guildId ?? "", interaction.guild);
      const files = (container as any).__files ?? [];
      await interaction.editReply({ components: [container], files });
    } catch (err: any) {
      await interaction.followUp({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
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
    const zooId = `hunt_zoo:${animalKey}:${ownerId}`;

    const updated = msg.components.map((component: any) => {
      if (component.type !== 1) return component;
      return {
        ...component,
        components: component.components.map((btn: any) => {
          if ([sellId, marketId, zooId].includes(btn.custom_id)) {
            return { ...btn, disabled: true };
          }
          return btn;
        }),
      };
    });

    await interaction.editReply({ components: updated });
  } catch {
    // Non-critical
  }
}
