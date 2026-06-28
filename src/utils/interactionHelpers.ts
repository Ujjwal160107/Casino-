import {
  Interaction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageComponentInteraction,
  ContextMenuCommandInteraction,
  MessageFlags,
  ModalSubmitInteraction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";

type ReplyCapableInteraction =
  | MessageComponentInteraction
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction
  | ModalSubmitInteraction;

export function isInteractionExpiredError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 10062;
}

export function isAlreadyAcknowledgedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: number | string }).code;
  return code === 40060 || code === "InteractionAlreadyReplied";
}

export function shouldIgnoreInteractionError(err: unknown): boolean {
  return isInteractionExpiredError(err) || isAlreadyAcknowledgedError(err);
}

export async function safeDeferUpdate(interaction: MessageComponentInteraction): Promise<boolean> {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function safeDeferReply(
  interaction: ReplyCapableInteraction,
  options: InteractionReplyOptions = {},
): Promise<boolean> {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply(options as Parameters<ReplyCapableInteraction["deferReply"]>[0]);
    return true;
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function safeReply(
  interaction: ReplyCapableInteraction,
  options: InteractionReplyOptions,
): Promise<boolean> {
  if (interaction.replied || interaction.deferred) {
    return safeFollowUp(interaction, options);
  }
  try {
    await interaction.reply(options);
    return true;
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function safeUpdate(
  interaction: MessageComponentInteraction,
  options: InteractionUpdateOptions,
): Promise<boolean> {
  if (interaction.deferred) {
    return safeEditReply(interaction, options);
  }
  try {
    await interaction.update(options);
    return true;
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function safeEditReply(
  interaction: ReplyCapableInteraction,
  options: InteractionEditReplyOptions,
): Promise<boolean> {
  try {
    await interaction.editReply(options);
    return true;
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function safeFollowUp(
  interaction: ReplyCapableInteraction,
  options: InteractionReplyOptions,
): Promise<boolean> {
  try {
    await interaction.followUp(options);
    return true;
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function ensureDeferredUpdate(interaction: MessageComponentInteraction): Promise<boolean> {
  return safeDeferUpdate(interaction);
}

export async function ensureDeferredEphemeralReply(
  interaction: ReplyCapableInteraction,
  flags: number = MessageFlags.Ephemeral,
): Promise<boolean> {
  return safeDeferReply(interaction, { flags });
}

export async function refreshMessageComponent(
  interaction: MessageComponentInteraction,
  build: () => Promise<InteractionEditReplyOptions>,
): Promise<boolean> {
  if (!await ensureDeferredUpdate(interaction)) return false;
  try {
    const payload = await build();
    return safeEditReply(interaction, payload);
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export async function replyEphemeralAfterWork(
  interaction: MessageComponentInteraction,
  flags: number,
  build: () => Promise<InteractionEditReplyOptions>,
): Promise<boolean> {
  if (!await ensureDeferredEphemeralReply(interaction, flags)) return false;
  try {
    const payload = await build();
    return safeEditReply(interaction, payload);
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return false;
    throw err;
  }
}

export type EarlyAckStrategy = "deferUpdate" | "deferEphemeral" | "skip";

/** Only interactions handled in index.ts — not message collectors (!shop, !market, !inv, etc.). */
export function shouldEarlyAcknowledgeInIndex(customId: string): boolean {
  if (
    customId.startsWith("bank_") ||
    customId.startsWith("bank:") ||
    customId.startsWith("invest_")
  ) {
    return true;
  }

  if (customId.startsWith("bm_buy_confirm:")) return true;

  if (
    customId.startsWith("market_") ||
    customId.startsWith("sell_property_") ||
    customId.startsWith("buy_property_") ||
    customId.startsWith("property_page_") ||
    customId === "cancel_property_buy"
  ) {
    return true;
  }

  if (customId.startsWith("inv_")) return true;

  // Life/education/work buttons are ack'd inside lifeInteractionHandler (mixed public/ephemeral/update).

  if (customId.startsWith("ask_")) return true;
  if (customId.startsWith("crime:")) return true;
  if (customId === "pay_bail") return true;

  // Hunt/zoo buttons are ack'd inside huntInteractionHandler (deferUpdate vs deferReply varies by action).

  if (
    customId.startsWith("shop_buy:") ||
    customId.startsWith("shop_use:") ||
    customId.startsWith("shop_buy_card:") ||
    customId.startsWith("shop_buy_card_confirm:") ||
    customId.startsWith("shop_buy_card_cancel:")
  ) {
    return true;
  }

  if (customId === "global_economy_form_filled") return true;

  return false;
}

export function resolveEarlyAckStrategy(interaction: Interaction, customId: string): EarlyAckStrategy {
  if (!shouldEarlyAcknowledgeInIndex(customId)) return "skip";
  if (!interaction.isMessageComponent()) return "skip";
  const component = interaction as MessageComponentInteraction;
  if (component.replied || component.deferred) return "skip";

  if (customId === "invest_type_select") return "skip";
  if (customId.startsWith("inv2_part_select:")) return "skip";

  const ephemeralPrefixes = [
    "shop_use:",
    "shop_buy:",
    "shop_buy_card:",
    "shop_buy_card_confirm:",
    "shop_buy_card_cancel:",
    "bm_buy_confirm:",
    "buy_property_",
    "sell_property_",
    "pay_bail",
    "global_economy_form_filled",
  ];
  if (ephemeralPrefixes.some((prefix) => customId.startsWith(prefix))) return "deferEphemeral";

  if (
    customId === "invest_collect_btn" ||
    customId.includes("deposit_withdraw") ||
    customId.includes("cards_apply_best") ||
    customId.includes("card_apply") ||
    customId.includes("card_pay") ||
    customId.startsWith("bank_card_apply_")
  ) {
    return "deferEphemeral";
  }

  const updatePrefixes = [
    "bank:",
    "bank_",
    "invest_",
    "market_",
    "sell_",
    "property_page_",
    "cancel_property_buy",
    "inv_",
    "ask_",
    "crime:",
  ];
  if (updatePrefixes.some((prefix) => customId.startsWith(prefix))) return "deferUpdate";

  return "skip";
}

export async function tryEarlyAcknowledge(interaction: Interaction, customId: string): Promise<boolean> {
  if (!interaction.isMessageComponent()) return false;
  const component = interaction as MessageComponentInteraction;
  const strategy = resolveEarlyAckStrategy(interaction, customId);
  if (strategy === "deferUpdate") return ensureDeferredUpdate(component);
  if (strategy === "deferEphemeral") return ensureDeferredEphemeralReply(component);
  return false;
}

export async function safeInteractionReply(interaction: Interaction, opts: { content: string; ephemeral?: boolean }) {
  const { content, ephemeral = true } = opts;
  const flags = ephemeral ? MessageFlags.Ephemeral : undefined;

  try {
    if ((interaction as ChatInputCommandInteraction).isChatInputCommand?.()) {
      const ci = interaction as ChatInputCommandInteraction;
      if (ci.replied || ci.deferred) {
        return safeFollowUp(ci, { content, flags });
      }
      return safeReply(ci, { content, flags });
    }

    if ((interaction as ContextMenuCommandInteraction).isContextMenuCommand?.()) {
      const cm = interaction as ContextMenuCommandInteraction;
      if (cm.replied || cm.deferred) return safeFollowUp(cm, { content, flags });
      return safeReply(cm, { content, flags });
    }

    if ((interaction as MessageComponentInteraction).isMessageComponent?.()) {
      const mc = interaction as MessageComponentInteraction;
      if (mc.replied || mc.deferred) return safeFollowUp(mc, { content, flags });
      return safeReply(mc, { content, flags });
    }

    if ((interaction as AutocompleteInteraction).isAutocomplete?.()) {
      console.warn("safeInteractionReply called for AutocompleteInteraction — no reply possible.");
      return;
    }

    if (interaction.isRepliable()) {
      return safeReply(interaction as ReplyCapableInteraction, { content, flags });
    }
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return;
    console.error("safeInteractionReply failed:", err);
  }
}
