import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { ensureBankForUser } from "../../services/bankService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { Mascot } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";

export async function handleAddMoney(message: Message, args: string[]) {
  if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
    return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
  }

  // Cap at 32-bit signed integer max to prevent DB crashes
  const MAX_INT = 2147483647;

  if (args.length < 2) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", "Usage: `!add-money @user/@role <amount> [wallet/bank]`")] });
  }

  const mention = args[0];
  const amountStr = args[1];
  let amount = parseSmartAmount(amountStr);

  // Cap amount to prevent DB crashes and handle "Infinity" request
  if (amount === Infinity || amount > MAX_INT) {
    amount = MAX_INT;
  }

  const typeArg = args[2]?.toLowerCase();
  const targetType = typeArg === "bank" ? "bank" : "wallet";

  if (isNaN(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Usage: `!add-money @user <amount> [wallet/bank]`")] });
  }

  const prefix = await getGuildPrefix(message.guildId!);
  

  // --- ROLE HANDLING ---
  if (mention.startsWith("<@&")) {
    const roleId = mention.replace(/[<@&>]/g, "");
    console.log(`[AddMoney] Processing Role: ${roleId}`);

    const role = await message.guild!.roles.fetch(roleId);
    if (!role) {
      console.log(`[AddMoney] Role not found for ID: ${roleId}`);
      return message.reply({ embeds: [errorEmbed(message.author, "Role Not Found", "Could not find that role.")] });
    }

    // Ensure members are fetched
    console.log("[AddMoney] Fetching guild members...");
    await message.guild!.members.fetch();
    console.log(`[AddMoney] Role Members Size: ${role.members.size}`);

    const statusMsg = await message.reply(`${Mascot.Emotes.Refresh} Processing payment to **${role.members.size}** members...`);
    let count = 0;

    // Helper function for batch processing
    const processMember = async (member: any) => {
      if (member.user.bot) return;
      try {
        console.log(`[AddMoney] Processing member: ${member.user.tag} (${member.id})`);
        const target = await ensureUserAndWallet(member.id, message.guildId!, member.user.username);

        if (targetType === "bank") {
          const bank = await ensureBankForUser(target.discordId, member.user.username);
          await prisma.$transaction([
            prisma.transaction.create({
              data: { walletId: target.wallet!.id, amount, type: "admin_add_bank", meta: { by: message.author.id, role: role.name }, isEarned: false }
            }),
            prisma.bank.update({ where: { id: bank.id }, data: { balance: { increment: amount } } })
          ]);
        } else {
          await prisma.$transaction([
            prisma.transaction.create({
              data: { walletId: target.wallet!.id, amount, type: "admin_add", meta: { by: message.author.id, role: role.name }, isEarned: false }
            }),
            prisma.wallet.update({ where: { id: target.wallet!.id }, data: { balance: { increment: amount } } })
          ]);
        }
        count++;
      } catch (e) {
        console.error(`Failed to add money to ${member.user.tag}:`, e);
      }
    };

    const members = Array.from(role.members.values());
    // batch in simple parallel
    await Promise.all(members.map(processMember));
    console.log(`[AddMoney] Finished. Count: ${count}`);

    return statusMsg.edit({
      content: "",
      embeds: [successEmbed(message.author, "Role Payment Complete", `Added **${fmtCurrency(amount)}** to **${count}** users in **${role.name}** (**${targetType === "bank" ? "Bank" : "Wallet"}**).`)]
    });
  }

  // --- SINGLE USER HANDLING ---
  const discordId = mention.replace(/[<@!>]/g, "");
  const target = await ensureUserAndWallet(discordId, message.guildId!, "Unknown");

  if (targetType === "bank") {
    const bank = await ensureBankForUser(target.discordId, "Unknown");
    const [_, updatedBank] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          walletId: target.wallet!.id,
          amount,
          type: "admin_add_bank",
          meta: { by: message.author.id },
          isEarned: false
        }
      }),
      prisma.bank.update({
        where: { id: bank.id },
        data: { balance: { increment: amount } }
      }),
      prisma.audit.create({
        data: {
          guildId: message.guildId ?? undefined,
          userId: target.discordId,
          type: "admin_add",
          meta: { amount, target: "bank", by: message.author.id }
        }
      })
    ]);
    await logToChannel(message.client, {
      guild: message.guild!,
      type: "ADMIN",
      title: "Money Added (Bank)",
      description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Amount:** +${fmtCurrency(amount)}\n**New Bank Balance:** ${fmtCurrency(updatedBank.balance)}`,
      color: 0x00FF00
    });
    const displayAmount = amount === MAX_INT ? "Infinity" : fmtCurrency(amount);
    return message.reply({
      embeds: [successEmbed(message.author, "Money Added", `Added **${displayAmount}** to ${mention}'s **Bank**.\nNew Balance: **${fmtCurrency(updatedBank.balance)}**`)]
    });
  } else {
    const [_, updatedWallet] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          walletId: target.wallet!.id,
          amount,
          type: "admin_add",
          meta: { by: message.author.id },
          isEarned: false
        }
      }),
      prisma.wallet.update({
        where: { id: target.wallet!.id },
        data: { balance: { increment: amount } }
      }),
      prisma.audit.create({
        data: {
          guildId: message.guildId ?? undefined,
          userId: target.discordId,
          type: "admin_add",
          meta: { amount, target: "wallet", by: message.author.id }
        }
      })
    ]);
    if (updatedWallet) {
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "Money Added (Wallet)",
        description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Amount:** +${fmtCurrency(amount)}\n**New Wallet Balance:** ${fmtCurrency(updatedWallet.balance)}`,
        color: 0x00FF00
      });
      const displayAmount = amount === MAX_INT ? "Infinity" : fmtCurrency(amount);
      return message.reply({
        embeds: [successEmbed(message.author, "Money Added", `Added **${displayAmount}** to ${mention}'s **Wallet**.\nNew Balance: **${fmtCurrency(updatedWallet.balance)}**`)]
      });
    }
  }
}
