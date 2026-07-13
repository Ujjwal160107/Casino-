import { Message } from "discord.js";
import { depositToBank, ensureBankingUser, getBankByUserId } from "../../services/bankService";
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";

export async function handleDeposit(message: Message, args: string[]) {
  const user = await ensureBankingUser(message.author.id, message.author.username);
  const wallet = user.wallet!;
  const amountStr = args[0];

  if (!amountStr) {
    return message.reply(v2Reply(errorContainer("Invalid Amount", "Usage: `!dep <amount/all>`")));
  }

  const amount = parseSmartAmount(amountStr, wallet.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply(v2Reply(errorContainer("Invalid Amount", "Please enter a valid positive number.")));
  }

  try {
    const { actualAmount, capped } = await depositToBank(wallet.id, user.discordId, amount);
    const updatedBank = await getBankByUserId(user.discordId);
    const partialMsg = capped ? " (Wallet cap reached)" : "";

    return message.reply(
      v2Reply(
        successContainer(
          capped ? "Partial Deposit" : "Deposit Successful",
          `Deposited **${fmtCurrency(actualAmount)}**${partialMsg}.\nBank balance: **${fmtCurrency(updatedBank?.balance ?? 0)}**`,
          { hint: nextStepHint("deposit") }
        )
      )
    );
  } catch (err) {
    return message.reply(v2Reply(errorContainer("Failed", (err as Error).message)));
  }
}
