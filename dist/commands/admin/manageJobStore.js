"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleManageJobStore = handleManageJobStore;
const discord_js_1 = require("discord.js");
const shopService_1 = require("../../services/shopService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const prisma_1 = __importDefault(require("../../utils/prisma"));
async function handleManageJobStore(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "Admins or Bot Commanders only.")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const searchName = args.join(" ");
    let targetItem;
    if (searchName) {
        targetItem = await prisma_1.default.shopItem.findFirst({
            where: {
                guildId: message.guildId,
                name: { contains: searchName, mode: "insensitive" },
                itemType: { in: ["JOB_CONSUMABLE", "JOB_GEAR"] }
            }
        });
        if (!targetItem)
            return message.reply("Job Store item not found.");
    }
    else {
        // Filter for Job Items
        const items = await prisma_1.default.shopItem.findMany({
            where: {
                guildId: message.guildId,
                itemType: { in: ["JOB_CONSUMABLE", "JOB_GEAR"] }
            }
        });
        if (items.length === 0)
            return message.reply("Job Shop is empty. Run `!jobstore` first to seed items.");
        // Select item
        const select = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId("manage_job_select")
            .setPlaceholder("Select a Job Store item...")
            .addOptions(items.map(i => new discord_js_1.StringSelectMenuOptionBuilder()
            .setLabel(i.name)
            .setValue(i.id)
            .setDescription(`${i.price} coins`)));
        const row = new discord_js_1.ActionRowBuilder().addComponents(select);
        const msg = await message.reply({ content: "Select an item to manage prices:", components: [row] });
        try {
            const selection = await msg.awaitMessageComponent({
                componentType: discord_js_1.ComponentType.StringSelect,
                time: 60000,
                filter: (i) => i.user.id === message.author.id
            });
            targetItem = items.find(i => i.id === selection.values[0]);
            await selection.deferUpdate();
        }
        catch {
            return msg.edit({ content: "Timed out.", components: [] });
        }
    }
    if (!targetItem)
        return message.reply("Error finding item.");
    const renderPanel = (item) => {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`💼 Managing: ${item.name}`)
            .setColor(discord_js_1.Colors.Orange)
            .addFields({ name: "Name", value: item.name, inline: true }, { name: "Price", value: (0, format_1.fmtCurrency)(item.price, emoji), inline: true }, { name: "Stock", value: item.stock === -1 ? "Infinite" : String(item.stock), inline: true }, { name: "Description", value: item.description || "None", inline: false });
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("edit_price").setLabel("Edit Price").setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setCustomId("edit_desc").setLabel("Edit Desc").setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("btn_done").setLabel("Done").setStyle(discord_js_1.ButtonStyle.Success));
        return { embeds: [embed], components: [row] };
    };
    const panelMsg = await message.reply(renderPanel(targetItem));
    const collector = panelMsg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 300000,
        filter: (i) => i.user.id === message.author.id
    });
    collector.on("collect", async (interaction) => {
        if (!targetItem)
            return;
        const btnId = interaction.customId;
        if (btnId === "btn_done") {
            await interaction.update({ components: [] });
            collector.stop();
            return;
        }
        let modalId = "";
        let fieldId = "";
        let label = "";
        let currentVal = String(btnId === "edit_price" ? targetItem.price : targetItem.description);
        let style = discord_js_1.TextInputStyle.Short;
        if (btnId === "edit_price") {
            modalId = "modal_job_price";
            fieldId = "val_price";
            label = "New Price";
        }
        else if (btnId === "edit_desc") {
            modalId = "modal_job_desc";
            fieldId = "val_desc";
            label = "New Description";
            style = discord_js_1.TextInputStyle.Paragraph;
        }
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId).setTitle(`Edit ${targetItem.name}`);
        const input = new discord_js_1.TextInputBuilder().setCustomId(fieldId).setLabel(label).setStyle(style).setValue(currentVal).setRequired(true);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        try {
            const submit = await interaction.awaitModalSubmit({
                time: 60000,
                filter: (i) => i.user.id === interaction.user.id && i.customId === modalId
            });
            const val = submit.fields.getTextInputValue(fieldId);
            const updates = {};
            if (modalId === "modal_job_price") {
                const p = parseInt(val);
                if (isNaN(p) || p < 0) {
                    await submit.reply({ content: "Invalid price", ephemeral: true });
                    return;
                }
                updates.price = p;
            }
            else {
                updates.description = val;
            }
            targetItem = await (0, shopService_1.updateShopItem)(message.guildId, targetItem.id, updates);
            await submit.deferUpdate();
            await panelMsg.edit(renderPanel(targetItem));
        }
        catch (err) {
            // Modal timeout or error
        }
    });
    collector.on("end", () => {
        if (panelMsg.editable)
            panelMsg.edit({ components: [] }).catch(() => { });
    });
}
//# sourceMappingURL=manageJobStore.js.map