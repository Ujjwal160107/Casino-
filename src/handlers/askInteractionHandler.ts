import { Interaction, EmbedBuilder, MessageFlags, ButtonInteraction } from "discord.js";
import { transferMoney } from "../services/walletService";
import { logToChannel } from "../utils/discordLogger";
import { Mascot } from "../config/branding";
import { blockRequester } from "../services/askService";
import { getGuildPrefix } from "../utils/guildContext";
import {
  ensureDeferredUpdate,
  safeEditReply,
  safeFollowUp,
  safeReply,
} from "../utils/interactionHelpers";

function disabledRequestEmbed(interaction: ButtonInteraction, footer: string) {
  return EmbedBuilder.from(interaction.message.embeds[0])
    .setFooter({ text: footer });
}

export async function handleAskInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;

  const [action, requesterId, amountStr] = interaction.customId.split(":");
  const mentionMatch = interaction.message.content.match(/<@!?(\d+)>/);
  const targetUserId = mentionMatch ? mentionMatch[1] : null;

  if (!targetUserId || interaction.user.id !== targetUserId) {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Decline} This request is not for you.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!await ensureDeferredUpdate(interaction)) return;

  try {
    if (action === "ask_decline") {
      const embed = disabledRequestEmbed(interaction, `Declined by ${interaction.user.username}`)
        .setColor(0xFF0000);

      await safeEditReply(interaction, { components: [], embeds: [embed] });

      await logToChannel(interaction.client, {
        guild: interaction.guild!,
        type: "ECONOMY",
        title: "Money Request Declined",
        description: `**From:** <@${requesterId}>\n**To:** ${interaction.user.tag}\n**Amount:** ${amountStr ?? "—"}\n**Status:** Declined`,
        color: 0xFF0000,
      });
      return;
    }

    if (action === "ask_block") {
      await blockRequester(interaction.user.id, requesterId);

      const prefix = await getGuildPrefix(interaction.guild!.id);
      const embed = disabledRequestEmbed(interaction, `Blocked by ${interaction.user.username}`)
        .setColor(0x95A5A6);

      await safeEditReply(interaction, { components: [], embeds: [embed] });
      await safeFollowUp(interaction, {
        content: `${Mascot.Emotes.Accept} You blocked <@${requesterId}>. They cannot ask you for money until you run \`${prefix}ask unblock @user\`.`,
        flags: MessageFlags.Ephemeral,
      });

      await logToChannel(interaction.client, {
        guild: interaction.guild!,
        type: "ECONOMY",
        title: "Money Request Blocked",
        description: `**From:** <@${requesterId}>\n**To:** ${interaction.user.tag}\n**Status:** Blocked future requests`,
        color: 0x95A5A6,
      });
      return;
    }

    if (action === "ask_accept") {
      const amount = parseInt(amountStr, 10);
      try {
        await transferMoney(interaction.user.id, requesterId, amount, interaction.guildId!);

        const embed = disabledRequestEmbed(interaction, `Accepted by ${interaction.user.username} • Transfer Complete`)
          .setColor(0x00FF00);

        await safeEditReply(interaction, { components: [], embeds: [embed] });

        await logToChannel(interaction.client, {
          guild: interaction.guild!,
          type: "ECONOMY",
          title: "Money Request Accepted",
          description: `**From:** <@${requesterId}>\n**To:** ${interaction.user.tag}\n**Amount:** ${amount}\n**Status:** Accepted & Transferred`,
          color: 0x00FF00,
        });
      } catch (error: any) {
        if (error.message === "Insufficient funds.") {
          return safeFollowUp(interaction, {
            content: `${Mascot.Emotes.Fail} You do not have enough funds in your **wallet** to fulfill this request.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        return safeFollowUp(interaction, {
          content: `${Mascot.Emotes.Fail} Transfer failed: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  } catch (err) {
    console.error("Ask interaction error:", err);
  }
}
