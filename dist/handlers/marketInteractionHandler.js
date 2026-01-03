"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMarketInteraction = handleMarketInteraction;
const discord_js_1 = require("discord.js");
const marketService_1 = require("../services/marketService");
const guildConfigService_1 = require("../services/guildConfigService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const discordLogger_1 = require("../utils/discordLogger");
const format_1 = require("../utils/format");
const branding_1 = require("../config/branding");
async function handleMarketInteraction(interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
    else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    }
    else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
    }
}
async function handleButton(interaction) {
    const { customId, user, guildId } = interaction;
    if (!guildId)
        return;
    try {
        if (customId === "market_home") {
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            const { total } = await (0, marketService_1.getMarketListings)(guildId, 1, 1);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("🏴‍☠️ Black Market")
                .setDescription(`Welcome to the underground.\n\n**Market Tax:** ${config.marketTax}%\n**Active Listings:** ${total}`)
                .setColor("#36393F")
                .setImage("attachment://black_market.png");
            const row = new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.ButtonBuilder().setCustomId("market_browse_1").setLabel("Browse Market").setStyle(discord_js_1.ButtonStyle.Primary).setEmoji("🛒"), new discord_js_1.ButtonBuilder().setCustomId("market_sell_flow").setLabel("Sell Item").setStyle(discord_js_1.ButtonStyle.Success).setEmoji("➕"), new discord_js_1.ButtonBuilder().setCustomId("market_sell_prop_flow").setLabel("Sell Property").setStyle(discord_js_1.ButtonStyle.Success).setEmoji("🏠"), new discord_js_1.ButtonBuilder().setCustomId("market_buy_flow").setLabel("Buy by ID").setStyle(discord_js_1.ButtonStyle.Secondary).setEmoji("🔍"), new discord_js_1.ButtonBuilder().setCustomId("market_mine").setLabel("My Listings").setStyle(discord_js_1.ButtonStyle.Danger).setEmoji("📦"));
            await interaction.update({ embeds: [embed], components: [row], files: ["./assets/black_market.png"] });
        }
        else if (customId.startsWith("market_browse_")) {
            const page = parseInt(customId.split("_")[2]);
            const { listings, total, totalPages } = await (0, marketService_1.getMarketListings)(guildId, page);
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`🛒 Market Listings (Page ${page}/${totalPages || 1})`)
                .setColor("#2F3136");
            if (listings.length === 0) {
                embed.setDescription("No items for sale right now.");
            }
            else {
                const desc = listings.map(l => {
                    if (l.shopItem) {
                        return `**ID:** \`${l.id}\`\n**Item:** ${l.shopItem.name} (x${l.amount})\n**Price:** ${(0, format_1.fmtCurrency)(l.totalPrice, config.currencyEmoji)}\n**Seller:** <@${l.seller.discordId}>`;
                    }
                    else if (l.property) {
                        return `**ID:** \`${l.id}\`\n**Property:** 🏠 ${l.property.name}\n**Price:** ${(0, format_1.fmtCurrency)(l.totalPrice, config.currencyEmoji)}\n**Seller:** <@${l.seller.discordId}>`;
                    }
                    return `Unknown Listing`;
                }).join("\n\n");
                embed.setDescription(desc);
            }
            const row = new discord_js_1.ActionRowBuilder();
            if (page > 1) {
                row.addComponents(new discord_js_1.ButtonBuilder().setCustomId(`market_browse_${page - 1}`).setLabel("Prev").setStyle(discord_js_1.ButtonStyle.Secondary));
            }
            row.addComponents(new discord_js_1.ButtonBuilder().setCustomId("market_home").setLabel("Home").setStyle(discord_js_1.ButtonStyle.Primary));
            if (page < totalPages) {
                row.addComponents(new discord_js_1.ButtonBuilder().setCustomId(`market_browse_${page + 1}`).setLabel("Next").setStyle(discord_js_1.ButtonStyle.Secondary));
            }
            await interaction.update({ embeds: [embed], components: [row] });
        }
        else if (customId === "market_sell_flow") {
            const userDb = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId } } });
            if (!userDb)
                return;
            const inventory = await prisma_1.default.inventory.findMany({
                where: { userId: userDb.id },
                include: { shopItem: true },
                take: 25
            });
            if (inventory.length === 0) {
                await interaction.reply({ content: "You have no items to sell.", ephemeral: true });
                return;
            }
            const row = new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.StringSelectMenuBuilder()
                .setCustomId("market_sell_select")
                .setPlaceholder("Select an item to sell")
                .addOptions(inventory.map(inv => new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel(`${inv.shopItem.name} (x${inv.amount})`)
                .setValue(inv.shopItem.id)
                .setDescription(`In Stock: ${inv.amount}`))));
            await interaction.reply({ content: "Select an item from your inventory to list:", components: [row], ephemeral: true });
        }
        else if (customId === "market_sell_prop_flow") {
            const userDb = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId } } });
            if (!userDb)
                return;
            const ownedProps = await prisma_1.default.ownedProperty.findMany({
                where: { userId: userDb.id },
                include: { property: true },
                take: 25
            });
            if (ownedProps.length === 0) {
                await interaction.reply({ content: "You have no properties to sell.", ephemeral: true });
                return;
            }
            const row = new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.StringSelectMenuBuilder()
                .setCustomId("market_sell_prop_select")
                .setPlaceholder("Select a property to sell")
                .addOptions(ownedProps.map(op => new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel(`${op.property.name}`)
                .setValue(op.property.id)
                .setDescription(`Valued at ${op.property.price}`))));
            await interaction.reply({ content: "Select a property to list (Note: It will be removed from your portfolio until cancelled/sold):", components: [row], ephemeral: true });
        }
        else if (customId === "market_buy_flow") {
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("market_buy_modal")
                .setTitle("Buy Item");
            const idInput = new discord_js_1.TextInputBuilder()
                .setCustomId("market_listing_id")
                .setLabel("Listing ID")
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setPlaceholder("Paste the ID from the browse list")
                .setRequired(true);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(idInput));
            await interaction.showModal(modal);
        }
        else if (customId === "market_mine") {
            const myListings = await (0, marketService_1.getUserListings)(user.id, guildId);
            const embed = new discord_js_1.EmbedBuilder().setTitle("📦 Your Active Listings").setColor("#FFAA00");
            if (myListings.length === 0) {
                embed.setDescription("You have no active listings.");
            }
            else {
                const desc = myListings.map(l => {
                    const name = l.shopItem ? l.shopItem.name : (l.property ? `🏠 ${l.property.name}` : 'Unknown');
                    return `**ID:** \`${l.id}\` | **${name} (x${l.amount})** for ${l.totalPrice}`;
                }).join("\n");
                embed.setDescription(desc);
            }
            const row = new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.ButtonBuilder().setCustomId("market_cancel_flow").setLabel("Cancel Listing").setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId("market_home").setLabel("Back").setStyle(discord_js_1.ButtonStyle.Secondary));
            await interaction.update({ embeds: [embed], components: [row] });
        }
        else if (customId === "market_cancel_flow") {
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("market_cancel_modal")
                .setTitle("Cancel Listing");
            const idInput = new discord_js_1.TextInputBuilder()
                .setCustomId("market_listing_id")
                .setLabel("Listing ID")
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(idInput));
            await interaction.showModal(modal);
        }
    }
    catch (err) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `${branding_1.Mascot.Emotes.Fail} Error: ${err.message}`, ephemeral: true });
        }
        else {
            await interaction.followUp({ content: `${branding_1.Mascot.Emotes.Fail} Error: ${err.message}`, ephemeral: true });
        }
    }
}
async function handleSelectMenu(interaction) {
    if (interaction.customId === "market_sell_select") {
        const shopItemId = interaction.values[0];
        const modal = new discord_js_1.ModalBuilder()
            .setCustomId(`market_sell_modal_${shopItemId}`)
            .setTitle("List Item for Sale");
        const qtyInput = new discord_js_1.TextInputBuilder()
            .setCustomId("sell_amount")
            .setLabel("Quantity")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setPlaceholder("1")
            .setRequired(true);
        const priceInput = new discord_js_1.TextInputBuilder()
            .setCustomId("sell_price")
            .setLabel("Total Price")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setPlaceholder("e.g. 500")
            .setRequired(true);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(qtyInput), new discord_js_1.ActionRowBuilder().addComponents(priceInput));
        await interaction.showModal(modal);
    }
    else if (interaction.customId === "market_sell_prop_select") {
        const propId = interaction.values[0];
        const modal = new discord_js_1.ModalBuilder()
            .setCustomId(`market_sell_prop_modal_${propId}`)
            .setTitle("List Property for Sale");
        const priceInput = new discord_js_1.TextInputBuilder()
            .setCustomId("sell_price")
            .setLabel("Total Price")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setPlaceholder("e.g. 50000")
            .setRequired(true);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(priceInput));
        await interaction.showModal(modal);
    }
}
async function handleModal(interaction) {
    const { customId, fields, user, guildId } = interaction;
    if (!guildId)
        return;
    try {
        if (customId.startsWith("market_sell_modal_")) {
            const shopItemId = customId.split("_")[3];
            const amount = (0, format_1.parseSmartAmount)(fields.getTextInputValue("sell_amount"));
            const price = (0, format_1.parseSmartAmount)(fields.getTextInputValue("sell_price"));
            if (isNaN(amount) || isNaN(price))
                throw new Error("Invalid numbers.");
            await (0, marketService_1.listItemOnMarket)(user.id, guildId, shopItemId, amount, price);
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            await (0, discordLogger_1.logToChannel)(interaction.client, {
                guild: interaction.guild,
                type: "MARKET",
                title: "Item Listed",
                description: `**Seller:** ${user.tag}\n**Item:** ${shopItemId} (x${amount})\n**Price:** ${(0, format_1.fmtCurrency)(price, config.currencyEmoji)}`,
                color: 0xFFA500
            });
            await interaction.reply({ content: `${branding_1.Mascot.Emotes.Accept} Listed item for sale!`, ephemeral: true });
        }
        else if (customId.startsWith("market_sell_prop_modal_")) {
            const propId = customId.split("_")[4];
            const price = (0, format_1.parseSmartAmount)(fields.getTextInputValue("sell_price"));
            if (isNaN(price))
                throw new Error("Invalid price.");
            await (0, marketService_1.listPropertyOnMarket)(user.id, guildId, propId, price);
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            await (0, discordLogger_1.logToChannel)(interaction.client, {
                guild: interaction.guild,
                type: "MARKET",
                title: "Property Listed",
                description: `**Seller:** ${user.tag}\n**Property:** ${propId}\n**Price:** ${(0, format_1.fmtCurrency)(price, config.currencyEmoji)}`,
                color: 0xFFA500
            });
            await interaction.reply({ content: `${branding_1.Mascot.Emotes.Accept} Listed property for sale!`, ephemeral: true });
        }
        else if (customId === "market_buy_modal") {
            const listingId = fields.getTextInputValue("market_listing_id").trim();
            const res = await (0, marketService_1.buyItemFromMarket)(user.id, listingId);
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            await (0, discordLogger_1.logToChannel)(interaction.client, {
                guild: interaction.guild,
                type: "MARKET",
                title: "Item Bought",
                description: `**Buyer:** ${user.tag}\n**Listing ID:** \`${listingId}\`\n**Item:** ${res.item} (x${res.amount})\n**Price:** ${(0, format_1.fmtCurrency)(Math.abs(res.price), config.currencyEmoji)}`,
                color: 0x00FF00
            });
            await interaction.reply({ content: `${branding_1.Mascot.Emotes.Accept} Successfully bought **${res.amount}x ${res.item}** for **${res.price}**! (Tax: ${res.tax})`, ephemeral: true });
        }
        else if (customId === "market_cancel_modal") {
            const listingId = fields.getTextInputValue("market_listing_id").trim();
            await (0, marketService_1.cancelListing)(user.id, listingId);
            await (0, discordLogger_1.logToChannel)(interaction.client, {
                guild: interaction.guild,
                type: "MARKET",
                title: "Listing Cancelled",
                description: `**Seller:** ${user.tag}\n**Listing ID:** \`${listingId}\``,
                color: 0xFF0000
            });
            await interaction.reply({ content: `${branding_1.Mascot.Emotes.Accept} Listing cancelled and items returned.`, ephemeral: true });
        }
    }
    catch (err) {
        await interaction.reply({ content: `${branding_1.Mascot.Emotes.Fail} Error: ${err.message}`, ephemeral: true });
    }
}
//# sourceMappingURL=marketInteractionHandler.js.map