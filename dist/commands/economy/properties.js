"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectRentHandler = exports.myPropertiesHandler = exports.sellPropertyHandler = exports.buyPropertyHandler = exports.propertiesHandler = void 0;
const discord_js_1 = require("discord.js");
const propertyService_1 = require("../../services/propertyService");
const format_1 = require("../../utils/format");
const branding_1 = require("../../config/branding");
const propertiesHandler = async (message, args) => {
    const subCommand = args[0]?.toLowerCase();
    const guildId = message.guildId;
    const userId = message.author.id;
    // Banner Image
    const bannerPath = "C:/Users/ujjwa/.gemini/antigravity/brain/53146123-dc6c-4f9e-af36-1452d87996f0/uploaded_image_1767341302816.png";
    const bannerFile = new discord_js_1.AttachmentBuilder(bannerPath, { name: 'property-banner.png' });
    // !properties (Shop)
    if (!subCommand) {
        const properties = await propertyService_1.PropertyService.getAllProperties(guildId);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Name} Real Estate Market`)
            .setDescription("Invest in properties to earn passive income and grow your net worth!\nPrices fluctuate based on market demand.")
            .setColor(branding_1.Mascot.Colors.Base)
            .setImage('attachment://property-banner.png')
            .setFooter({ text: "Use !buy-property <key> to purchase" });
        if (properties.length === 0) {
            embed.setDescription("No properties available for sale right now. Ask an admin to create some!");
        }
        else {
            properties.forEach(p => {
                embed.addFields({
                    name: `${p.name} (${p.key})`,
                    value: `${branding_1.Mascot.Emotes.Price} **Price:** ${(0, format_1.fmtCurrency)(p.price)}\n${branding_1.Mascot.Emotes.Graph} **Base Price:** ${(0, format_1.fmtCurrency)(p.basePrice)}\n${branding_1.Mascot.Emotes.MoneyBag} **Income:** ${(0, format_1.fmtCurrency)(p.incomePerCycle)}/${p.incomeCycleHours}h\n${branding_1.Mascot.Emotes.Trade} **Sold:** ${p.totalSold}`,
                    inline: true
                });
            });
        }
        return message.reply({ embeds: [embed], files: [bannerFile] });
    }
};
exports.propertiesHandler = propertiesHandler;
const buyPropertyHandler = async (message, args) => {
    const key = args[0]?.toLowerCase();
    if (!key)
        return message.reply("Usage: `!buy-property <key>`");
    const result = await propertyService_1.PropertyService.buyProperty(message.author.id, message.guildId, key);
    if (result.success) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Accept} Purchase Successful`)
            .setDescription(result.message)
            .setColor(branding_1.Mascot.Colors.Success);
        return message.reply({ embeds: [embed] });
    }
    else {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Fail} Purchase Failed`)
            .setDescription(result.message)
            .setColor("#FF0000"); // Red
        return message.reply({ embeds: [embed] });
    }
};
exports.buyPropertyHandler = buyPropertyHandler;
const sellPropertyHandler = async (message, args) => {
    const key = args[0]?.toLowerCase();
    if (!key)
        return message.reply("Usage: `!sell-property <key>`\n⚠️ This sells back to the bank for ~75% value. Use `!market` to sell to players.");
    const result = await propertyService_1.PropertyService.sellPropertySystem(message.author.id, message.guildId, key);
    if (result.success) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Accept} Sale Successful`)
            .setDescription(result.message)
            .setColor(branding_1.Mascot.Colors.Success);
        return message.reply({ embeds: [embed] });
    }
    else {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Fail} Sale Failed`)
            .setDescription(result.message)
            .setColor("#FF0000");
        return message.reply({ embeds: [embed] });
    }
};
exports.sellPropertyHandler = sellPropertyHandler;
const myPropertiesHandler = async (message) => {
    const owned = await propertyService_1.PropertyService.getOwnedProperties(message.author.id, message.guildId);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${message.author.username}'s Portfolio`)
        .setColor(branding_1.Mascot.Colors.Base);
    if (owned.length === 0) {
        embed.setDescription("You don't own any properties yet. Use `!properties` to view the market.");
    }
    else {
        let totalIncome = 0;
        owned.forEach(op => {
            const p = op.property;
            totalIncome += p.incomePerCycle;
            const nextCollect = new Date(op.lastCollected.getTime() + (p.incomeCycleHours * 60 * 60 * 1000));
            const ready = new Date() >= nextCollect;
            const status = ready ? `${branding_1.Mascot.Emotes.Accept} **Rent Due**` : `${branding_1.Mascot.Emotes.Cooldown} Due <t:${Math.floor(nextCollect.getTime() / 1000)}:R>`;
            embed.addFields({
                name: `${p.name}`,
                value: `${branding_1.Mascot.Emotes.Price} Purchased: ${(0, format_1.fmtCurrency)(op.purchasedPrice)}\n${branding_1.Mascot.Emotes.GraphUp} Current Val: ${(0, format_1.fmtCurrency)(p.price)}\n${branding_1.Mascot.Emotes.MoneyBag} Income: ${(0, format_1.fmtCurrency)(p.incomePerCycle)}\n${status}`,
                inline: true
            });
        });
        embed.setDescription(`Total Properties: **${owned.length}**\nTotal Potential Income: **${(0, format_1.fmtCurrency)(totalIncome)}** per cycle.`);
    }
    return message.reply({ embeds: [embed] });
};
exports.myPropertiesHandler = myPropertiesHandler;
const collectRentHandler = async (message) => {
    const result = await propertyService_1.PropertyService.collectRent(message.author.id, message.guildId);
    if (result.success) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Accept} Rent Collected`)
            .setDescription(result.message)
            .setColor(branding_1.Mascot.Colors.Success);
        return message.reply({ embeds: [embed] });
    }
    else {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Fail} Failed`)
            .setDescription(result.message)
            .setColor("#FF0000");
        return message.reply({ embeds: [embed] });
    }
};
exports.collectRentHandler = collectRentHandler;
//# sourceMappingURL=properties.js.map