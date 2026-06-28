import { Message } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { logToChannel } from "../../utils/discordLogger";
import prisma from "../../utils/prisma";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildPrefix } from "../../utils/guildContext";
import { CARD_SCORE_RULES } from "../../utils/economyConfig";

export async function handleSetCreditScore(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Admins or Bot Commanders only.")] });
    }

    const prefix = await getGuildPrefix(message.guildId!);
    const maxScore = CARD_SCORE_RULES.maxScore;
    const minScore = CARD_SCORE_RULES.minScore;

    if (args[0]?.toLowerCase() === "all" || args[0]?.toLowerCase() === "everyone") {
        const amountArg = args[1];
        if (!amountArg) {
            return message.reply({
                embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}set-credit-score all <amount>\`\nExample: \`${prefix}set-credit-score all 500\``)]
            });
        }
        const amount = parseInt(amountArg);
        if (isNaN(amount) || amount < minScore || amount > maxScore) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", `Score must be between **${minScore}** and **${maxScore}**.`)] });
        }

        const result = await prisma.user.updateMany({
            where: {},
            data: { creditScore: amount }
        });

        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Bulk Credit Score Set",
            description: `**Admin:** ${message.author.tag}\n**Scope:** ALL USERS\n**New Score:** ${amount}\n**Affected:** ${result.count} users`,
            color: 0xFF4500
        });

        return message.reply({
            embeds: [successEmbed(message.author, "Bulk Update Complete", `Set credit score to **${amount}** for **${result.count}** users.`)]
        });
    }

    const targetUser = message.mentions.users.first();
    const amountArg = args.find(a => !a.startsWith("<@") && !isNaN(parseInt(a)));

    if (!targetUser || !amountArg) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}set-credit-score @user <amount>\` or \`${prefix}set-credit-score all <amount>\``)]
        });
    }

    const amount = parseInt(amountArg);
    if (isNaN(amount) || amount < minScore || amount > maxScore) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", `Score must be between **${minScore}** and **${maxScore}**.`)] });
    }

    const user = await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.tag);
    const updatedUser = await prisma.user.update({
        where: { discordId: user.discordId },
        data: { creditScore: amount }
    });

    await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "Credit Score Set",
        description: `**Admin:** ${message.author.tag}\n**User:** ${targetUser.tag}\n**Old Score:** ${user.creditScore}\n**New Score:** ${updatedUser.creditScore}`,
        color: 0xFFA500
    });

    return message.reply({
        embeds: [successEmbed(message.author, "Credit Score Updated", `Set ${targetUser.username}'s credit score to **${updatedUser.creditScore}**.`)]
    });
}
