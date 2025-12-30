"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInventory = handleInventory;
const discord_js_1 = require("discord.js");
const shopService_1 = require("../../services/shopService");
const guildConfigService_1 = require("../../services/guildConfigService");
const walletService_1 = require("../../services/walletService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const emojiRegistry_1 = require("../../utils/emojiRegistry");
const branding_1 = require("../../config/branding");
async function handleInventory(message, args) {
    try {
        let targetUser = message.mentions.users.first() || message.author;
        if (targetUser.bot) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Bots cannot hold items.")] });
        }
        await (0, walletService_1.ensureUserAndWallet)(targetUser.id, message.guildId, targetUser.tag);
        const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
        let emoji = config.currencyEmoji;
        if (/^\d+$/.test(emoji)) {
            const resolved = message.guild?.emojis.cache.get(emoji);
            emoji = resolved ? resolved.toString() : "💰";
        }
        const items = await (0, shopService_1.getUserInventory)(targetUser.id, message.guildId);
        const eInv = (0, emojiRegistry_1.emojiInline)("inventory", message.guild) || "🎒";
        if (items.length === 0) {
            const url = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
            const emptyEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${targetUser.username}'s Inventory`)
                .setColor(branding_1.Mascot.Colors.Base)
                .setDescription(`Your inventory is empty.\nCheck out the store with \`${config.prefix}shop\`!`)
                .setTimestamp();
            if (url)
                emptyEmbed.setThumbnail(url);
            return message.reply({ embeds: [emptyEmbed] });
        }
        const netWorth = items.reduce((sum, slot) => sum + (slot.shopItem.price * slot.amount), 0);
        const options = items.slice(0, 25).map(slot => ({
            label: `${slot.shopItem.name} (x${slot.amount})`,
            description: `Value: ${(0, format_1.fmtAmount)(slot.shopItem.price)} | Quick Sell: ${(0, format_1.fmtAmount)(Math.floor(slot.shopItem.price * 0.5))}`,
            value: slot.shopItem.id
        }));
        const displayItems = items.slice(0, 15);
        const description = displayItems.map((slot, index) => {
            const item = slot.shopItem;
            return `**${index + 1}. ${item.name}**\n` +
                `Quantity: \`x${slot.amount}\` • Price: ${(0, format_1.fmtCurrency)(item.price, emoji)}`;
        }).join("\n\n");
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${targetUser.username}'s Inventory`)
            .setColor(branding_1.Mascot.Colors.Base)
            .setDescription(description)
            .addFields({
            name: `Total Asset Value`,
            value: (0, format_1.fmtCurrency)(netWorth, emoji),
            inline: false
        })
            .setFooter({ text: `${branding_1.Mascot.Name} • Select an item below to Sell, Trade, or List.` })
            .setTimestamp();
        // Use Money emote for populated inventory or keep eInv if it was significant? 
        // The user wants "custom emojis as thumbnails". Money fits "Asset Value".
        const moneyUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
        if (moneyUrl)
            embed.setThumbnail(moneyUrl);
        const rows = [];
        if (targetUser.id === message.author.id) {
            const menu = new discord_js_1.StringSelectMenuBuilder()
                .setCustomId("inv_select_item")
                .setPlaceholder("Select an item to manage...")
                .addOptions(options);
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(menu));
        }
        return message.reply({ embeds: [embed], components: rows });
    }
    catch (err) {
        console.error("Inventory Error:", err);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Failed to fetch inventory.")] });
    }
}
//# sourceMappingURL=inventory.js.map