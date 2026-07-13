import { Message } from "discord.js";
import { ensureBankingUser, getBankByUserId, withdrawFromBank } from "../../services/bankService";
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";

export async function handleWithdrawBank(message: Message, args: string[]) {
  const user = await ensureBankingUser(message.author.id, message.author.username);
  const bank = await getBankByUserId(user.discordId);

  if (!bank) return message.reply(v2Reply(errorContainer("No Bank Account", "You do not have a bank account.")));

  const amountStr = args[0];
  if (!amountStr) {
    return message.reply(v2Reply(errorContainer("Invalid Amount", "Usage: `!withdraw <amount | all>`")));
  }

  const amount = parseSmartAmount(amountStr, bank.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply(v2Reply(errorContainer("Invalid Amount", "Please enter a valid positive number.")));
  }

  try {
    const result = await withdrawFromBank(user.wallet!.id, user.discordId, amount);
    const updated = await getBankByUserId(user.discordId);
    const partialMsg = result.capped ? " (Wallet cap reached)" : "";

    return message.reply(
      v2Reply(
        successContainer(
          result.capped ? "Partial Withdraw" : "Withdraw Successful",
          `Withdrew **${fmtCurrency(result.actualAmount)}**${partialMsg} from bank.\nRemaining bank balance: **${fmtCurrency(updated?.balance ?? 0)}**`,
          { hint: nextStepHint("withdraw") }
        )
      )
    );
  } catch (err) {
    return message.reply(v2Reply(errorContainer("Withdraw Failed", (err as Error).message)));
  }
}
