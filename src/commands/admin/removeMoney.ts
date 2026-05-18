import { Message } from "discord.js";
import { ensureUserAndWallet, removeMoneyFromWallet } from "../../services/walletService";
import { removeMoneyFromBank } from "../../services/bankService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { logToChannel } from "../../utils/discordLogger";
import prisma from "../../utils/prisma";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

export async function handleRemoveMoney(message: Message, args: string[]) {
  if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
    return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
  }

  const config = await getGuildConfig(message.guildId!);
  const emoji = config.currencyEmoji;

  const targetUser = message.mentions.users.first();
  const amountArg = args[1];
  const typeArg = args[2]?.toLowerCase() || "wallet";
  const type = typeArg === "bank" ? "bank" : "wallet";

  if (!targetUser) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}removemoney @user <amount|all|%> [wallet/bank]\``)]
    });
  }
  if (!amountArg) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Invalid Usage", "Please specify an amount, percentage, or 'all'.")]
    });
  }

  const isAllAmount = /^(all|everyone)$/i.test(amountArg);
  const isPercentage = amountArg.includes("%");
  let value = 0;
  if (!isAllAmount) {
    if (isPercentage) {
      value = parseFloat(amountArg.replace(/,/g, "").replace("%", ""));
    } else {
      value = parseSmartAmount(amountArg);
    }
    if (isNaN(value) || value <= 0) {
      return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please provide a valid positive number.")] });
    }
  }
  try {
    const user = await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);
    let removeAmount = 0;
    let newBal = 0;
    if (type === "bank") {
      const bank = await prisma.bank.findUnique({ where: { userId: user.discordId } });
      const currentBal = bank?.balance || 0;
      if (isAllAmount) {
        removeAmount = currentBal;
      } else if (isPercentage) {
        if (value > 100) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Cannot remove more than 100%.")] });
        removeAmount = Math.floor(currentBal * (value / 100));
      } else {
        removeAmount = value;
      }
      if (removeAmount <= 0 && currentBal > 0) {
        removeAmount = 0;
      }
      if (removeAmount > 0) {
        newBal = await removeMoneyFromBank(user.discordId, removeAmount);
      } else {
        newBal = currentBal;
      }
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "Money Removed (Bank)",
        description: `**Admin:** ${message.author.tag}\n**Target:** ${targetUser.tag}\n**Amount:** -${fmtCurrency(removeAmount, emoji)} (${amountArg})\n**New Balance:** ${fmtCurrency(newBal, emoji)}`,
        color: 0xFF0000
      });
      return message.reply({
        embeds: [successEmbed(message.author, "Money Removed", `Removed **${fmtCurrency(removeAmount, emoji)}** from ${targetUser.username}'s **Bank**.\nNew Balance: **${fmtCurrency(newBal, emoji)}**`)]
      });
    } else {
      const currentBal = user.wallet?.balance || 0;
      if (isAllAmount) {
        removeAmount = currentBal;
      } else if (isPercentage) {
        if (value > 100) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Cannot remove more than 100%.")] });
        removeAmount = Math.floor(currentBal * (value / 100));
      } else {
        removeAmount = value;
      }
      if (removeAmount > 0) {
        newBal = await removeMoneyFromWallet(user.wallet!.id, removeAmount);
      } else {
        newBal = currentBal;
      }
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "Money Removed (Wallet)",
        description: `**Admin:** ${message.author.tag}\n**Target:** ${targetUser.tag}\n**Amount:** -${fmtCurrency(removeAmount, emoji)} (${amountArg})\n**New Balance:** ${fmtCurrency(newBal, emoji)}`,
        color: 0xFF0000
      });
      return message.reply({
        embeds: [successEmbed(message.author, "Money Removed", `Removed **${fmtCurrency(removeAmount, emoji)}** from ${targetUser.username}'s **Wallet**.\nNew Balance: **${fmtCurrency(newBal, emoji)}**`)]
      });
    }
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(message.author, "Error", (err as Error).message)] });
  }
}
