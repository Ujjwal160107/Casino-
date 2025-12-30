"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleShop = handleShop;
const discord_js_1 = require("discord.js");
const shopService_1 = require("../../services/shopService");
const guildConfigService_1 = require("../../services/guildConfigService");
const walletService_1 = require("../../services/walletService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const discordLogger_1 = require("../../utils/discordLogger");
const ITEMS_PER_PAGE = 5;
const branding_1 = require("../../config/branding");
function renderShopPage(items, page, totalPages, currencyEmoji) {
    const start = (page - 1) * ITEMS_PER_PAGE;
    const currentItems = items.slice(start, start + ITEMS_PER_PAGE);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`Shop`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setFooter({ text: `${branding_1.Mascot.Name} • Page ${page}/${totalPages} • Use buttons to buy` + "\u3000".repeat(25) });
    const url = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
    if (url)
        embed.setThumbnail(url);
    if (currentItems.length > 0) {
        currentItems.forEach((item, index) => {
            const itemNumber = (page - 1) * ITEMS_PER_PAGE + index + 1;
            const name = `${itemNumber}. ${item.name} — ${(0, format_1.fmtCurrency)(item.price, currencyEmoji)}`;
            const value = `${item.description || "No description"}` + "\u3000".repeat(20);
            embed.addFields({ name, value, inline: false });
        });
    }
    else {
        embed.setDescription("No items available.");
    }
    const buyRow = new discord_js_1.ActionRowBuilder();
    currentItems.forEach((item, index) => {
        buyRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`shop_buy_${item.id}`)
            .setLabel(`${(page - 1) * ITEMS_PER_PAGE + index + 1}`)
            .setStyle(discord_js_1.ButtonStyle.Success)
            .setEmoji("🛒"));
    });
    const navRow = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("shop_prev").setLabel("Previous").setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(page <= 1), new discord_js_1.ButtonBuilder().setCustomId("shop_next").setLabel("Next").setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(page >= totalPages));
    const components = currentItems.length > 0 ? [buyRow, navRow] : [navRow];
    return { embed, components };
}
async function handleShop(message, args) {
    try {
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        const emoji = config.currencyEmoji;
        const sub = args[0]?.toLowerCase();
        if (sub === "buy") {
            const itemName = args.slice(1).join(" ");
            if (!itemName)
                return message.reply(`Usage: \`${config.prefix}shop buy <item name>\``);
            try {
                await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
                const item = await (0, shopService_1.buyItem)(message.guildId, message.author.id, itemName);
                if (item.roleId && message.guild) {
                    const role = message.guild.roles.cache.get(item.roleId);
                    if (role)
                        try {
                            await message.member?.roles.add(role);
                        }
                        catch { }
                }
                await (0, discordLogger_1.logToChannel)(message.client, {
                    guild: message.guild,
                    type: "MARKET",
                    title: "Shop Purchase",
                    description: `**User:** ${message.author.tag}\n**Item:** ${item.name}\n**Price:** ${(0, format_1.fmtCurrency)(item.price, emoji)}`,
                    color: 0x00FF00
                });
                return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Purchase Successful", `You bought **${item.name}**!`)] });
            }
            catch (err) {
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Failed", err.message)] });
            }
        }
        if (sub === "inv" || sub === "inventory") {
            const inv = await (0, shopService_1.getUserInventory)(message.author.id, message.guildId);
            if (inv.length === 0)
                return message.reply("Your inventory is empty.");
            const desc = inv.map(i => `• **${i.shopItem.name}** (x${i.amount})`).join("\n");
            const embed = new discord_js_1.EmbedBuilder().setTitle(`${message.author.username}'s Inventory`).setColor(discord_js_1.Colors.Blue).setDescription(desc || "Empty");
            return message.reply({ embeds: [embed] });
        }
        const allItems = await (0, shopService_1.getShopItems)(message.guildId);
        if (allItems.length === 0)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Shop Empty", "No items are currently for sale.")] });
        allItems.sort((a, b) => a.price - b.price);
        let currentPage = 1;
        const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
        const ui = renderShopPage(allItems, currentPage, totalPages, emoji);
        const sentMessage = await message.reply({ embeds: [ui.embed], components: ui.components });
        const collector = sentMessage.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            time: 120000,
            filter: (i) => i.user.id === message.author.id
        });
        collector.on("collect", async (interaction) => {
            if (interaction.customId === "shop_prev") {
                currentPage--;
                const newUI = renderShopPage(allItems, currentPage, totalPages, emoji);
                await interaction.update({ embeds: [newUI.embed], components: newUI.components });
                return;
            }
            if (interaction.customId === "shop_next") {
                currentPage++;
                const newUI = renderShopPage(allItems, currentPage, totalPages, emoji);
                await interaction.update({ embeds: [newUI.embed], components: newUI.components });
                return;
            }
            if (interaction.customId.startsWith("shop_buy_")) {
                const itemId = interaction.customId.replace("shop_buy_", "");
                const item = allItems.find(i => i.id === itemId);
                if (!item)
                    return interaction.reply({ content: "Item not found.", ephemeral: true });
                try {
                    await interaction.deferReply({ ephemeral: true });
                    await (0, walletService_1.ensureUserAndWallet)(interaction.user.id, interaction.guildId, interaction.user.tag);
                    const bought = await (0, shopService_1.buyItem)(interaction.guildId, interaction.user.id, item.name);
                    if (bought.roleId && interaction.guild) {
                        const role = interaction.guild.roles.cache.get(bought.roleId);
                        if (role) {
                            const member = interaction.member;
                            try {
                                await member.roles.add(role);
                            }
                            catch { }
                        }
                    }
                    await (0, discordLogger_1.logToChannel)(interaction.client, {
                        guild: interaction.guild,
                        type: "MARKET",
                        title: "Shop Purchase",
                        description: `**User:** ${interaction.user.tag}\n**Item:** ${bought.name}\n**Price:** ${(0, format_1.fmtCurrency)(bought.price, emoji)}`,
                        color: 0x00FF00
                    });
                    await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Accept} Purchased **${bought.name}** for **${(0, format_1.fmtCurrency)(bought.price, emoji)}**!` });
                }
                catch (err) {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} Error: ${err.message}` });
                    }
                    else {
                        await interaction.reply({ content: `${branding_1.Mascot.Emotes.Fail} Error: ${err.message}`, ephemeral: true });
                    }
                }
            }
        });
        collector.on("end", () => {
            try {
                const finalUI = renderShopPage(allItems, currentPage, totalPages, emoji);
                finalUI.components.forEach(row => row.components.forEach(c => c.setDisabled(true)));
                sentMessage.edit({ components: finalUI.components }).catch(() => { });
            }
            catch { }
        });
    }
    catch (err) {
        console.error("handleShop error:", err);
        try {
            await message.reply("Failed to load shop.");
        }
        catch { }
    }
}
//# sourceMappingURL=shop.js.map