import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleManageChicken(message: Message, args: string[]) {
    // Usage: !setchicken <subcommand> <@user> <value>
    // Subcommands: level, xp, wins

    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Admins or Bot Commanders only.")] });
    }

    const sub = args[0]?.toLowerCase();
    const targetUser = message.mentions.users.first();
    const valueStr = args[2]; // Assumes <cmd> <subcommand> <@user> <value> 
    // OR <cmd> <subcommand> <value> (if for self? Admin on self is fine)
    // Let's stick to requiring a user for clarity.

    // Robust arg parsing:
    // args: [level, @user, 50] or [level, 50, @user]?
    // Let's assume standard: !setchicken level @user 50
    // args[0] = level, args[1] = @user/id, args[2] = 50

    // START of Update

    if (!targetUser) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Usage",
                `Usage: \`${config.prefix}setchicken <subcommand> @user <value>\`\n\nSubcommands:\n• **delete**\n• **level / xp / wins**\n• **str / agi / def**`)]
        });
    }

    // --- DELETE SUBCOMMAND ---
    if (sub === "delete") {
        const guildId = message.guildId!;
        const shopItem = await prisma.shopItem.findFirst({
            where: { name: { equals: "Chicken", mode: "insensitive" }, guildId }
        });
        if (!shopItem) return message.reply("Chicken item not configured in shop.");

        const userDb = await prisma.user.findFirst({ where: { discordId: targetUser.id, guildId } });
        if (!userDb) return message.reply("User not found in database.");

        const inv = await prisma.inventory.findUnique({
            where: { userId_shopItemId: { userId: userDb.id, shopItemId: shopItem.id } }
        });

        if (!inv || inv.amount < 1) {
            return message.reply({ embeds: [errorEmbed(message.author, "No Chicken", `${targetUser.username} does not own a chicken.`)] });
        }

        await prisma.inventory.delete({ where: { id: inv.id } });
        return message.reply({ embeds: [successEmbed(message.author, "Chicken Deleted", `Successfully removed **${targetUser.username}**'s chicken.`)] });
    }

    // --- STAT UPDATES ---
    if (!valueStr) {
        const config = await getGuildConfig(message.guildId!);
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Usage",
                `Usage: \`${config.prefix}setchicken <level|xp|wins|str|agi|def|delete> @user [value]\`\nExample: \`${config.prefix}setchicken str @User 10\``)]
        });
    }

    const value = parseInt(valueStr);
    if (isNaN(value) || value < 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Value", "Value must be a positive integer.")] });
    }

    const guildId = message.guildId!;

    // Find Chicken Item
    const shopItem = await prisma.shopItem.findFirst({
        where: { name: { equals: "Chicken", mode: "insensitive" }, guildId }
    });

    if (!shopItem) return message.reply("Chicken item not configured in shop.");

    // Find User DB
    const userDb = await prisma.user.findFirst({ where: { discordId: targetUser.id, guildId } });
    if (!userDb) return message.reply("User not found in database.");

    // Find Inventory
    const inv = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: userDb.id, shopItemId: shopItem.id } }
    });

    if (!inv || inv.amount < 1) {
        return message.reply({ embeds: [errorEmbed(message.author, "No Chicken", `${targetUser.username} does not own a chicken.`)] });
    }

    const meta = (inv.meta as any) || {};
    let updatedField = "";

    if (sub === "level") {
        meta.level = value;
        updatedField = "Level";
    } else if (sub === "xp") {
        meta.xp = value;
        updatedField = "XP";
    } else if (sub === "wins") {
        meta.wins = value;
        updatedField = "Wins";
    } else if (sub === "str" || sub === "strength") {
        meta.strength = value;
        updatedField = "Strength";
    } else if (sub === "agi" || sub === "agility") {
        meta.agility = value;
        updatedField = "Agility";
    } else if (sub === "def" || sub === "defense") {
        meta.defense = value;
        updatedField = "Defense";
    } else {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Subcommand", "Valid options: `level`, `xp`, `wins`, `str`, `agi`, `def`, `delete`.")] });
    }

    await prisma.inventory.update({
        where: { id: inv.id },
        data: { meta }
    });

    return message.reply({
        embeds: [successEmbed(message.author, "Chicken Updated",
            `Updated **${targetUser.username}**'s chicken:\n**${updatedField}:** ${value}`)]
    });
}
