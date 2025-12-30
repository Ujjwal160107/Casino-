"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProfile = handleProfile;
const discord_js_1 = require("discord.js");
const walletService_1 = require("../../services/walletService");
const bankService_1 = require("../../services/bankService");
const shopService_1 = require("../../services/shopService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const emojiRegistry_1 = require("../../utils/emojiRegistry");
const imageService_1 = require("../../services/imageService");
const branding_1 = require("../../config/branding");
async function handleProfile(message, args) {
    try {
        const targetUser = message.mentions.users.first() || message.author;
        if (targetUser.bot)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Bots do not have profiles.")] });
        const user = await (0, walletService_1.ensureUserAndWallet)(targetUser.id, message.guildId, targetUser.tag);
        const [inventory, bank, config] = await Promise.all([
            (0, shopService_1.getUserInventory)(targetUser.id, message.guildId),
            (0, bankService_1.getBankByUserId)(user.id),
            (0, guildConfigService_1.getGuildConfig)(message.guildId)
        ]);
        const currencyEmoji = config.currencyEmoji;
        const walletBal = user.wallet?.balance ?? 0;
        const bankBal = bank?.balance ?? 0;
        const inventoryValue = inventory.reduce((sum, slot) => {
            return sum + (slot.shopItem.price * slot.amount);
        }, 0);
        const netWorth = walletBal + bankBal + inventoryValue;
        let attachment;
        try {
            attachment = await (0, imageService_1.generateProfileImage)({ username: targetUser.username, creditScore: user.creditScore, level: user.level }, walletBal, bankBal, netWorth, targetUser.displayAvatarURL({ extension: "png", size: 256 }), user.profileTheme);
        }
        catch (e) {
            console.error("Canvas Error:", e);
            return message.reply("Failed to generate profile image.");
        }
        const eWallet = (0, emojiRegistry_1.emojiInline)("wallet", message.guild) || "👛";
        const eInv = (0, emojiRegistry_1.emojiInline)("inventory", message.guild) || "🎒";
        const eGraph = (0, emojiRegistry_1.emojiInline)("graph", message.guild) || "📈";
        const parseEmojiForButton = (str) => str.match(/:(\d+)>/)?.[1] ?? (str.match(/^\d+$/) ? str : str);
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("prof_inv")
            .setLabel("Inventory")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setEmoji(parseEmojiForButton(eInv)), new discord_js_1.ButtonBuilder()
            .setCustomId("prof_bal")
            .setLabel("Balance")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setEmoji(parseEmojiForButton(eWallet)));
        const sentMsg = await message.reply({
            files: [attachment],
            components: [row]
        });
        const collector = sentMsg.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            time: 60000,
            filter: (i) => i.user.id === message.author.id
        });
        collector.on("collect", async (interaction) => {
            if (interaction.customId === "prof_inv") {
                if (inventory.length === 0) {
                    await interaction.reply({ content: "Inventory is empty.", ephemeral: true });
                }
                else {
                    const itemsList = inventory.slice(0, 10).map(i => `• ${i.shopItem.name} (x${i.amount})`).join("\n");
                    const invEmbed = new discord_js_1.EmbedBuilder()
                        .setTitle(`Quick Inventory`)
                        .setColor(branding_1.Mascot.Colors.Base)
                        .setDescription(itemsList + (inventory.length > 10 ? `\n...and ${inventory.length - 10} more` : ""));
                    const thinkUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
                    if (thinkUrl)
                        invEmbed.setThumbnail(thinkUrl);
                    await interaction.reply({ embeds: [invEmbed], ephemeral: true });
                }
            }
            if (interaction.customId === "prof_bal") {
                const balEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`Detailed Balance`)
                    .setColor(discord_js_1.Colors.Green)
                    .addFields({ name: "Wallet", value: (0, format_1.fmtCurrency)(walletBal, currencyEmoji), inline: true }, { name: "Bank", value: (0, format_1.fmtCurrency)(bankBal, currencyEmoji), inline: true }, { name: "Inventory", value: (0, format_1.fmtCurrency)(inventoryValue, currencyEmoji), inline: true }, { name: "Net Worth", value: (0, format_1.fmtCurrency)(netWorth, currencyEmoji), inline: true })
                    .setFooter({ text: `${branding_1.Mascot.Name} Private View` });
                const moneyUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
                if (moneyUrl)
                    balEmbed.setThumbnail(moneyUrl);
                await interaction.reply({ embeds: [balEmbed], ephemeral: true });
            }
        });
        collector.on("end", () => {
            try {
                const disabledRow = discord_js_1.ActionRowBuilder.from(row).setComponents(row.components.map(c => discord_js_1.ButtonBuilder.from(c).setDisabled(true)));
                sentMsg.edit({ components: [disabledRow] }).catch(() => { });
            }
            catch { }
        });
    }
    catch (err) {
        console.error("Profile Error:", err);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Failed to load profile.")] });
    }
}
//# sourceMappingURL=profile.js.map