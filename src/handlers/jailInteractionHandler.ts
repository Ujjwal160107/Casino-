import { Interaction } from "discord.js";
import { payBail, checkJailStatus } from "../services/jailService";
import { ensureUserAndWallet } from "../services/walletService";
import { errorContainer, successContainer, v2Reply } from "../utils/componentsV2";
import { nextStepHint } from "../config/nextSteps";
import { ensureDeferredEphemeralReply, safeEditReply } from "../utils/interactionHelpers";

export async function handleJailInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "pay_bail") return;

  if (!await ensureDeferredEphemeralReply(interaction)) return;

  const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
  const status = await checkJailStatus(user.discordId);

  if (!status.isJailed) {
    return safeEditReply(interaction, v2Reply(errorContainer("Not Jailed", "You are not in jail!")));
  }

  const result = await payBail(user.discordId, interaction.guildId!);

  if (result.success) {
    return safeEditReply(
      interaction,
      v2Reply(successContainer("Bail Paid", result.message, { hint: nextStepHint("bail") }))
    );
  }

  return safeEditReply(interaction, v2Reply(errorContainer("Bail Failed", result.message)));
}
