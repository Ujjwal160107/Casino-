import { ButtonInteraction, Interaction, MessageFlags, TextDisplayBuilder } from "discord.js";
import { buildHeatDashboard } from "../commands/economy/heat";
import { applyHeatAction } from "../services/taxService";
import { fmtCurrency } from "../utils/format";
import { ensureDeferredUpdate, safeEditReply, safeReply } from "../utils/interactionHelpers";
import { errorContainer, v2Reply } from "../utils/componentsV2";

const activeHeatActions = new Set<string>();

export async function handleHeatInteraction(interaction: Interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("heat:")) return;
  await handleHeatButton(interaction);
}

async function handleHeatButton(interaction: ButtonInteraction) {
  const [, ownerId, actionId] = interaction.customId.split(":");
  if (ownerId !== interaction.user.id) {
    await safeReply(interaction, v2Reply(errorContainer("Heat Dashboard", "This heat dashboard belongs to someone else."), undefined, MessageFlags.Ephemeral));
    return;
  }
  if (!await ensureDeferredUpdate(interaction)) return;

  if (actionId !== "lay_low" && actionId !== "fixer") {
    await safeEditReply(interaction, v2Reply(errorContainer("Heat Action Failed", "That heat action is no longer available.")));
    return;
  }

  if (activeHeatActions.has(interaction.user.id)) {
    await safeEditReply(interaction, v2Reply(errorContainer("Heat Action In Progress", "Your previous heat action is still being processed.")));
    return;
  }

  try {
    activeHeatActions.add(interaction.user.id);
    const result = await applyHeatAction(interaction.user.id, interaction.user.username, actionId);
    const dashboard = await buildHeatDashboard(interaction.user.id, interaction.user.username);
    dashboard.container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${result.actionName} complete.**\n`
        + `Heat: **${result.previousHeat} → ${result.heat}** (-${result.reducedBy})\n`
        + (result.cost > 0
          ? `Paid ${fmtCurrency(result.cost)}. Wallet: ${fmtCurrency(result.previousWalletBalance)} → ${fmtCurrency(result.walletBalance)}`
          : "No wallet funds were spent."),
      ),
    );
    await safeEditReply(interaction, { components: [dashboard.container], flags: MessageFlags.IsComponentsV2 });
  } catch (error: any) {
    const dashboard = await buildHeatDashboard(interaction.user.id, interaction.user.username);
    dashboard.container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Heat action failed:** ${error.message}`),
    );
    await safeEditReply(interaction, { components: [dashboard.container], flags: MessageFlags.IsComponentsV2 });
  } finally {
    activeHeatActions.delete(interaction.user.id);
  }
}
