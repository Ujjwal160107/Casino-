import { Message } from "discord.js";
import { depositToBank, ensureBankingUser, getBankByUserId } from "../../services/bankService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";

export async function handleDeposit(message: Message, args: string[]) {
  const user = await ensureBankingUser(message.author.id, message.author.username);
  const wallet = user.wallet!;
  const amountStr = args[0];

  if (!amountStr) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Usage: `!dep <amount/all>`")] });
  }

  const amount = parseSmartAmount(amountStr, wallet.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please enter a valid positive number.")] });
  }

  try {
    const { actualAmount, capped } = await depositToBank(wallet.id, user.discordId, amount);
    const updatedBank = await getBankByUserId(user.discordId);
    const partialMsg = capped ? " (Global Safety Cap Reached)" : "";

    return message.reply({
      embeds: [
        successEmbed(
          message.author,
          capped ? "Partial Deposit" : "Deposit Successful",
          `Deposited **${fmtCurrency(actualAmount)}**${partialMsg}.\nGlobal Bank: **${fmtCurrency(updatedBank?.balance ?? 0)}**`
        )
      ]
    });
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(message.author, "Failed", (err as Error).message)] });
  }
}
