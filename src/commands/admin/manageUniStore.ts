import {
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ComponentType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Colors,
    StringSelectMenuInteraction,
    CacheType
} from "discord.js";
import { updateShopItem, deleteShopItem } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { ItemEffect } from "../../services/effectService";
import prisma from "../../utils/prisma";

export async function handleManageUniStore(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Admins or Bot Commanders only.")] });
    }

    const config = await getGuildConfig(message.guildId!);
    const emoji = config.currencyEmoji;
    const searchName = args.join(" ");
    let targetItem: any;

    if (searchName) {
        targetItem = await prisma.shopItem.findFirst({
            where: {
                guildId: message.guildId!,
                name: { contains: searchName, mode: "insensitive" },
                // Ensure it's a uni item if strict, but maybe allow generic search too? 
                // Let's stick to strict to avoid confusion.
                itemType: { in: ["UNI_BOOK", "CONSUMABLE"] }
            }
        });
        if (!targetItem) return message.reply("Uni Store item not found.");
    } else {
        // Filter for Uni Items
        const items = await prisma.shopItem.findMany({
            where: {
                guildId: message.guildId!,
                itemType: { in: ["UNI_BOOK", "CONSUMABLE"] },
                name: { in: ["Standard Textbook", "Advanced Guide", "Energy Drink", "Cheat Sheet"] }
            }
        });

        if (items.length === 0) return message.reply("Uni Shop is empty. Run `!unistore` first to seed items.");

        // Select item
        const select = new StringSelectMenuBuilder()
            .setCustomId("manage_uni_select")
            .setPlaceholder("Select a Uni Store item...")
            .addOptions(items.map(i =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(i.name)
                    .setValue(i.id)
                    .setDescription(`${i.price} coins`)
            ));

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
        const msg = await message.reply({ content: "Select an item to manage prices:", components: [row] });

        try {
            const selection = await msg.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                time: 60000,
                filter: (i: StringSelectMenuInteraction<CacheType>) => i.user.id === message.author.id
            });

            targetItem = items.find(i => i.id === selection.values[0]);
            await selection.deferUpdate();
        } catch {
            return msg.edit({ content: "Timed out.", components: [] });
        }
    }

    if (!targetItem) return message.reply("Error finding item.");

    // For Uni Store, we mainly care about Price and Stock (though stock is usually infinite).
    // Simplified view compared to full ManageShop.

    const renderPanel = (item: any) => {
        const embed = new EmbedBuilder()
            .setTitle(`🎓 Managing: ${item.name}`)
            .setColor(Colors.Blue)
            .addFields(
                { name: "Name", value: item.name, inline: true },
                { name: "Price", value: fmtCurrency(item.price, emoji), inline: true },
                { name: "Stock", value: item.stock === -1 ? "Infinite" : String(item.stock), inline: true },
                { name: "Description", value: item.description || "None", inline: false }
            );

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("edit_price").setLabel("Edit Price").setStyle(ButtonStyle.Primary).setEmoji("💰"),
            new ButtonBuilder().setCustomId("edit_desc").setLabel("Edit Desc").setStyle(ButtonStyle.Secondary).setEmoji("📝"),
            new ButtonBuilder().setCustomId("btn_done").setLabel("Done").setStyle(ButtonStyle.Success)
        );

        return { embeds: [embed], components: [row] };
    };

    const panelMsg = await message.reply(renderPanel(targetItem));

    const collector = panelMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300_000,
        filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
        if (!targetItem) return;
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
        let style = TextInputStyle.Short;

        if (btnId === "edit_price") { modalId = "modal_uni_price"; fieldId = "val_price"; label = "New Price"; }
        else if (btnId === "edit_desc") { modalId = "modal_uni_desc"; fieldId = "val_desc"; label = "New Description"; style = TextInputStyle.Paragraph; }

        const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Edit ${targetItem.name}`);
        const input = new TextInputBuilder().setCustomId(fieldId).setLabel(label).setStyle(style).setValue(currentVal).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

        await interaction.showModal(modal);

        try {
            const submit = await interaction.awaitModalSubmit({
                time: 60000,
                filter: (i) => i.user.id === interaction.user.id && i.customId === modalId
            });

            const val = submit.fields.getTextInputValue(fieldId);
            const updates: any = {};

            if (modalId === "modal_uni_price") {
                const p = parseInt(val);
                if (isNaN(p) || p < 0) { await submit.reply({ content: "Invalid price", ephemeral: true }); return; }
                updates.price = p;
            } else {
                updates.description = val;
            }

            targetItem = await updateShopItem(message.guildId!, targetItem.id, updates);
            await submit.deferUpdate();
            await panelMsg.edit(renderPanel(targetItem));

        } catch (err) {
            // Modal timeout or error
        }
    });

    collector.on("end", () => {
        if (panelMsg.editable) panelMsg.edit({ components: [] }).catch(() => { });
    });
}
