import { Message, EmbedBuilder } from "discord.js";
import path from "path";
import prisma from "../../utils/prisma";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

// Predefined Job Store Items
export const JOB_ITEMS = [
    // Consumables
    {
        name: "Energy Drink",
        description: "Reduces Job Stress by 10 instantly.",
        price: 200,
        effect: { type: "STRESS_REDUCTION", value: 10 },
        consumable: true,
        type: "JOB_CONSUMABLE"
    },
    {
        name: "Premium Coffee",
        description: "Reduces Job Stress by 25 instantly.",
        price: 450,
        effect: { type: "STRESS_REDUCTION", value: 25 },
        consumable: true,
        type: "JOB_CONSUMABLE"
    },
    {
        name: "Spa Voucher",
        description: "Massive stress relief (Reduces 50 Stress).",
        price: 1200,
        effect: { type: "STRESS_REDUCTION", value: 50 },
        consumable: true,
        type: "JOB_CONSUMABLE"
    },

    // Gear (Temporary Buffs - 24 Hours)
    {
        name: "Office Supplies",
        description: "Standard stationery. Increases Job Pay by 2% for 24 hours.",
        price: 800,
        effect: { type: "PAY_MULTIPLIER", value: 0.02, duration: 86400 },
        consumable: true,
        type: "JOB_GEAR"
    },
    {
        name: "Business Suit",
        description: "Professional attire. Increases Job Pay by 10% for 24 hours.",
        price: 5000,
        effect: { type: "PAY_MULTIPLIER", value: 0.1, duration: 86400 },
        consumable: true,
        type: "JOB_GEAR"
    },
    {
        name: "Luxury Watch",
        description: "Impression matters. Increases Job Pay by 15% for 24 hours.",
        price: 15000,
        effect: { type: "PAY_MULTIPLIER", value: 0.15, duration: 86400 },
        consumable: true,
        type: "JOB_GEAR"
    },
    {
        name: "Laptop",
        description: "Reduces shift cooldown by 1 minute for 24 hours.",
        price: 10000,
        effect: { type: "COOLDOWN_REDUCTION", value: 60, duration: 86400 },
        consumable: true,
        type: "JOB_GEAR"
    },
    {
        name: "Company CarKeys",
        description: "Reduces shift cooldown by 5 minutes for 24 hours.",
        price: 50000,
        effect: { type: "COOLDOWN_REDUCTION", value: 300, duration: 86400 },
        consumable: true,
        type: "JOB_GEAR"
    }
];

export async function handleJobStore(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;
    const config = await getGuildConfig(message.guild.id);

    // Initialize Items in DB if missing (One-time sync logic per command run is inefficient but safe for now)
    // Ideally this should be seeded, but we'll do "check and create" here for simplicity.
    for (const item of JOB_ITEMS) {
        const existing = await prisma.shopItem.findFirst({
            where: { guildId: message.guild.id, name: item.name }
        });
        if (!existing) {
            await prisma.shopItem.create({
                data: {
                    guildId: message.guild.id,
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    itemType: item.type,
                    consumable: item.consumable,
                    effects: [item.effect],
                    category: "JOBS"
                }
            });
        }
    }

    // --- BUY LOGIC ---
    if (args.length > 0 && (args[0].toLowerCase() === "buy")) {
        const query = args.slice(1).join(" ");
        if (!query) return message.reply("What do you want to buy?");

        const item = await prisma.shopItem.findFirst({
            where: {
                guildId: message.guild.id,
                name: { contains: query, mode: "insensitive" },
                itemType: { in: ["JOB_CONSUMABLE", "JOB_GEAR"] }
            }
        });

        if (!item || item.name.toLowerCase() !== query.toLowerCase() && !item.name.toLowerCase().includes(query.toLowerCase())) {
            // Basic strict check if multiple matches? Let's just trust findFirst with contains for now.
            if (!item) return message.reply("Item not found in the Job Store.");
        }

        const user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
            include: { wallet: true, inventory: true }
        });

        if (!user || user.wallet!.balance < item.price) {
            return message.reply(`${Mascot.Emotes.Fail} You cannot afford **${item.name}** (${fmtCurrency(item.price, config.currencyEmoji)}).`);
        }

        // Check if unique/passive owned
        if (!item.consumable) {
            const owned = user.inventory.find(inv => inv.shopItemId === item.id);
            if (owned) return message.reply(`${Mascot.Emotes.Think} You already own a **${item.name}**.`);
        }

        await prisma.$transaction([
            prisma.wallet.update({
                where: { id: user.wallet!.id },
                data: { balance: { decrement: item.price } }
            }),
            prisma.inventory.upsert({
                where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
                create: { userId: user.id, shopItemId: item.id, guildId: message.guild.id, amount: 1 },
                update: { amount: { increment: 1 } }
            })
        ]);

        return message.reply(`${Mascot.Emotes.Success} You bought **${item.name}** for **${fmtCurrency(item.price, config.currencyEmoji)}**!`);
    }

    // --- DISPLAY STORE ---
    const items = await prisma.shopItem.findMany({
        where: {
            guildId: message.guild.id,
            itemType: { in: ["JOB_CONSUMABLE", "JOB_GEAR"] }
        },
        orderBy: { price: "asc" }
    });

    const embed = new EmbedBuilder()
        .setTitle(`💼 Fortuna's Job Supplies`)
        .setDescription(`Welcome to the specialized store for career professionals!\nUse \`${config.prefix}jobstore buy <item>\` to purchase.`)
        .setColor("#F1C40F")
        .setImage("attachment://banner.jpg");

    // Add Banner
    // Add Banner
    const bannerPath = path.join(__dirname, "../../assets/casino_banner.png");

    // Group by category
    const consumables = items.filter(i => i.itemType === "JOB_CONSUMABLE");
    const gears = items.filter(i => i.itemType === "JOB_GEAR");

    if (consumables.length > 0) {
        embed.addFields({
            name: "🥤 Consumables",
            value: consumables.map(i => `**${i.name}** — ${fmtCurrency(i.price, config.currencyEmoji)}\n*${i.description}*`).join("\n\n")
        });
    }

    if (gears.length > 0) {
        embed.addFields({
            name: "⚒️ Gear (Permanent)",
            value: gears.map(i => `**${i.name}** — ${fmtCurrency(i.price, config.currencyEmoji)}\n*${i.description}*`).join("\n\n")
        });
    }

    message.reply({
        embeds: [embed],
        files: [{ attachment: bannerPath, name: "banner.jpg" }]
    });
}
