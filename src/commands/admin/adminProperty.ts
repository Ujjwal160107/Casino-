
import { Message } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { Mascot } from "../../config/branding";
import { DEVELOPER_ONLY_COMMAND_MESSAGE, isBotDeveloper } from "../../utils/developerAccess";
import { successContainer, errorContainer, infoContainer, v2Reply } from "../../utils/componentsV2";

export const managePropertyHandler = async (message: Message, args: string[]) => {
    if (!isBotDeveloper(message.author.id)) {
        return message.reply(v2Reply(errorContainer(`${Mascot.Emotes.Fail} Access Denied`, DEVELOPER_ONLY_COMMAND_MESSAGE)));
    }

    const action = args[0]?.toLowerCase();

    if (!action) {
        return message.reply(v2Reply(infoContainer(`${Mascot.Name} Property Admin`, "Usage: `!manage-property <create|edit|delete> ...args`")));
    }

    // !manage-property create <key> <name> <price> <income>
    if (action === "create") {
        const key = args[1]?.toLowerCase();
        const price = parseInt(args[args.length - 2]); // 2nd to last
        const income = parseInt(args[args.length - 1]); // Last

        if (!key || isNaN(price) || isNaN(income)) {
            return message.reply(v2Reply(infoContainer(
                "Admin: Create Property",
                "Usage: `!manage-property create <key> <name...> <price> <income>`\nExample: `!manage-property create shack Dusty Shack 5000 100`"
            )));
        }

        // Extract name (everything between key and price)
        const nameParts = args.slice(2, args.length - 2);
        const name = nameParts.join(" ");

        if (!name) return message.reply("Please provide a name for the property.");

        try {
            const property = await PropertyService.createProperty(message.guildId!, key, name, price, income);

            const fields = [
                `**Name:** ${property.name}`,
                `**Key:** \`${property.key}\``,
                `**Price:** ${property.price}`,
                `**Income:** ${property.incomePerCycle}`,
            ].join("\n");

            return message.reply(v2Reply(successContainer(
                `${Mascot.Emotes.Accept} Property Created`,
                `Successfully created new property type.\n\n${fields}`
            )));
        } catch (e) {
            return message.reply(v2Reply(errorContainer(`${Mascot.Emotes.Fail} Error`, `Failed to create property: ${e}`)));
        }
    }

    // !manage-property delete <key>
    if (action === "delete") {
        const key = args[1]?.toLowerCase();
        if (!key) return message.reply("Usage: `!manage-property delete <key>`");

        try {
            await PropertyService.deleteProperty(message.guildId!, key);
            return message.reply(v2Reply(successContainer(
                `${Mascot.Emotes.Accept} Property Deleted`,
                `Property with key \`${key}\` has been deleted from the system.`
            )));
        } catch (e) {
            return message.reply(v2Reply(errorContainer(`${Mascot.Emotes.Fail} Error`, `Failed to delete property: ${e}`)));
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
            return message.reply(v2Reply(successContainer(
                `${Mascot.Emotes.Accept} Property Updated`,
                `Successfully updated **${field}** for property \`${key}\`.`
            )));
        } catch (e) {
            return message.reply(v2Reply(errorContainer(`${Mascot.Emotes.Fail} Error`, `Failed to update property: ${e}`)));
        }
    }
};
