import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";
import { logToChannel } from "../../utils/discordLogger";

export async function handleResetLoans(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }

    const targetUser = message.mentions.users.first();
    const config = await getGuildConfig(message.guildId!);

    if (!targetUser) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Please mention a user to reset loans for.\nExample: \`${config.prefix}reset-loans @user\``)] });
    }

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guildId! } }
    });

    if (!user) {
        return message.reply({ embeds: [errorEmbed(message.author, "User Not Found", "This user is not registered in the casino system.")] });
    }

    try {
        const result = await prisma.loan.deleteMany({
            where: { userId: user.id }
        });

        if (result.count === 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "No Loans Found", "This user does not have any loan records to reset.")] });
        }

        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Loans Reset",
            description: `**Target:** ${targetUser.tag}\n**Admin:** ${message.author.tag}\n**Records Deleted:** ${result.count}`,
            color: 0xFF0000
        });

        return message.reply({
            embeds: [successEmbed(message.author, "Loans Reset", `Successfully deleted **${result.count}** loan record(s) for ${targetUser.tag}. They correspond to a clean slate.`)]
        });

    } catch (e) {
        console.error(e);
        return message.reply({ embeds: [errorEmbed(message.author, "Database Error", "Failed to reset loans.")] });
    }
}
