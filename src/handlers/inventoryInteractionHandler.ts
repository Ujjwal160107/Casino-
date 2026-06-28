import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { safeReply } from "../utils/interactionHelpers";

/**
 * Legacy inventory interactions are retired.
 *
 * The active inventory dashboard uses `inv2_` custom IDs inside
 * src/commands/economy/inventory.ts. This handler only exists so older
 * messages with `inv_` buttons fail closed instead of reviving the removed
 * trade/gift flow.
 */
export async function handleInventoryInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
) {
  if (interaction.isRepliable()) {
    await safeReply(interaction, {
      content: "This old inventory panel has expired. Use `!inventory` or `!inv` to open the new inventory dashboard.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
