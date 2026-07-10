import {
  ContainerBuilder,
  Message,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import { ensureBankingUser } from "../../services/bankService";
import { getCardEligibilitySummary } from "../../services/creditCardService";
import { Mascot } from "../../config/branding";
import { buildMyCardsPayload } from "./bank";

const CARD_ACCENT = 0x5865F2;

export async function handleCredit(message: Message, _args: string[]) {
  if (!message.guild) return;

  await ensureBankingUser(message.author.id, message.author.username);

  const displayName = message.member?.displayName || message.author.globalName || message.author.username;
  const summary = await getCardEligibilitySummary(message.author.id);
  const card = summary.card;
  const score = summary.user?.creditScore ?? 500;
  const eligible = summary.eligibleTier?.tier ?? "None";

  const intro = new ContainerBuilder()
    .setAccentColor(CARD_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Credit} Fortuna Credit`),
      new TextDisplayBuilder().setContent(
        [
          `**Credit score:** ${score}`,
          `**Best eligible tier:** ${eligible}`,
          card
            ? `**Your card:** ${card.tier} · **${card.status}** · owed **${card.currentBalance.toLocaleString("en-US")}**`
            : "**Your card:** None — apply via `!bank` → Cards or `!card issue`",
          "",
          "Use **`!mycards`** for your full dashboard, due date, and pay buttons.",
        ].join("\n"),
      ),
    );

  const myCardsPayload = await buildMyCardsPayload(message.author.id, displayName, message.guild!.id);

  return message.reply({
    components: [intro, ...myCardsPayload.components],
    files: myCardsPayload.files,
    flags: MessageFlags.IsComponentsV2,
  });
}
