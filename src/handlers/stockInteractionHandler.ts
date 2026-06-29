import {
  ActionRowBuilder,
  ButtonInteraction,
  Interaction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getStock, buyStock } from "../services/stockService";
import { fmtCurrency } from "../utils/format";
import { ensureDeferredEphemeralReply, safeEditReply, safeReply } from "../utils/interactionHelpers";

const BUY_BUTTON_PREFIX = "stock_buy:";
const BUY_MODAL_PREFIX = "stock_buy_modal:";

export function isStockInteraction(customId: string): boolean {
  return customId.startsWith(BUY_BUTTON_PREFIX) || customId.startsWith(BUY_MODAL_PREFIX);
}

export async function handleStockInteraction(interaction: Interaction): Promise<void> {
  const id = (interaction as any).customId || "";

  if (interaction.isButton() && id.startsWith(BUY_BUTTON_PREFIX)) {
    return showBuyModal(interaction as ButtonInteraction, id.slice(BUY_BUTTON_PREFIX.length));
  }

  if (interaction.isModalSubmit() && id.startsWith(BUY_MODAL_PREFIX)) {
    return submitBuy(interaction as ModalSubmitInteraction, id.slice(BUY_MODAL_PREFIX.length));
  }
}

async function showBuyModal(interaction: ButtonInteraction, symbol: string): Promise<void> {
  const stock = await getStock(symbol);
  if (!stock) {
    await interaction.reply({ content: `Stock **${symbol}** not found.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (stock.status !== "ACTIVE") {
    await interaction.reply({ content: `**${stock.symbol}** is being delisted — you can only sell.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const priceLabel = stock.currentPrice.toLocaleString();
  const modal = new ModalBuilder()
    .setCustomId(`${BUY_MODAL_PREFIX}${stock.symbol}`)
    .setTitle(`Buy ${stock.symbol} @ ${priceLabel}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("quantity")
          .setLabel(`Shares (${priceLabel} each)`.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 10")
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

async function submitBuy(interaction: ModalSubmitInteraction, symbol: string): Promise<void> {
  const raw = interaction.fields.getTextInputValue("quantity").trim();
  const qty = Number(raw);
  if (!Number.isInteger(qty) || qty <= 0) {
    await safeReply(interaction, { content: "Quantity must be a positive whole number.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!await ensureDeferredEphemeralReply(interaction, MessageFlags.Ephemeral)) return;

  try {
    const res = await buyStock(interaction.user.id, symbol, qty);
    await safeEditReply(interaction, {
      content:
        `Bought **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
        `(slippage ${res.impactPct.toFixed(1)}%).\n` +
        `Total **${fmtCurrency(res.cost)}**. You now own **${res.newQty}** shares.`,
    });
  } catch (e: any) {
    await safeEditReply(interaction, { content: `Purchase failed: ${e.message}` });
  }
}
