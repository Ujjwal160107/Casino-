"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.managePropertyHandler = void 0;
const discord_js_1 = require("discord.js");
const propertyService_1 = require("../../services/propertyService");
const branding_1 = require("../../config/branding");
const managePropertyHandler = async (message, args) => {
    // Check for admin permissions
    if (!message.member?.permissions.has("Administrator")) {
        const errorEmbed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Fail} Access Denied`)
            .setDescription("You need Administrator permissions to use this command.")
            .setColor("#FF0000"); // Red
        return message.reply({ embeds: [errorEmbed] });
    }
    const action = args[0]?.toLowerCase();
    if (!action) {
        const helpEmbed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Name} Property Admin`)
            .setDescription("Usage: `!manage-property <create|edit|delete> ...args`")
            .setColor(branding_1.Mascot.Colors.Base);
        return message.reply({ embeds: [helpEmbed] });
    }
    // !manage-property create <key> <name> <price> <income>
    if (action === "create") {
        const key = args[1]?.toLowerCase();
        const price = parseInt(args[args.length - 2]); // 2nd to last
        const income = parseInt(args[args.length - 1]); // Last
        if (!key || isNaN(price) || isNaN(income)) {
            const usageEmbed = new discord_js_1.EmbedBuilder()
                .setTitle("Admin: Create Property")
                .setDescription("Usage: `!manage-property create <key> <name...> <price> <income>`\nExample: `!manage-property create shack Dusty Shack 5000 100`")
                .setColor("Yellow");
            return message.reply({ embeds: [usageEmbed] });
        }
        // Extract name (everything between key and price)
        const nameParts = args.slice(2, args.length - 2);
        const name = nameParts.join(" ");
        if (!name)
            return message.reply("Please provide a name for the property.");
        try {
            const property = await propertyService_1.PropertyService.createProperty(message.guildId, key, name, price, income);
            const successEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Accept} Property Created`)
                .setDescription(`Successfully created new property type.`)
                .addFields({ name: "Name", value: property.name, inline: true }, { name: "Key", value: `\`${property.key}\``, inline: true }, { name: "Price", value: `${property.price}`, inline: true }, { name: "Income", value: `${property.incomePerCycle}`, inline: true })
                .setColor(branding_1.Mascot.Colors.Success);
            return message.reply({ embeds: [successEmbed] });
        }
        catch (e) {
            const errorEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Fail} Error`)
                .setDescription(`Failed to create property: ${e}`)
                .setColor("#FF0000");
            return message.reply({ embeds: [errorEmbed] });
        }
    }
    // !manage-property delete <key>
    if (action === "delete") {
        const key = args[1]?.toLowerCase();
        if (!key)
            return message.reply("Usage: `!manage-property delete <key>`");
        try {
            await propertyService_1.PropertyService.deleteProperty(message.guildId, key);
            const successEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Accept} Property Deleted`)
                .setDescription(`Property with key \`${key}\` has been deleted from the system.`)
                .setColor(branding_1.Mascot.Colors.Success);
            return message.reply({ embeds: [successEmbed] });
        }
        catch (e) {
            const errorEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Fail} Error`)
                .setDescription(`Failed to delete property: ${e}`)
                .setColor("#FF0000");
            return message.reply({ embeds: [errorEmbed] });
        }
    }
    // !manage-property edit <key> <field> <value>
    if (action === "edit") {
        const key = args[1]?.toLowerCase();
        const field = args[2]?.toLowerCase(); // price, income, name, image
        const value = args.slice(3).join(" ");
        if (!key || !field || !value) {
            return message.reply("Usage: `!manage-property edit <key> <field> <value>`\nFields: `price`, `income`, `name`, `image`");
        }
        const data = {};
        if (field === 'price' || field === 'baseprice') {
            data.basePrice = parseInt(value);
            data.price = parseInt(value);
        }
        else if (field === 'income') {
            data.incomePerCycle = parseInt(value);
        }
        else if (field === 'name') {
            data.name = value;
        }
        else if (field === 'image') {
            data.imageUrl = value;
        }
        else {
            return message.reply("Invalid field.");
        }
        try {
            await propertyService_1.PropertyService.editProperty(message.guildId, key, data);
            const successEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Accept} Property Updated`)
                .setDescription(`Successfully updated **${field}** for property \`${key}\`.`)
                .setColor(branding_1.Mascot.Colors.Success);
            return message.reply({ embeds: [successEmbed] });
        }
        catch (e) {
            const errorEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Fail} Error`)
                .setDescription(`Failed to update property: ${e}`)
                .setColor("#FF0000");
            return message.reply({ embeds: [errorEmbed] });
        }
    }
};
exports.managePropertyHandler = managePropertyHandler;
//# sourceMappingURL=adminProperty.js.map