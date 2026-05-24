import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { getEquipmentSlot } from "../../utils/gameUtils";
import { GameConfig, EquipmentSlot } from "../../config/gameConfig";
import { Mascot } from "../../config/branding";

export async function handleEquip(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;
    const config = await getGuildConfig(message.guild.id);
    const itemName = args.join(" ");

    if (!itemName) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}equip <item name>\``)] });
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
        where: { guildId, name: { equals: itemName, mode: "insensitive" } }
    });

    if (!shopItem) return message.reply({ embeds: [errorEmbed(user, "Item Not Found", "That item does not exist via shop.")] });

    const invItem = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: userData.discordId, shopItemId: shopItem.id } }
    });

    if (!invItem || invItem.amount < 1) {
        return message.reply({ embeds: [errorEmbed(user, "Missing Item", `You do not own **${shopItem.name}**.`)] });
    }

    // 3. Determine Slot
    const slot = getEquipmentSlot(shopItem.name);
    if (!slot) {
        return message.reply({
            embeds: [errorEmbed(user, "Not Equippable", "This item cannot be equipped to a chicken.\nOnly weapons (spurs, swords), armor (shields, helmets), and accessories (gloves, boots) can be equipped.")]
        });
    }

    // 4. Get Chicken
    const chickenItem = await prisma.shopItem.findFirst({ where: { name: { equals: "Chicken", mode: "insensitive" }, guildId } });
    if (!chickenItem) return message.reply("Chicken not configured.");

    const chickenInv = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: userData.discordId, shopItemId: chickenItem.id } }
    });

    if (!chickenInv || chickenInv.amount < 1) {
        return message.reply({ embeds: [errorEmbed(user, "No Chicken", "You need a chicken to equip items!")] });
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

    const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(`${EMOJI_CHECK} Equipped ${shopItem.name}`)
        .setDescription(`**${shopItem.name}** has been equipped to the **${slotName}** slot!`)
        .addFields(
            { name: "Slot", value: slotName, inline: true },
            { name: "Replaced", value: oldItem, inline: true }
        )
        .setFooter({ text: `Check stats with ${config.prefix}chicken` });

    return message.reply({ embeds: [embed] });
}
