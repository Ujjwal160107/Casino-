import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, GuildMember, AttachmentBuilder } from "discord.js";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { GameConfig } from "../../config/gameConfig";
import { buyItem, createShopItem, updateShopItem, getShopItemByName, deleteShopItem } from "../../services/shopService";

export async function handleCockStore(message: Message, args: string[]) {
    const subCommand = args[0]?.toLowerCase();

    // Admin commands
    if (subCommand === "setprice") {
        return handleSetPrice(message, args.slice(1));
    }

    if (subCommand === "setstock" || subCommand === "stock") {
        return handleSetStock(message, args.slice(1));
    }

    if (subCommand === "remove" || subCommand === "delete") {
        return handleRemove(message, args.slice(1));
    }

    if (subCommand === "buy") {
        return handleBuy(message, args.slice(1));
    }

    return handleStoreUI(message);
}

// ... (existing code: handleStoreUI, getEmojiId, handleBuy) ...

async function handleSetPrice(message: Message, args: string[]) {
    if (!message.member?.permissions.has("Administrator")) return;

    if (args.length < 2) return message.reply("Usage: `!cockstore setprice <Item Name> <Price>`");

    const price = parseInt(args[args.length - 1]);
    if (isNaN(price)) return message.reply("Invalid price.");

    const name = args.slice(0, args.length - 1).join(" ").replace(/"/g, "");

    const preDef = GameConfig.PredefinedItems.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (!preDef) {
        return message.reply(`Unknown item **${name}**. Valid items:\n${GameConfig.PredefinedItems.map(p => p.name).join(", ")}`);
    }

    const guildId = message.guildId!;
    const existing = await getShopItemByName(guildId, preDef.name);

    if (existing) {
        await updateShopItem(guildId, existing.id, { price });
        return message.reply(`Updated price of **${preDef.name}** to ${price}.`);
    } else {
        await createShopItem(guildId, preDef.name, price, preDef.description, undefined, "EQUIPMENT", undefined, false, "GAMES");
        return message.reply(`Created **${preDef.name}** in shop with price ${price}.`);
    }
}

async function handleSetStock(message: Message, args: string[]) {
    if (!message.member?.permissions.has("Administrator")) return;

    if (args.length < 2) return message.reply("Usage: `!cockstore setstock <Item Name> <Amount>` (Use -1 for infinite)");

    const amount = parseInt(args[args.length - 1]);
    if (isNaN(amount)) return message.reply("Invalid stock amount.");

    const name = args.slice(0, args.length - 1).join(" ").replace(/"/g, "");

    const guildId = message.guildId!;
    const existing = await getShopItemByName(guildId, name);

    if (!existing) {
        return message.reply(`Item **${name}** is not in the shop database. Set a price first using \`!cs setprice\`.`);
    }

    await updateShopItem(guildId, existing.id, { stock: amount });
    return message.reply(`Updated stock of **${existing.name}** to ${amount === -1 ? "Infinite" : amount}.`);
}

async function handleRemove(message: Message, args: string[]) {
    if (!message.member?.permissions.has("Administrator")) return;

    if (args.length < 1) return message.reply("Usage: `!cockstore remove <Item Name>`");

    const name = args.join(" ").replace(/"/g, "");
    const guildId = message.guildId!;

    const existing = await getShopItemByName(guildId, name);
    if (!existing) {
        return message.reply(`Item **${name}** is not in the shop database.`);
    }

    await deleteShopItem(existing.id);
    return message.reply(`Removed **${existing.name}** from the shop.`);
}

async function handleStoreUI(message: Message) {
    const guildId = message.guildId!;
    const config = await getGuildConfig(guildId);
    const currencyEmoji = config.currencyEmoji || "🪙";
    const EMOJI_CHICKEN = GameConfig.Emojis.Chicken;
    const EMOJI_SPEAR = GameConfig.Emojis.MenuSpear;
    const EMOJI_SHIELD = GameConfig.Emojis.MenuShield;
    const EMOJI_BOOTS = GameConfig.Emojis.MenuBoots;

    const file = new AttachmentBuilder("./assets/cock_store.jpg");

    // Helper to get price and availability
    // We fetch prices from DB. If not in DB, use defaultPrice.
    const dbItems = await prisma.shopItem.findMany({ where: { guildId } });

    const getPriceInfo = (preDef: any) => {
        const dbItem = dbItems.find(d => d.name.toLowerCase() === preDef.name.toLowerCase());
        const price = dbItem ? dbItem.price : (preDef.defaultPrice || "N/A");
        const inStock = dbItem ? (dbItem.stock === -1 || dbItem.stock > 0) : true; // Assuming unlisted = virtual stock? No, user said "show all items".
        // If not in DB, user can't buy it unless we auto-create.
        // For UI purposes, we show the default price.
        return { price, inStock, dbId: dbItem?.id };
    };

    const generateEmbed = (category: "weapon" | "armor" | "accessory" | "welcome") => {
        const embed = new EmbedBuilder().setColor("#FFD700").setThumbnail("attachment://cock_store.jpg");

        if (category === "welcome") {
            embed.setTitle(`${EMOJI_CHICKEN} The Cock Store`)
                .setDescription(`Welcome to the Chicken Equipment Store!
Use the menu below to browse different categories.

**Categories:**
${EMOJI_SPEAR} **Spears** (Weapons) - Increase Strength
${EMOJI_SHIELD} **Armor** (Shields) - Increase Defense
${EMOJI_BOOTS} **Boots** (Accessories) - Increase Agility

*Use \`!cs buy <item name>\` to purchase.*`);
        } else {
            const catName = category === "weapon" ? `Spears ${EMOJI_SPEAR}` : category === "armor" ? `Armor ${EMOJI_SHIELD}` : `Boots ${EMOJI_BOOTS}`;
            embed.setTitle(`${EMOJI_CHICKEN} Cock Store: ${catName}`);

            // Filter
            const items = GameConfig.PredefinedItems.filter(p => p.type === category);

            if (items.length === 0) {
                embed.setDescription("No items available in this category.");
            } else {
                const desc = items.map(i => {
                    const info = getPriceInfo(i);
                    return `**${i.name}** — ${info.price} ${currencyEmoji}\n*${i.description}*`;
                }).join("\n\n");
                embed.setDescription(desc);
            }
        }
        embed.setFooter({ text: "Use !cs buy <item name> to purchase!" });
        return embed;
    };

    const menu = new StringSelectMenuBuilder()
        .setCustomId("cs_menu")
        .setPlaceholder("Select a Category")
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Spears (Weapons)").setValue("weapon").setEmoji(getEmojiId(EMOJI_SPEAR)),
            new StringSelectMenuOptionBuilder().setLabel("Armor").setValue("armor").setEmoji(getEmojiId(EMOJI_SHIELD)),
            new StringSelectMenuOptionBuilder().setLabel("Boots (Accessories)").setValue("accessory").setEmoji(getEmojiId(EMOJI_BOOTS)),
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    const reply = await message.reply({ embeds: [generateEmbed("welcome")], components: [row], files: [file] });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

    collector.on("collect", async (i) => {
        if (i.user.id !== message.author.id) return i.reply({ content: "This menu is not for you.", ephemeral: true });

        const selection = i.values[0] as "weapon" | "armor" | "accessory";
        // Re-create attachment for update to ensure it persists
        const updateFile = new AttachmentBuilder("./assets/cock_store.jpg");
        await i.update({ embeds: [generateEmbed(selection)], components: [row], files: [updateFile] });
    });

    collector.on("end", () => {
        reply.edit({ components: [] }).catch(() => { });
    });
}

function getEmojiId(emoji: string) {
    if (!emoji) return "❓"; // Fallback
    const match = emoji.match(/:(\d+)>/);
    return match ? match[1] : emoji; // Return ID if custom, else standard
}

async function handleBuy(message: Message, args: string[]) {
    if (args.length < 1) return message.reply("Usage: `!cockstore buy <item name>`");
    const itemName = args.join(" ");

    // Check availability
    const preDef = GameConfig.PredefinedItems.find(p => p.name.toLowerCase() === itemName.toLowerCase());
    if (!preDef) return message.reply("That item does not exist!");

    try {
        // --- AUTO CREATE LOGIC ---
        // Verify if it exists in DB. If not, create it with default price.
        const existing = await getShopItemByName(message.guildId!, preDef.name);
        if (!existing) {
            if (!preDef.defaultPrice) throw new Error("This item is not priced yet.");
            // Lazy create
            await createShopItem(message.guildId!, preDef.name, preDef.defaultPrice, preDef.description, undefined, "EQUIPMENT", undefined, false, "GAMES");
        }
        // -------------------------

        await buyItem(message.guildId!, message.author.id, preDef.name, message.member!);
        return message.reply(`${Mascot.Emotes.Accept} You successfully bought **${preDef.name}**! Don't forget to \`!equip ${preDef.name}\`!`);
    } catch (e: any) {
        return message.reply({ embeds: [errorEmbed(message.author, "Purchase Failed", e.message || "Unknown error")] });
    }
}


