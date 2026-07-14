import { Message } from "discord.js";
import { ensureBankForUser } from "../../services/bankService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { statusContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { Mascot, getEmoteUrl, GLOBAL_CURRENCY_EMOJI } from "../../config/branding";

export async function handleBalance(message: Message) {
  const targetUser = message.mentions.users.first() ?? message.author;
  const guildId = message.guildId;

  if (!guildId) return;

  if (targetUser.bot) {
    return message.reply(v2Reply(statusContainer("error", "Error", "Bots do not have wallets.")));
  }

  const user = await ensureUserAndWallet(targetUser.id, guildId, targetUser.tag);
  const bank = await ensureBankForUser(user.discordId, targetUser.tag);
  const bankDebt = bank.balance < 0;
  return message.reply(
    v2Reply(
      statusContainer(
        "info",
        `${targetUser.username}'s Balance`,
        `**Wallet:** ${fmtCurrency(user.wallet?.balance ?? 0, GLOBAL_CURRENCY_EMOJI)}\n**Bank:** ${fmtCurrency(bank.balance, GLOBAL_CURRENCY_EMOJI)}${bankDebt ? " **(Debt)**" : ""}`,
        {
          thumbnailUrl: getEmoteUrl(Mascot.Emotes.Money) ?? undefined,
          hint: bankDebt ? "Deposits repay your bank debt before building savings." : nextStepHint("balance"),
        }
      )
    )
  );
}
