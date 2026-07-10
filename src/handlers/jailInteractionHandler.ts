import { Interaction } from "discord.js";
import { payBail, checkJailStatus } from "../services/jailService";
import { ensureUserAndWallet } from "../services/walletService";
import { errorEmbed, successEmbed } from "../utils/embed";
import { ensureDeferredEphemeralReply, safeEditReply } from "../utils/interactionHelpers";

export async function handleJailInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "pay_bail") return;

  if (!await ensureDeferredEphemeralReply(interaction)) return;

  const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
  const status = await checkJailStatus(user.discordId);

  if (!status.isJailed) {
    return safeEditReply(interaction, {
      embeds: [errorEmbed(interaction.user, "Not Jailed", "You are not in jail!")],
    });
  }

  const result = await payBail(user.discordId, interaction.guildId!);

  if (result.success) {
    return safeEditReply(interaction, {
      embeds: [successEmbed(interaction.user, "Bail Paid", result.message)],
    });
  }

  return safeEditReply(interaction, {
    embeds: [errorEmbed(interaction.user, "Bail Failed", result.message)],
  });
}
