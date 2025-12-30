"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEquip = handleEquip;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const guildConfigService_1 = require("../../services/guildConfigService");
const gameUtils_1 = require("../../utils/gameUtils");
const gameConfig_1 = require("../../config/gameConfig");
const branding_1 = require("../../config/branding");
async function handleEquip(message, args) {
    if (!message.guild || !message.member)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const itemName = args.join(" ");
    if (!itemName) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}equip <item name>\``)] });
    }
    const guildId = message.guild.id;
    const user = message.author;
    // 1. Get User
    const userData = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: user.id, guildId } }
    });
    if (!userData)
        return message.reply("User not found.");
    // 2. Find Item in Inventory
    const shopItem = await prisma_1.default.shopItem.findFirst({
        where: { guildId, name: { equals: itemName, mode: "insensitive" } }
    });
    if (!shopItem)
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(user, "Item Not Found", "That item does not exist via shop.")] });
    const invItem = await prisma_1.default.inventory.findUnique({
        where: { userId_shopItemId: { userId: userData.id, shopItemId: shopItem.id } }
    });
    if (!invItem || invItem.amount < 1) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(user, "Missing Item", `You do not own **${shopItem.name}**.`)] });
    }
    // 3. Determine Slot
    const slot = (0, gameUtils_1.getEquipmentSlot)(shopItem.name);
    if (!slot) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(user, "Not Equippable", "This item cannot be equipped to a chicken.\nOnly weapons (spurs, swords), armor (shields, helmets), and accessories (gloves, boots) can be equipped.")]
        });
    }
    // 4. Get Chicken
    const chickenItem = await prisma_1.default.shopItem.findFirst({ where: { name: { equals: "Chicken", mode: "insensitive" }, guildId } });
    if (!chickenItem)
        return message.reply("Chicken not configured.");
    const chickenInv = await prisma_1.default.inventory.findUnique({
        where: { userId_shopItemId: { userId: userData.id, shopItemId: chickenItem.id } }
    });
    if (!chickenInv || chickenInv.amount < 1) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(user, "No Chicken", "You need a chicken to equip items!")] });
    }
    // 5. Equip Logic
    const meta = chickenInv.meta || {};
    // Initialize equipment object if missing
    if (!meta.equipment)
        meta.equipment = {};
    // Get old item in this slot (if any)
    const oldItem = meta.equipment[slot] ? meta.equipment[slot].name : "None";
    // Set new item
    meta.equipment[slot] = {
        id: shopItem.id,
        name: shopItem.name
    };
    // Remove legacy fields if they exist to avoid confusion
    if (meta.equippedItem)
        delete meta.equippedItem;
    if (meta.equippedItemName)
        delete meta.equippedItemName;
    await prisma_1.default.inventory.update({
        where: { id: chickenInv.id },
        data: { meta }
    });
    const EMOJI_CHECK = gameConfig_1.GameConfig.Emojis.Tick || branding_1.Mascot.Emotes.Accept;
    const slotName = slot.charAt(0).toUpperCase() + slot.slice(1);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(`${EMOJI_CHECK} Equipped ${shopItem.name}`)
        .setDescription(`**${shopItem.name}** has been equipped to the **${slotName}** slot!`)
        .addFields({ name: "Slot", value: slotName, inline: true }, { name: "Replaced", value: oldItem, inline: true })
        .setFooter({ text: `Check stats with ${config.prefix}chicken` });
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=equip.js.map