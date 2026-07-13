import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { getEquipmentSlot } from "../../utils/gameUtils";
import { GameConfig, EquipmentSlot } from "../../config/gameConfig";
import { Mascot } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";
import { globalCatalogGuildFilter } from "../../utils/globalCatalog";

export async function handleEquip(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;
    const prefix = await getGuildPrefix(message.guild.id);
    const itemName = args.join(" ");

    if (!itemName) {
        return message.reply(v2Reply(errorContainer("Invalid Usage", `Usage: \`${prefix}equip <item name>\``)));
    }

    const guildId = message.guild.id;
    const user = message.author;

    // 1. Get User
    const userData = await prisma.user.findUnique({
        where: { discordId: user.id }
    });
    if (!userData) return message.reply("User not found.");

    // 2. Find Item in Inventory
    const shopItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
            name: { equals: itemName, mode: "insensitive" },
        }),
    });

    if (!shopItem) return message.reply(v2Reply(errorContainer("Item Not Found", "That item does not exist via shop.")));

    const invItem = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: userData.discordId, shopItemId: shopItem.id } }
    });

    if (!invItem || invItem.amount < 1) {
        return message.reply(v2Reply(errorContainer("Missing Item", `You do not own **${shopItem.name}**.`)));
    }

    // 3. Determine Slot
    const slot = getEquipmentSlot(shopItem.name);
    if (!slot) {
        return message.reply(
            v2Reply(
                errorContainer(
                    "Not Equippable",
                    "This item cannot be equipped to a chicken.\nOnly weapons (spurs, swords), armor (shields, helmets), and accessories (gloves, boots) can be equipped.",
                ),
            ),
        );
    }

    // 4. Get Chicken
    const chickenItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
            name: { equals: "Chicken", mode: "insensitive" },
        }),
    });
    if (!chickenItem) return message.reply("Chicken not configured.");

    const chickenInv = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: userData.discordId, shopItemId: chickenItem.id } }
    });

    if (!chickenInv || chickenInv.amount < 1) {
        return message.reply(v2Reply(errorContainer("No Chicken", "You need a chicken to equip items!")));
    }

    // 5. Equip Logic
    const meta = (chickenInv.meta as any) || {};

    // Initialize equipment object if missing
    if (!meta.equipment) meta.equipment = {};

    // Get old item in this slot (if any)
    const oldItem = meta.equipment[slot] ? meta.equipment[slot].name : "None";

    // Set new item
    meta.equipment[slot] = {
        id: shopItem.id,
        name: shopItem.name
    };

    // Remove legacy fields if they exist to avoid confusion
    if (meta.equippedItem) delete meta.equippedItem;
    if (meta.equippedItemName) delete meta.equippedItemName;

    await prisma.inventory.update({
        where: { id: chickenInv.id },
        data: { meta }
    });

    const EMOJI_CHECK = GameConfig.Emojis.Tick || Mascot.Emotes.Accept;
    const slotName = slot.charAt(0).toUpperCase() + slot.slice(1);

    return message.reply(
        v2Reply(
            successContainer(
                `${EMOJI_CHECK} Equipped ${shopItem.name}`,
                `**${shopItem.name}** has been equipped to the **${slotName}** slot!\n\n**Slot:** ${slotName}\n**Replaced:** ${oldItem}`,
            ),
        ),
    );
}
