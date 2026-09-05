import { Message } from "discord.js";
import { findCatalogEntry, getShopItemByName, seedGeneralShop } from "../../services/shopService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { errorContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { ItemEffect } from "../../services/effectService";
import { getGuildPrefix } from "../../utils/guildContext";
import { getLoadedDiceStatus } from "../../services/loadedDiceService";
import { LOADED_DICE_ITEM_KEY } from "../../utils/loadedDiceConfig";
import { formatCardTierName } from "../../utils/economyConfig";

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

        const requestedItemName = args.join(" ");
        const itemName = requestedItemName.trim().toLowerCase() === "loaded dice of ruins"
            ? "Loaded Dice of Ruin"
            : requestedItemName;
        await seedGeneralShop(message.guildId!);
        const item = await getShopItemByName(message.guildId!, itemName);

        if (!item) {
            return message.reply(v2Reply(errorContainer("Not Found", `Item "${itemName}" not found in the shop.`)));
        }

        const effects = (item.effects as unknown as ItemEffect[]) || [];
        const stockText = item.stock === -1 ? "∞ Unlimited" : `${item.stock} in stock`;

        const effectsText = effects.length > 0
            ? effects.map((e, i) => `${i + 1}. ${formatEffectDescription(e)}`).join("\n")
            : "*No special effects*";

        const titleBlock = `## <a:BoxBox:1449707866079494154> ${item.name}\n${item.description || "*No description provided*"}`;
        const statsBlock = `**<:pricee:1449707707442528387> Price:** ${fmtCurrency(item.price)}\n**<a:BoxBox:1449707866079494154> Stock:** ${stockText}`;
        const minTier = findCatalogEntry(item)?.requiresCardTier;
        const gateBlock = minTier
            ? `**Card-exclusive:** ${formatCardTierName(minTier)} Fortuna Card or higher · credit only`
            : null;
        const effectsBlock = `**<:sparks:1456569026292744303> Effects**\n${effectsText}`;
        const isLoadedDice = item.catalogKey === LOADED_DICE_ITEM_KEY
            || item.name.toLowerCase() === "loaded dice of ruin";
        let diceStatusBlock: string | null = null;

        if (isLoadedDice) {
            const diceStatus = await getLoadedDiceStatus(message.author.id);
            let nextRoll = "Ready now";
            if (!diceStatus.owned) {
                nextRoll = diceStatus.nextRollAt && diceStatus.nextRollAt.getTime() > Date.now()
                    ? `After <t:${Math.floor(diceStatus.nextRollAt.getTime() / 1000)}:R> once you buy a new die`
                    : "Buy a new die to roll";
            } else if (!diceStatus.canRoll && diceStatus.nextRollAt) {
                nextRoll = `<t:${Math.floor(diceStatus.nextRollAt.getTime() / 1000)}:R>`;
            }

            diceStatusBlock = `**<:inventory:1456568973452644383> Your Dice**\n**Rolls:** ${diceStatus.completedRolls}\n**Next roll:** ${nextRoll}`;
        }

        return message.reply(v2Reply(plainContainer(
            titleBlock,
            statsBlock,
            ...(gateBlock ? [gateBlock] : []),
            effectsBlock,
            ...(diceStatusBlock ? [diceStatusBlock] : []),
        )));

    } catch (err) {
        console.error("iteminfo error:", err);
        return message.reply("Failed to fetch item information.");
    }
}
