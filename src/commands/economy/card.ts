import {
  ContainerBuilder,
  Message,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from "discord.js";
import { ensureBankingUser } from "../../services/bankService";
import {
  closeCard,
  getCardSummary,
  issueCard,
  payCard,
  upgradeCard,
  withdrawFromCard
} from "../../services/creditCardService";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { buildBankCardsPayload, buildMyCardsPayload } from "./bank";

const CARD_ACCENT_COLOR = 0x5865F2;

function container(title: string, body: string, accentColor = CARD_ACCENT_COLOR) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body)
    );
}

export async function handleCard(message: Message, args: string[]) {
  await ensureBankingUser(message.author.id, message.author.username);

  const subCommand = args[0]?.toLowerCase() ?? "info";

  try {
    if (subCommand === "issue") {
      const card = await issueCard(message.author.id);
      return message.reply({
        components: [
          container("Card Issued", `Your **${card.tier}** Fortuna Card is active.\nLimit: **${fmtCurrency(card.creditLimit)}**\nWeekly Withdraw Cap: **${fmtCurrency(card.weeklyWithdrawCap)}**`, 0x2ECC71)
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (subCommand === "pay") {
      const summary = await getCardSummary(message.author.id);
      if (!summary.card) throw new Error("You do not have a card.");
      const amount = parseSmartAmount(args[1] || "", summary.card.currentBalance);
      const result = await payCard(message.author.id, amount);
      return message.reply({
        components: [
          container("Card Payment Posted", `Paid **${fmtCurrency(result.paid)}**.\nNew Card Balance: **${fmtCurrency(result.card.currentBalance)}**\n\nCredit score updates happen only during weekly settlement.`, 0x2ECC71)
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (subCommand === "withdraw") {
      const amount = parseSmartAmount(args[1] || "", Infinity);
      const result = await withdrawFromCard(message.author.id, amount);
      return message.reply({
        components: [
          container("Card Withdrawal", `Withdrew **${fmtCurrency(result.amount)}** to your wallet.\nCard Balance: **${fmtCurrency(result.card.currentBalance)}**\nWallet: **${fmtCurrency(result.wallet.balance)}**`, 0x2ECC71)
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (subCommand === "upgrade") {
      const card = await upgradeCard(message.author.id);
      return message.reply({
        components: [
          container("Card Upgraded", `Your card is now **${card.tier}**.\nLimit: **${fmtCurrency(card.creditLimit)}**`, 0x2ECC71)
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (subCommand === "close") {
      await closeCard(message.author.id);
      return message.reply({
        components: [container("Card Closed", "Your Fortuna Card has been closed.", 0x95A5A6)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const member = message.member;
    const displayName = member?.displayName || message.author.globalName || message.author.username;
    const summary = await getCardSummary(message.author.id);
    const view = summary.card ? "mine" as const : "catalog" as const;
    const payload = await buildBankCardsPayload(message.author.id, displayName, view, message.guild!.id);
    payload.components[0]
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("card")!));
    return message.reply({
      ...payload,
      flags: MessageFlags.IsComponentsV2
    });
  } catch (error) {
    return message.reply({
      components: [container("Card Error", (error as Error).message, 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

export async function handleMyCards(message: Message) {
  await ensureBankingUser(message.author.id, message.author.username);
  const displayName = message.member?.displayName || message.author.globalName || message.author.username;
  try {
    const payload = await buildMyCardsPayload(message.author.id, displayName, message.guild!.id);
    return message.reply({
      ...payload,
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (error) {
    return message.reply({
      components: [container("My Cards", (error as Error).message, 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
