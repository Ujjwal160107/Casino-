
import { Message, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { PropertyService } from "../../services/propertyService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";



export const propertiesHandler = async (message: Message, args: string[]) => {
    const subCommand = args[0]?.toLowerCase();
    const guildId = message.guildId!;
    const userId = message.author.id;
    const guildConfig = await getGuildConfig(guildId);
    const prefix = guildConfig.prefix || "!";


    // Banner Image
    const bannerPath = "C:/Users/ujjwa/.gemini/antigravity/brain/53146123-dc6c-4f9e-af36-1452d87996f0/uploaded_image_1767341302816.png";
    const bannerFile = new AttachmentBuilder(bannerPath, { name: 'property-banner.png' });


    // !properties (Shop)
    if (!subCommand) {
        const properties = await PropertyService.getAllProperties(guildId);

        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Name} Real Estate Market`)
            .setDescription("Invest in properties to earn passive income and grow your net worth!\nPrices fluctuate based on market demand.")
            .setColor(Mascot.Colors.Base as any)
            .setImage('attachment://property-banner.png')
            .setFooter({ text: `Use ${prefix}buy-property <key> to purchase` });

        if (properties.length === 0) {
            embed.setDescription("No properties available for sale right now. Ask an admin to create some!");
        } else {
            properties.forEach(p => {
                embed.addFields({
                    name: `${p.name} (${p.key})`,
                    value: `${Mascot.Emotes.Price} **Price:** ${fmtCurrency(p.price)}\n${Mascot.Emotes.Graph} **Base Price:** ${fmtCurrency(p.basePrice)}\n${Mascot.Emotes.MoneyBag} **Income:** ${fmtCurrency(p.incomePerCycle)}/${p.incomeCycleHours}h\n${Mascot.Emotes.Trade} **Sold:** ${p.totalSold}`,
                    inline: true
                });
            });
        }

        return message.reply({ embeds: [embed], files: [bannerFile] });
    }
};

export const buyPropertyHandler = async (message: Message, args: string[]) => {
    const key = args[0]?.toLowerCase();
    if (!key) return message.reply("Usage: `!buy-property <key>`");

    const result = await PropertyService.buyProperty(message.author.id, message.guildId!, key);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Accept} Purchase Successful`)
            .setDescription(result.message)
            .setColor(Mascot.Colors.Success as any);
        return message.reply({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Fail} Purchase Failed`)
            .setDescription(result.message)
            .setColor("#FF0000"); // Red
        return message.reply({ embeds: [embed] });
    }
};

export const sellPropertyHandler = async (message: Message, args: string[]) => {
    const key = args[0]?.toLowerCase();
    if (!key) return message.reply("Usage: `!sell-property <key>`\n⚠️ This sells back to the bank for ~75% value. Use `!market` to sell to players.");

    const result = await PropertyService.sellPropertySystem(message.author.id, message.guildId!, key);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Accept} Sale Successful`)
            .setDescription(result.message)
            .setColor(Mascot.Colors.Success as any);
        return message.reply({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Fail} Sale Failed`)
            .setDescription(result.message)
            .setColor("#FF0000");
        return message.reply({ embeds: [embed] });
    }
};

export const myPropertiesHandler = async (message: Message) => {
    const guildConfig = await getGuildConfig(message.guildId!);
    const prefix = guildConfig.prefix || "!";
    const currencyEmoji = guildConfig.currencyEmoji || "🪙";

    const owned = await PropertyService.getOwnedProperties(message.author.id, message.guildId!);

    const embed = new EmbedBuilder()
        .setTitle(`${message.author.username}'s Portfolio`)
        .setColor(Mascot.Colors.Base as any);

    if (owned.length === 0) {
        embed.setDescription(`You don't own any properties yet. Use \`${prefix}properties\` to view the market.`);
    } else {
        let totalIncome = 0;
        owned.forEach(op => {
            const p = op.property;
            totalIncome += p.incomePerCycle;

            const nextCollect = new Date(op.lastCollected.getTime() + (p.incomeCycleHours * 60 * 60 * 1000));
            const ready = new Date() >= nextCollect;
            const status = ready ? `${Mascot.Emotes.Accept} **Rent Due**` : `${Mascot.Emotes.Cooldown} Due <t:${Math.floor(nextCollect.getTime() / 1000)}:R>`;

            embed.addFields({
                name: `${p.name}`,
                value: `${Mascot.Emotes.Price} Purchased: ${fmtCurrency(op.purchasedPrice, currencyEmoji)}\n${Mascot.Emotes.GraphUp} Current Val: ${fmtCurrency(p.price, currencyEmoji)}\n${Mascot.Emotes.MoneyBag} Income: ${fmtCurrency(p.incomePerCycle, currencyEmoji)}\n${status}`,
                inline: true
            });
        });

        embed.setDescription(`Total Properties: **${owned.length}**\nTotal Potential Income: **${fmtCurrency(totalIncome, currencyEmoji)}** per cycle.`);
    }

    return message.reply({ embeds: [embed] });
};

export const collectRentHandler = async (message: Message) => {
    const result = await PropertyService.collectRent(message.author.id, message.guildId!);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Accept} Rent Collected`)
            .setDescription(result.message)
            .setColor(Mascot.Colors.Success as any);
        return message.reply({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Fail} Failed`)
            .setDescription(result.message)
            .setColor("#FF0000");
        return message.reply({ embeds: [embed] });
    }
};
