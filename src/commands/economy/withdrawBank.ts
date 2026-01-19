import { Message } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { withdrawFromBank, getBankByUserId } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export async function handleWithdrawBank(message: Message, args: string[]) {
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
  const bank = await getBankByUserId(user.id);
  const config = await getGuildConfig(message.guildId!);
  const emoji = config.currencyEmoji;

  if (!bank) return message.reply({ embeds: [errorEmbed(message.author, "No Bank Account", "You do not have a bank account.")] });

  const amountStr = args[0];
  if (!amountStr) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", `Usage: \`${config.prefix}withdraw <amount | all>\``)] });
  }

  const amount = parseSmartAmount(amountStr, bank.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please enter a valid positive number.")] });
  }

  try {
    await withdrawFromBank(user.wallet!.id, user.id, amount, message.guildId!);
    const updated = await getBankByUserId(user.id);

    await logToChannel(message.client, {
      guild: message.guild!,
      type: "ECONOMY",
      title: "Bank Withdraw",
      description: `**User:** ${message.author.tag}\n**Amount:** ${fmtCurrency(amount, emoji)}\n**New Balance:** ${fmtCurrency(updated?.balance ?? 0, emoji)}`,
      color: 0x00AAFF
    });

    return message.reply({
      embeds: [
        successEmbed(
          message.author,
          "Withdraw Successful",
          `Withdrew **${fmtCurrency(amount, emoji)}** from bank.\nRemaining bank balance: **${fmtCurrency(updated?.balance ?? 0, emoji)}**`
        )
      ]
    });
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(message.author, "Withdraw Failed", (err as Error).message)] });
  }
}