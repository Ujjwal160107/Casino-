import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { buyItem } from "../../services/shopService";
import { errorEmbed, successEmbed } from "../../utils/embed";

async function checkAndSeedUniItems(guildId: string) {
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
        const existing = await prisma.shopItem.findFirst({
            where: { guildId, name: item.name }
        });

        if (!existing) {
            await prisma.shopItem.create({
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

export async function handleUniStore(message: Message) {
    if (!message.guild) return;
    const guildId = message.guild.id;
    const config = await getGuildConfig(guildId);
    const prefix = config.prefix;

    await checkAndSeedUniItems(guildId);

    const items = await prisma.shopItem.findMany({
        where: {
            guildId,
            itemType: { in: ["UNI_BOOK", "CONSUMABLE"] }, // Fetch our types
            name: { in: ["Standard Textbook", "Advanced Guide", "Energy Drink", "Cheat Sheet"] } // Narrow down to ensure we don't grab random consumables
        }
    });

    const BANNER_PATH = "C:/Users/ujjwa/.gemini/antigravity/brain/d08913d6-3c78-40f8-b60e-374730098e01/uploaded_image_1767081757339.jpg";
    const banner = new AttachmentBuilder(BANNER_PATH, { name: 'uni_store.jpg' });

    const embed = new EmbedBuilder()
        .setTitle(`📚 University Bookstore`)
        .setDescription(`Welcome, student! Here you can buy supplies to help with your degree.\nYour Balance: **${fmtCurrency((await prisma.user.findUnique({ where: { discordId_guildId: { discordId: message.author.id, guildId } }, include: { wallet: true } }))?.wallet?.balance || 0, config.currencyEmoji)}**`)
        .setColor(Mascot.Colors.Base as any)
        .setThumbnail(getEmoteUrl(Mascot.Emotes.MoneyBag) || message.guild.iconURL() || "")
        .setImage("attachment://uni_store.jpg");

    const thumbUrl = getEmoteUrl(Mascot.Emotes.Graduate) || getEmoteUrl(Mascot.Emotes.Think); // Use relevant emote
    if (thumbUrl) embed.setThumbnail(thumbUrl);


    items.forEach(item => {
        embed.addFields({
            name: `${item.name} -- ${fmtCurrency(item.price, config.currencyEmoji)}`,
            value: `*${item.description}*\nUse: \`${prefix}buy ${item.name}\``,
            inline: false
        });
    });

    embed.setFooter({ text: "Use these items to pass your exams!" });

    message.reply({ embeds: [embed], files: [banner] });
}

export async function handleBuyUniItem(message: Message, args: string[]) {
    // Wrapper for standard buy, or could implement custom logic if needed.
    // For now, let's just use the standard shop buy logic but filtered.
    // Actually, users can just use !buy <name>. We can add a helper here if we want a specific button flow.
    // But for now, just showing the list is enough, they can use the standard buy command.
    return;
}
