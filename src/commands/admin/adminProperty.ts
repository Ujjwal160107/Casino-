
import { Message, EmbedBuilder } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { Mascot } from "../../config/branding";
import { DEVELOPER_ONLY_COMMAND_MESSAGE, isBotDeveloper } from "../../utils/developerAccess";

export const managePropertyHandler = async (message: Message, args: string[]) => {
    if (!isBotDeveloper(message.author.id)) {
        const errorEmbed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Fail} Access Denied`)
            .setDescription(DEVELOPER_ONLY_COMMAND_MESSAGE)
            .setColor("#FF0000"); // Red
        return message.reply({ embeds: [errorEmbed] });
    }

    const action = args[0]?.toLowerCase();

    if (!action) {
        const helpEmbed = new EmbedBuilder()
            .setTitle(`${Mascot.Name} Property Admin`)
            .setDescription("Usage: `!manage-property <create|edit|delete> ...args`")
            .setColor(Mascot.Colors.Base as any);
        return message.reply({ embeds: [helpEmbed] });
    }

    // !manage-property create <key> <name> <price> <income>
    if (action === "create") {
        const key = args[1]?.toLowerCase();
        const price = parseInt(args[args.length - 2]); // 2nd to last
        const income = parseInt(args[args.length - 1]); // Last

        if (!key || isNaN(price) || isNaN(income)) {
            const usageEmbed = new EmbedBuilder()
                .setTitle("Admin: Create Property")
                .setDescription("Usage: `!manage-property create <key> <name...> <price> <income>`\nExample: `!manage-property create shack Dusty Shack 5000 100`")
                .setColor("Yellow");
            return message.reply({ embeds: [usageEmbed] });
        }

        // Extract name (everything between key and price)
        const nameParts = args.slice(2, args.length - 2);
        const name = nameParts.join(" ");

        if (!name) return message.reply("Please provide a name for the property.");

        try {
            const property = await PropertyService.createProperty(message.guildId!, key, name, price, income);

            const successEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Accept} Property Created`)
                .setDescription(`Successfully created new property type.`)
                .addFields(
                    { name: "Name", value: property.name, inline: true },
                    { name: "Key", value: `\`${property.key}\``, inline: true },
                    { name: "Price", value: `${property.price}`, inline: true },
                    { name: "Income", value: `${property.incomePerCycle}`, inline: true }
                )
                .setColor(Mascot.Colors.Success as any);

            return message.reply({ embeds: [successEmbed] });
        } catch (e) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Fail} Error`)
                .setDescription(`Failed to create property: ${e}`)
                .setColor("#FF0000");
            return message.reply({ embeds: [errorEmbed] });
        }
    }

    // !manage-property delete <key>
    if (action === "delete") {
        const key = args[1]?.toLowerCase();
        if (!key) return message.reply("Usage: `!manage-property delete <key>`");

        try {
            await PropertyService.deleteProperty(message.guildId!, key);
            const successEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Accept} Property Deleted`)
                .setDescription(`Property with key \`${key}\` has been deleted from the system.`)
                .setColor(Mascot.Colors.Success as any);
            return message.reply({ embeds: [successEmbed] });
        } catch (e) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Fail} Error`)
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

        const data: any = {};
        if (field === 'price' || field === 'baseprice') {
            data.basePrice = parseInt(value);
            data.price = parseInt(value);
        } else if (field === 'income') {
            data.incomePerCycle = parseInt(value);
        } else if (field === 'name') {
            data.name = value;
        } else if (field === 'image') {
            data.imageUrl = value;
        } else {
            return message.reply("Invalid field.");
        }

        try {
            await PropertyService.editProperty(message.guildId!, key, data);
            const successEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Accept} Property Updated`)
                .setDescription(`Successfully updated **${field}** for property \`${key}\`.`)
                .setColor(Mascot.Colors.Success as any);
            return message.reply({ embeds: [successEmbed] });
        } catch (e) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Fail} Error`)
                .setDescription(`Failed to update property: ${e}`)
                .setColor("#FF0000");
            return message.reply({ embeds: [errorEmbed] });
        }
    }
};
