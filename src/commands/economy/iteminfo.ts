import { Message, EmbedBuilder, Colors } from "discord.js";
import { getShopItemByName, getShopItems } from "../../services/shopService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { ItemEffect } from "../../services/effectService";
import { getGuildPrefix } from "../../utils/guildContext";

function formatEffectDescription(effect: ItemEffect): string {
    switch (effect.type) {
        case "ROLE_TEMPORARY":
            return ` **Temporary Role**: <@&${effect.roleId}> for ${formatDuration(effect.duration!)}`;
        case "ROLE_PERMANENT":
            return ` **Permanent Role**: <@&${effect.roleId}>`;
        case "XP_MULTIPLIER":
            return ` **XP Boost**: ${effect.multiplier}x multiplier for ${formatDuration(effect.duration!)}`;
        case "LEVEL_BOOST":
            return ` **Level Up**: Instantly gain ${effect.levels} level(s)`;
        case "MONEY":
            return ` **Money**: Receive ${effect.amount} coins`;
        case "CUSTOM_MESSAGE":
            return ` **Message**: "${effect.message}"`;
        default:
            return " Unknown effect";
    }
}

export async function handleItemInfo(message: Message, args: string[]) {
    try {
        const prefix = await getGuildPrefix(message.guildId!);
        

        if (args.length === 0) {
            return message.reply(`Usage: \`${prefix}iteminfo <item name>\``);
        }

        const itemName = args.join(" ");
        const item = await getShopItemByName(message.guildId!, itemName);

        if (!item) {
            return message.reply({ embeds: [errorEmbed(message.author, "Not Found", `Item "${itemName}" not found in the shop.`)] });
        }

        const effects = (item.effects as unknown as ItemEffect[]) || [];
        const stockText = item.stock === -1 ? "∞ Unlimited" : `${item.stock} in stock`;

        const embed = new EmbedBuilder()
            .setTitle(`<a:BoxBox:1449707866079494154> ${item.name}`)
            .setColor(Colors.Blue)
            .setDescription(item.description || "*No description provided*")
            .addFields(
                { name: "<:pricee:1449707707442528387> Price", value: fmtCurrency(item.price), inline: true },
                { name: "<a:BoxBox:1449707866079494154> Stock", value: stockText, inline: true }
            );

        if (effects.length > 0) {
            const effectsText = effects.map((e, i) => `${i + 1}. ${formatEffectDescription(e)}`).join("\n");
            embed.addFields({ name: "<:sparks:1456569026292744303> Effects", value: effectsText, inline: false });
        } else {
            embed.addFields({ name: "<:sparks:1456569026292744303> Effects", value: "*No special effects*", inline: false });
        }

        embed.setFooter({ text: `Use ${prefix}shop buy ${item.name} to purchase` });

        return message.reply({ embeds: [embed] });

    } catch (err) {
        console.error("iteminfo error:", err);
        return message.reply("Failed to fetch item information.");
    }
}
