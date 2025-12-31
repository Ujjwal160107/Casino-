"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUniStore = handleUniStore;
exports.handleBuyUniItem = handleBuyUniItem;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
const format_1 = require("../../utils/format");
async function checkAndSeedUniItems(guildId) {
    // ... (logic remains same)
    const ITEMS = [
        {
            name: "Standard Textbook",
            price: 500,
            description: "A comprehensive guide. boosts study gains (+0.2 Int/study). Lasts 10 uses.",
            itemType: "UNI_BOOK",
            effects: [{ type: "STUDY_BOOST", value: 0.2 }],
            consumable: true,
            maxUses: 10,
            stock: -1
        },
        {
            name: "Advanced Guide",
            price: 1500,
            description: "Deep dive into complex topics. Greatly boosts study gains (+0.5 Int/study). Lasts 1 semester.",
            itemType: "UNI_BOOK",
            effects: [{ type: "STUDY_BOOST", value: 0.5 }],
            consumable: true,
            maxUses: 20,
            stock: -1
        },
        {
            name: "Energy Drink",
            price: 150,
            description: "Caffeine rush! Instantly reduces stress by 15.",
            itemType: "CONSUMABLE",
            effects: [{ type: "STRESS_REDUCE", value: 15 }],
            consumable: true,
            maxUses: 1,
            stock: -1
        },
        {
            name: "Cheat Sheet",
            price: 2000,
            description: "Risky but effective. Increases effective Intelligence for the next Exam by 1.0. (5% chance of expulsion)",
            itemType: "CONSUMABLE",
            effects: [{ type: "EXAM_BOOST", value: 1.0 }],
            consumable: true,
            maxUses: 1,
            stock: -1
        }
    ];
    for (const item of ITEMS) {
        const existing = await prisma_1.default.shopItem.findFirst({
            where: { guildId, name: item.name }
        });
        if (!existing) {
            await prisma_1.default.shopItem.create({
                data: {
                    guildId,
                    name: item.name,
                    price: item.price,
                    description: item.description,
                    itemType: item.itemType,
                    effects: item.effects,
                    consumable: item.consumable,
                    maxUses: item.maxUses,
                    stock: item.stock
                }
            });
        }
    }
}
async function handleUniStore(message) {
    if (!message.guild)
        return;
    const guildId = message.guild.id;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const prefix = config.prefix;
    await checkAndSeedUniItems(guildId);
    const items = await prisma_1.default.shopItem.findMany({
        where: {
            guildId,
            itemType: { in: ["UNI_BOOK", "CONSUMABLE"] }, // Fetch our types
            name: { in: ["Standard Textbook", "Advanced Guide", "Energy Drink", "Cheat Sheet"] } // Narrow down to ensure we don't grab random consumables
        }
    });
    const BANNER_PATH = "C:/Users/ujjwa/.gemini/antigravity/brain/d08913d6-3c78-40f8-b60e-374730098e01/uploaded_image_1767081757339.jpg";
    const banner = new discord_js_1.AttachmentBuilder(BANNER_PATH, { name: 'uni_store.jpg' });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`📚 University Bookstore`)
        .setDescription(`Welcome, student! Here you can buy supplies to help with your degree.\nYour Balance: **${(0, format_1.fmtCurrency)((await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: message.author.id, guildId } }, include: { wallet: true } }))?.wallet?.balance || 0, config.currencyEmoji)}**`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.MoneyBag) || message.guild.iconURL() || "")
        .setImage("attachment://uni_store.jpg");
    const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Graduate) || (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think); // Use relevant emote
    if (thumbUrl)
        embed.setThumbnail(thumbUrl);
    items.forEach(item => {
        embed.addFields({
            name: `${item.name} -- ${(0, format_1.fmtCurrency)(item.price, config.currencyEmoji)}`,
            value: `*${item.description}*\nUse: \`${prefix}buy ${item.name}\``,
            inline: false
        });
    });
    embed.setFooter({ text: "Use these items to pass your exams!" });
    message.reply({ embeds: [embed], files: [banner] });
}
async function handleBuyUniItem(message, args) {
    // Wrapper for standard buy, or could implement custom logic if needed.
    // For now, let's just use the standard shop buy logic but filtered.
    // Actually, users can just use !buy <name>. We can add a helper here if we want a specific button flow.
    // But for now, just showing the list is enough, they can use the standard buy command.
    return;
}
//# sourceMappingURL=uniStore.js.map