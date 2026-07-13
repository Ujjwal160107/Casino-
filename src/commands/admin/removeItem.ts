import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { logToChannel } from "../../utils/discordLogger";

export async function handleRemoveItem(message: Message, args: string[]) {
    // Usage: ,removeitem @user <item name | all> [quantity]
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply(v2Reply(errorContainer("No Permission", "Admins or Bot Commanders only.")));
    }

    const targetUser = message.mentions.users.first();
    const targetId = targetUser ? targetUser.id : args[0];

    if (!targetId) {
        return message.reply(v2Reply(errorContainer("Invalid Usage", "Please mention a user or provide their ID.")));
    }

    // args[0] is user/id. args[1] starts item name? 
    // If mention is used, args may look different based on how they are split.
    // If I split by space, mention is one arg.

    // Let's refine parsing.
    // args passed from commandRouter are already split by space and shifting command name.
    // But mentions might be in args[0].

    let itemStartIndex = 1;
    if (!targetUser && !targetId.match(/^\d+$/)) {
        // if first arg is not a user ID and we didn't get a mention (though mention usually results in a string in args)
        // actually mentions are just strings in args like <@123>.
        // so targetId logic mainly holds.
    }

    const user = await prisma.user.findUnique({
        where: { discordId: targetId },
        include: {
            inventory: {
                include: { shopItem: true }
            }
        }
    });

    if (!user) {
        return message.reply(v2Reply(errorContainer("User Not Found", "This user does not exist in the database.")));
    }

    const param = args.slice(1).join(" ");
    if (!param) {
        return message.reply(v2Reply(errorContainer("Invalid Usage", "Provide an item name or `all`.\nExample: `,removeitem @user all` or `,removeitem @user apple`")));
    }

    // Check for "all" quantity flag or "all" item name
    // Complex parsing: Item names can have spaces.
    // Heuristic: Check if last arg is a number or 'all' -> Quantity. Rest is name.
    // BUT the user specifically asked for "all parameter".

    const parts = args.slice(1);
    let quantityStr = parts[parts.length - 1].toLowerCase();
    let itemName = parts.join(" ");
    let quantity = 1;
    let removeAllOfItem = false;
    let removeEverything = false;

    if (itemName.toLowerCase() === "all") {
        removeEverything = true;
    } else {
        // Check if last part is number or 'all'
        if (quantityStr === "all") {
            removeAllOfItem = true;
            itemName = parts.slice(0, -1).join(" ");
        } else if (!isNaN(Number(quantityStr))) {
            quantity = parseInt(quantityStr);
            itemName = parts.slice(0, -1).join(" ");
        }

        // If itemName becomes empty, it means we probably had "apple" and tried to parse "apple" as qty? No.
        // If input was "apple", parts=["apple"], qtyStr="apple". isNaN("apple") is true. itemName="apple". qty=1.
        // If input was "apple 5", parts=["apple", "5"], qtyStr="5". isNaN false. qty=5. itemName="apple".
    }

    if (removeEverything) {
        const count = await prisma.inventory.deleteMany({
            where: { userId: user.discordId }
        });

        await logToChannel(message.client, {
            guild: message.guild!,
            type: "ADMIN",
            title: "Inventory Wiped",
            description: `**Admin:** ${message.author.tag}\n**Target:** ${user.username}\n**Action:** Removed ALL items.`,
            color: 0xFF0000
        });

        return message.reply(v2Reply(successContainer("Inventory Cleared", `Removed all items from ${user.username}'s inventory.`)));
    }

    // Removing specific item
    // Inventory items are stored by name in `itemId` (usually mapped) but currently many systems us unique ID referring to ShopItem.
    // However, existing inventory logic usually relates to `itemId` which matches `ShopItem.id` or `name`.
    // Let's check user's inventory to match name.

    // If the input is item ID or Name.
    // We query inventory for the user.
    const invItems = user.inventory.filter(i =>
        (i.shopItem.name.toLowerCase() === itemName.toLowerCase()) ||
        (i.shopItem.name.toLowerCase().includes(itemName.toLowerCase())) ||
        (i.shopItem.id.toLowerCase() === itemName.toLowerCase())
    );

    if (invItems.length === 0) {
        return message.reply(v2Reply(errorContainer("Item Not Found", `User does not have any item matching "${itemName}".`)));
    }

    // If multiple matches, ask for specific? Or just take first. taking first strict match, else fuzzy.
    const exactMatch = invItems.find(i => i.shopItem.name.toLowerCase() === itemName.toLowerCase());
    const targetInvItem = exactMatch || invItems[0];

    if (removeAllOfItem) {
        quantity = targetInvItem.amount;
    }

    if (targetInvItem.amount < quantity) {
        return message.reply(v2Reply(errorContainer("Insufficient Quantity", `User only has ${targetInvItem.amount}x ${targetInvItem.shopItem.name}.`)));
    }

    let newAmount = targetInvItem.amount - quantity;

    if (newAmount <= 0) {
        await prisma.inventory.delete({ where: { id: targetInvItem.id } });
    } else {
        await prisma.inventory.update({
            where: { id: targetInvItem.id },
            data: { amount: newAmount }
        });
    }

    let targetUsername = user.username;
    try {
        const discordUser = targetUser || await message.client.users.fetch(targetId);
        if (discordUser) targetUsername = discordUser.username;
    } catch (e) { /* ignore fetch error, fallback to DB name */ }

    await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "Item Removed",
        description: `**Admin:** ${message.author.tag}\n**Target:** ${targetUsername}\n**Item:** ${targetInvItem.shopItem.name}\n**Amount:** ${quantity}`,
        color: 0xFFA500
    });

    return message.reply(v2Reply(successContainer("Item Removed", `Removed ${quantity}x ${targetInvItem.shopItem.name} from ${targetUsername}.`)));
}
