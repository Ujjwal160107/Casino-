"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const shopService_1 = require("../../services/shopService");
const guildConfigService_1 = require("../../services/guildConfigService");
const branding_1 = require("../../config/branding");
const walletService_1 = require("../../services/walletService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const ITEMS_PER_PAGE = 5;
// Helper to render the shop page with "Price Tag" visuals and Direct Buy Buttons
async function renderStorePage(interaction, items, page, emoji) {
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    page = Math.max(1, Math.min(page, totalPages));
    const start = (page - 1) * ITEMS_PER_PAGE;
    // Proper slicing
    const currentItems = items.slice(start, start + ITEMS_PER_PAGE);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🛒 Store")
        .setColor(discord_js_1.Colors.DarkGrey)
        .setFooter({ text: `Page ${page}/${totalPages} • Click the buttons below to buy` });
    if (currentItems.length > 0) {
        const description = currentItems.map((item, index) => {
            const stockText = item.stock === -1 ? "" : ` • Stock: ${item.stock}`;
            // Chip mention: </shop buy:ID>
            const shopCmdId = interaction.commandId;
            const buyAction = `</shop buy:${shopCmdId}>`;
            // Row Text Format: Item Name - $Price </shop buy>
            return `**${item.name}** — **${(0, format_1.fmtCurrency)(item.price, emoji)}** ${buyAction}\n*${item.description || "No description"}*${stockText}`;
        }).join("\n\n");
        embed.setDescription(description);
    }
    else {
        embed.setDescription("No items available.");
    }
    // Row 1: Direct Buy Buttons ("Buy ItemName")
    const buyRow = new discord_js_1.ActionRowBuilder();
    if (currentItems.length > 0) {
        currentItems.forEach((item) => {
            buyRow.addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`shop_buy_${item.id}`)
                .setLabel(item.name.length > 20 ? item.name.substring(0, 18) + ".." : item.name)
                .setStyle(discord_js_1.ButtonStyle.Success) // Green
                .setEmoji("🛒"));
        });
    }
    // Row 2: Navigation
    const navRow = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`shop_prev`).setLabel("Previous").setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(page <= 1), new discord_js_1.ButtonBuilder().setCustomId(`shop_next`).setLabel("Next").setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(page >= totalPages));
    const components = currentItems.length > 0 ? [buyRow, navRow] : [navRow];
    return { embed, components, page, totalPages };
}
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("shop")
    .setDescription("Access the server shop")
    .addSubcommand((sub) => sub
    .setName("view")
    .setDescription("View the shop items and buy via buttons"))
    .addSubcommand((sub) => sub
    .setName("buy")
    .setDescription("Buy a specific item by name")
    .addStringOption((opt) => opt.setName("item").setDescription("Name of the item").setRequired(true)))
    .addSubcommand((sub) => sub
    .setName("inventory")
    .setDescription("View your current inventory"));
async function execute(interaction) {
    const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
    const emoji = config.currencyEmoji;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "buy") {
        const itemName = interaction.options.getString("item", true);
        await interaction.deferReply();
        try {
            await (0, walletService_1.ensureUserAndWallet)(interaction.user.id, interaction.guildId, interaction.user.tag);
            const item = await (0, shopService_1.buyItem)(interaction.guildId, interaction.user.id, itemName);
            if (item.roleId && interaction.guild) {
                const role = interaction.guild.roles.cache.get(item.roleId);
                if (role) {
                    const member = interaction.member;
                    try {
                        await member.roles.add(role);
                    }
                    catch { }
                }
            }
            return interaction.editReply({ embeds: [(0, embed_1.successEmbed)(interaction.user, "Purchase Successful", `You bought **${item.name}**!`)] });
        }
        catch (err) {
            return interaction.editReply({ embeds: [(0, embed_1.errorEmbed)(interaction.user, "Failed", err.message)] });
        }
    }
    if (subcommand === "inventory") {
        await interaction.deferReply();
        const inv = await (0, shopService_1.getUserInventory)(interaction.user.id, interaction.guildId);
        if (inv.length === 0)
            return interaction.editReply("Your inventory is empty.");
        const desc = inv.map(i => {
            const item = i.shopItem;
            const usable = (item.consumable || item.effects) ? " **[USE]**" : "";
            return `• **${item.name}${usable}** (x${i.amount})`;
        }).join("\n");
        const embed = new discord_js_1.EmbedBuilder().setTitle(`${interaction.user.username}'s Inventory`).setColor(discord_js_1.Colors.Blue).setDescription(desc || "Empty");
        return interaction.editReply({ embeds: [embed] });
    }
    if (subcommand === "view") {
        try {
            await interaction.deferReply();
            const allItems = await (0, shopService_1.getShopItems)(interaction.guildId);
            if (allItems.length === 0) {
                return interaction.editReply({ embeds: [(0, embed_1.errorEmbed)(interaction.user, "Shop Empty", "No items are currently for sale.")] });
            }
            // Sort items by price (lowest to highest)
            allItems.sort((a, b) => a.price - b.price);
            let currentPage = 1;
            const ui = await renderStorePage(interaction, allItems, currentPage, emoji);
            const sentMessage = await interaction.editReply({ embeds: [ui.embed], components: ui.components });
            const collector = sentMessage.createMessageComponentCollector({
                componentType: discord_js_1.ComponentType.Button,
                time: 120000,
                filter: (i) => i.user.id === interaction.user.id
            });
            collector.on("collect", async (btnInteraction) => {
                if (btnInteraction.customId === "shop_prev") {
                    currentPage--;
                    const newUI = await renderStorePage(interaction, allItems, currentPage, emoji);
                    await btnInteraction.update({ embeds: [newUI.embed], components: newUI.components });
                    return;
                }
                if (btnInteraction.customId === "shop_next") {
                    currentPage++;
                    const newUI = await renderStorePage(interaction, allItems, currentPage, emoji);
                    await btnInteraction.update({ embeds: [newUI.embed], components: newUI.components });
                    return;
                }
                if (btnInteraction.customId.startsWith("shop_buy_")) {
                    const itemId = btnInteraction.customId.replace("shop_buy_", "");
                    const item = allItems.find(i => i.id === itemId);
                    if (!item) {
                        await btnInteraction.reply({ content: "Item no longer exists.", ephemeral: true });
                        return;
                    }
                    try {
                        await (0, walletService_1.ensureUserAndWallet)(btnInteraction.user.id, btnInteraction.guildId, btnInteraction.user.tag);
                        const bought = await (0, shopService_1.buyItem)(btnInteraction.guildId, btnInteraction.user.id, item.name);
                        if (bought.roleId && btnInteraction.guild) {
                            const role = btnInteraction.guild.roles.cache.get(bought.roleId);
                            if (role) {
                                const member = btnInteraction.member;
                                try {
                                    await member.roles.add(role);
                                }
                                catch (e) { }
                            }
                        }
                        await btnInteraction.reply({
                            content: `${branding_1.Mascot.Emotes.Accept} Successfully purchased **${bought.name}** for **${(0, format_1.fmtCurrency)(bought.price, emoji)}**.`,
                            ephemeral: true
                        });
                    }
                    catch (err) {
                        await btnInteraction.reply({ content: `${branding_1.Mascot.Emotes.Fail} Purchase failed: ${err.message}`, ephemeral: true });
                    }
                }
            });
            collector.on("end", async () => {
                try {
                    const endUI = await renderStorePage(interaction, allItems, currentPage, emoji);
                    const disabledRows = endUI.components.map(row => {
                        row.components.forEach(btn => btn.setDisabled(true));
                        return row;
                    });
                    sentMessage.edit({ components: disabledRows }).catch(() => { });
                }
                catch { }
            });
        }
        catch (err) {
            console.error("slashShop error:", err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp("Failed to load shop.");
            }
            else {
                await interaction.reply("Failed to load shop.");
            }
        }
    }
}
//# sourceMappingURL=shop.js.map