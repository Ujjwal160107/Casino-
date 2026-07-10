import { Message } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { transferAnyFunds } from "../../services/transferService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtAmount, fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { getGuildPrefix } from "../../utils/guildContext";

export async function handleTransfer(message: Message, args: string[]) {
  try {
    const prefix = await getGuildPrefix(message.guildId!);
    if (args.length < 2) {
      return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}transfer @user <amount>\``)] });
    }
    const targetMention = args[0];
    const amountString = args[1];
    const toId = targetMention.replace(/[<@!>]/g, "");
    if (!/^\d+$/.test(toId)) {
      return message.reply({ embeds: [errorEmbed(message.author, "Invalid Recipient", "Please mention a valid user to transfer to.")] });
    }
    const sender = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
    if (!sender.wallet) {
      return message.reply({ embeds: [errorEmbed(message.author, "Wallet Not Found", "Your wallet could not be found. Please try again.")] });
    }
    const amount = parseSmartAmount(amountString, sender.wallet.balance);
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please enter a valid positive number for the amount.")] });
    }
    try {
      const taxResult = await transferAnyFunds(sender.wallet!.id, toId, amount, message.author.id, message.guildId ?? undefined);

      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ECONOMY",
        title: "Transfer",
        description: `**From:** <@${sender.discordId}>\n**To:** <@${toId}>\n**Amount:** ${fmtCurrency(amount)}\n**Tax:** ${taxResult.shielded ? "🛡️ Shielded" : fmtCurrency(taxResult.taxPaid)}\n**Received:** ${fmtCurrency(taxResult.net)}`,
        color: 0x00FFFF
      });

      const taxLine = taxResult.shielded
        ? "Tax: 🛡️ Shielded"
        : `Transfer Tax (5%): -${fmtCurrency(taxResult.taxPaid)} | Recipient receives: ${fmtCurrency(taxResult.net)}`;

      return message.reply({ embeds: [successEmbed(message.author, "Transfer Successful", `Sent **${fmtAmount(amount)}** to <@${toId}>.\n${taxLine}`)] });
    } catch (err) {
      return message.reply({ embeds: [errorEmbed(message.author, "Transfer Failed", (err as Error).message)] });
    }
  } catch (err) {
    console.error("handleTransfer error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Internal Error", "Something went wrong.")] });
  }
}