import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { ensureBankForUser } from "../../services/bankService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { getGuildConfig } from "../../services/guildConfigService";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

export async function handleSetMoney(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }

    if (args.length < 2) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", "Usage: `!set-money @user <amount> [wallet/bank]`")] });
    }

    const mention = args[0];
    const amountStr = args[1];
    const amount = parseSmartAmount(amountStr);
    const typeArg = args[2]?.toLowerCase();
    const targetType = typeArg === "bank" ? "bank" : "wallet";

    if (isNaN(amount) || amount < 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please specify a valid positive amount (0 or more).")] });
    }

    const config = await getGuildConfig(message.guildId!);
    const emoji = config.currencyEmoji;

    const discordId = mention.replace(/[<@!>]/g, "");
    const target = await ensureUserAndWallet(discordId, message.guildId!, "Unknown");

    if (targetType === "bank") {
        const bank = await ensureBankForUser(target.discordId, "Unknown");
        const oldBalance = bank.balance;
        const [_, updatedBank] = await prisma.$transaction([
            prisma.transaction.create({
                data: {
                    walletId: target.wallet!.id,
                    amount: amount - oldBalance, // The "change" amount for the transaction log
                    type: "admin_set_bank",
                    meta: { by: message.author.id, oldBalance, newBalance: amount },
                    isEarned: false
                }
            }),
            prisma.bank.update({
                where: { id: bank.id },
                data: { balance: amount }
            }),
            prisma.audit.create({
                data: {
                    guildId: message.guildId ?? undefined,
                    userId: target.discordId,
                    type: "admin_set_money",
                    meta: { amount, oldBalance, target: "bank", by: message.author.id }
                }
            })
        ]);

        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Money Set (Bank)",
            description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Old Balance:** ${fmtCurrency(oldBalance, emoji)}\n**New Balance:** ${fmtCurrency(updatedBank.balance, emoji)}`,
            color: 0xFFA500
        });
        return message.reply({
            embeds: [successEmbed(message.author, "Money Set", `Set ${mention}'s **Bank** balance to **${fmtCurrency(updatedBank.balance, emoji)}**.`)]
        });

    } else {
        // Wallet
        const oldBalance = target.wallet!.balance;
        const [_, updatedWallet] = await prisma.$transaction([
            prisma.transaction.create({
                data: {
                    walletId: target.wallet!.id,
                    amount: amount - oldBalance,
                    type: "admin_set_wallet",
                    meta: { by: message.author.id, oldBalance, newBalance: amount },
                    isEarned: false
                }
            }),
            prisma.wallet.update({
                where: { id: target.wallet!.id },
                data: { balance: amount }
            }),
            prisma.audit.create({
                data: {
                    guildId: message.guildId ?? undefined,
                    userId: target.discordId,
                    type: "admin_set_money",
                    meta: { amount, oldBalance, target: "wallet", by: message.author.id }
                }
            })
        ]);

        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Money Set (Wallet)",
            description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Old Balance:** ${fmtCurrency(oldBalance, emoji)}\n**New Balance:** ${fmtCurrency(updatedWallet.balance, emoji)}`,
            color: 0xFFA500
        });
        return message.reply({
            embeds: [successEmbed(message.author, "Money Set", `Set ${mention}'s **Wallet** balance to **${fmtCurrency(updatedWallet.balance, emoji)}**.`)]
        });
    }
}
