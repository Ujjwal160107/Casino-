"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInventoryInteraction = handleInventoryInteraction;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../utils/prisma"));
const tradeService_1 = require("../services/tradeService");
const walletService_1 = require("../services/walletService");
const discordLogger_1 = require("../utils/discordLogger");
const guildConfigService_1 = require("../services/guildConfigService");
const format_1 = require("../utils/format");
const branding_1 = require("../config/branding");
const EMOJI_TRADE = "<:trade:1447255517440508108>";
const EMOJI_LIGHTNING = "<a:lightning:1447254938261651630>";
const EMOJI_ACCEPT = branding_1.Mascot.Emotes.Accept;
const EMOJI_DECLINE = branding_1.Mascot.Emotes.Decline;
const EMOJI_BLACKMARKETPT = branding_1.Mascot.Emotes.Accept;
const EMOJI_BLACKMARKET = "<:Market:1447255369435840734>";
async function handleInventoryInteraction(interaction) {
    const { customId, user, guildId } = interaction;
    if (!guildId)
        return;
    if (interaction.isStringSelectMenu() && customId === "inv_select_item") {
        const itemId = interaction.values[0];
        const inventoryItem = await prisma_1.default.inventory.findUnique({ where: { userId_shopItemId: { userId: (await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId } } }))?.id, shopItemId: itemId } }, include: { shopItem: true } });
        if (!inventoryItem) {
            return interaction.reply({ content: "Item not found in your inventory (maybe sold?).", ephemeral: true });
        }
        const item = inventoryItem.shopItem;
        const sellPrice = Math.floor(item.price * 0.5);
        const embed = new discord_js_1.EmbedBuilder().setTitle(`${item.name}`).setDescription(`**Quantity:** ${inventoryItem.amount}\n**Original Price:** ${item.price}\n\n${item.description}`).setColor(discord_js_1.Colors.Blue).addFields({ name: "⚡ Quick Sell Value", value: `${sellPrice}`, inline: true }, { name: "🏴‍☠️ Black Market", value: "List custom price", inline: true });
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`inv_sell_${item.id}`).setLabel("Quick Sell (50%)").setStyle(discord_js_1.ButtonStyle.Danger).setEmoji(EMOJI_LIGHTNING), new discord_js_1.ButtonBuilder().setCustomId(`inv_market_${item.id}`).setLabel("List on Market").setStyle(discord_js_1.ButtonStyle.Secondary).setEmoji(EMOJI_BLACKMARKET), new discord_js_1.ButtonBuilder().setCustomId(`inv_req_trade_${item.id}`).setLabel("Trade / Gift").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(EMOJI_TRADE));
        await interaction.update({ embeds: [embed], components: [row] });
    }
    if (interaction.isButton() && customId.startsWith("inv_sell_")) {
        const itemId = customId.replace("inv_sell_", "");
        try {
            const dbUser = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId } }, include: { wallet: true } });
            if (!dbUser)
                return;
            const inv = await prisma_1.default.inventory.findUnique({ where: { userId_shopItemId: { userId: dbUser.id, shopItemId: itemId } }, include: { shopItem: true } });
            if (!inv || inv.amount < 1)
                return interaction.reply({ content: "You don't have this item.", ephemeral: true });
            const sellPrice = Math.floor(inv.shopItem.price * 0.5);
            await prisma_1.default.$transaction([inv.amount === 1 ? prisma_1.default.inventory.delete({ where: { id: inv.id } }) : prisma_1.default.inventory.update({ where: { id: inv.id }, data: { amount: { decrement: 1 } } }), prisma_1.default.wallet.update({ where: { id: dbUser.wallet.id }, data: { balance: { increment: sellPrice } } })]);
            await interaction.reply({ content: `⚡ **Sold!** exchanged **${inv.shopItem.name}** for **${sellPrice}** coins.`, ephemeral: true });
        }
        catch (e) {
            await interaction.reply({ content: "Error selling item.", ephemeral: true });
        }
    }
    if (interaction.isButton() && customId.startsWith("inv_market_")) {
        const itemId = customId.replace("inv_market_", "");
        const modal = new discord_js_1.ModalBuilder().setCustomId(`market_sell_submission_${itemId}`).setTitle("List Item on Black Market");
        const priceInput = new discord_js_1.TextInputBuilder().setCustomId("price").setLabel("Price per item").setStyle(discord_js_1.TextInputStyle.Short).setPlaceholder("1000").setRequired(true);
        const amountInput = new discord_js_1.TextInputBuilder().setCustomId("amount").setLabel("Quantity to list").setStyle(discord_js_1.TextInputStyle.Short).setValue("1").setRequired(true);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(priceInput), new discord_js_1.ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
    }
    if (interaction.isButton() && customId.startsWith("inv_req_trade_")) {
        const itemId = customId.replace("inv_req_trade_", "");
        const modal = new discord_js_1.ModalBuilder().setCustomId(`inv_trade_modal_${itemId}`).setTitle("Trade Request");
        const userInput = new discord_js_1.TextInputBuilder().setCustomId("target_user").setLabel("User ID (Enable Dev Mode to copy)").setStyle(discord_js_1.TextInputStyle.Short).setPlaceholder("123456789012345678").setRequired(true);
        const priceInput = new discord_js_1.TextInputBuilder().setCustomId("trade_price").setLabel("Price (0 for Gift)").setStyle(discord_js_1.TextInputStyle.Short).setValue("0").setRequired(true);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(userInput), new discord_js_1.ActionRowBuilder().addComponents(priceInput));
        await interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && customId.startsWith("inv_trade_modal_")) {
        const itemId = customId.replace("inv_trade_modal_", "");
        const targetId = interaction.fields.getTextInputValue("target_user");
        const price = parseInt(interaction.fields.getTextInputValue("trade_price"));
        if (isNaN(price) || price < 0)
            return interaction.reply({ content: "Invalid price.", ephemeral: true });
        if (targetId === user.id)
            return interaction.reply({ content: "You cannot trade with yourself.", ephemeral: true });
        const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
        if (!targetUser)
            return interaction.reply({ content: "User not found or invalid ID.", ephemeral: true });
        const dbUser = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId } } });
        const inv = await prisma_1.default.inventory.findUnique({ where: { userId_shopItemId: { userId: dbUser?.id, shopItemId: itemId } }, include: { shopItem: true } });
        if (!inv || inv.amount < 1)
            return interaction.reply({ content: "Item no longer in inventory.", ephemeral: true });
        const embed = new discord_js_1.EmbedBuilder().setTitle("🤝 Trade Request").setDescription(`<@${user.id}> wants to trade **${inv.shopItem.name}** with you!`).addFields({ name: "Price", value: `${price} coins`, inline: true }, { name: "Item", value: inv.shopItem.name, inline: true }).setColor(discord_js_1.Colors.Gold);
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`inv_trade_accept_${user.id}_${itemId}_${price}`).setLabel("Accept").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(EMOJI_ACCEPT), new discord_js_1.ButtonBuilder().setCustomId(`inv_trade_decline_${user.id}`).setLabel("Decline").setStyle(discord_js_1.ButtonStyle.Danger).setEmoji(EMOJI_DECLINE));
        await interaction.reply({ content: `Trade request sent to ${targetUser.username}.`, ephemeral: true });
        if (interaction.channel && "send" in interaction.channel) {
            await interaction.channel.send({ content: `<@${targetId}>`, embeds: [embed], components: [row] });
        }
    }
    if (interaction.isButton() && customId.startsWith("inv_trade_accept_")) {
        const parts = customId.split("_");
        const sellerId = parts[3];
        const itemId = parts[4];
        const price = parseInt(parts[5]);
        if (!interaction.message.content.includes(interaction.user.id)) {
            return interaction.reply({ content: "This trade is not for you!", ephemeral: true });
        }
        try {
            await (0, walletService_1.ensureUserAndWallet)(interaction.user.id, guildId, interaction.user.tag);
            const result = await (0, tradeService_1.executeTrade)(guildId, sellerId, interaction.user.id, itemId, 1, price);
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            await (0, discordLogger_1.logToChannel)(interaction.client, { guild: interaction.guild, type: "TRADE", title: "P2P Trade", description: `**Seller:** <@${sellerId}>\n**Buyer:** <@${interaction.user.id}>\n**Item:** ${result.item} (x1)\n**Price:** ${(0, format_1.fmtCurrency)(result.price, config.currencyEmoji)}`, color: 0x00FFFF });
            await interaction.update({ content: `${branding_1.Mascot.Emotes.Accept} Trade Complete! **${result.item}** transferred to <@${result.buyerId}> for **${result.price}** coins.`, embeds: [], components: [] });
        }
        catch (err) {
            await interaction.reply({ content: `Trade Failed: ${err.message}`, ephemeral: true });
        }
    }
    if (interaction.isButton() && customId.startsWith("inv_trade_decline_")) {
        const sellerId = customId.split("_")[3];
        const isTarget = interaction.message.content.includes(interaction.user.id);
        const isSeller = interaction.user.id === sellerId;
        if (!isTarget && !isSeller) {
            return interaction.reply({ content: "Not your trade.", ephemeral: true });
        }
        await interaction.update({ content: `${branding_1.Mascot.Emotes.Decline} Trade Declined.`, embeds: [], components: [] });
    }
}
//# sourceMappingURL=inventoryInteractionHandler.js.map