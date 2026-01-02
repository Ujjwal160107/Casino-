import {
    Message,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ChannelSelectMenuBuilder,
    UserSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Interaction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    UserSelectMenuInteraction,
    RoleSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    ModalSubmitInteraction,
    BaseSelectMenuBuilder
} from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig, updateGuildConfig } from "../../services/guildConfigService";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { getAllStocks, createStock, deleteStock, editStock, getStockById } from "../../services/stockService";

const MODULE_HOME = "module_home";
const MODULE_DISABLES = "module_disabled";
const MODULE_PERMS = "module_perms";
const MODULE_CHANNELS = "module_channels";
const MODULE_STOCKS = "module_stocks";

function getMainMenuRow() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("dashboard_menu")
        .setPlaceholder("Select a Management Module")
        .addOptions([
            { label: "Global Disables", value: MODULE_DISABLES, emoji: "1448573227151396978" },
            { label: "Granular Permissions", value: MODULE_PERMS, emoji: "1448573334320185440" },
            { label: "Casino Channels", value: MODULE_CHANNELS, emoji: "1448573411084210238" },
            { label: "Stock Market", value: MODULE_STOCKS, emoji: "📈" }
        ]);
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function getHomeButton() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("btn_home")
            .setLabel("Home")
            .setStyle(ButtonStyle.Primary)
    );
}

export async function handleAdminDashboard(message: Message) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Administrator permissions required.")] });
    }

    const dashboardEmbed = new EmbedBuilder()
        .setTitle("<a:shieldd:1448576304151793665> Casino Admin Dashboard")
        .setDescription("Select a module below to manage permissions and configurations.")
        .setColor("Gold")
        .addFields(
            { name: "<a:No_Entry_signnn:1448573227151396978> Global Disables", value: "Disable/Enable commands server-wide.", inline: true },
            { name: "<:lockk:1448573334320185440> Granular Permissions", value: "Allow specific users/roles to use commands.", inline: true },
            { name: "<:channel:1448573411084210238> Casino Channels", value: "Restrict bot usage to specific channels.", inline: true },
            { name: "📈 Stock Market", value: "Manage stocks, prices, and refresh rates.", inline: true }
        )
        .setFooter({ text: "Session expires in 10 minutes." });

    const row = getMainMenuRow();
    const reply = await message.reply({ embeds: [dashboardEmbed], components: [row] });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === message.author.id && i.customId === "dashboard_menu",
        time: 600000
    });

    const subCollector = reply.createMessageComponentCollector({
        filter: (i) => i.user.id === message.author.id && i.customId !== "dashboard_menu",
        time: 600000
    });

    collector.on("collect", async (interaction) => {
        const selection = interaction.values[0];
        switch (selection) {
            case MODULE_HOME:
                await renderHome(interaction);
                break;
            case MODULE_DISABLES:
                await renderDisablesModule(interaction, message.guildId!);
                break;
            case MODULE_PERMS:
                await renderPermsModule(interaction, message.guildId!);
                break;
            case MODULE_CHANNELS:
                await renderChannelsModule(interaction, message.guildId!);
                break;
            case MODULE_STOCKS:
                await renderStockModule(interaction, message.guildId!);
                break;
        }
    });

    subCollector.on("collect", async (interaction) => {
        if (interaction.customId === "btn_home" && interaction.isButton()) {
            await renderHome(interaction);
            return;
        }
        // Stocks
        if (interaction.customId === "btn_stock_add") await handleStockAddBtn(interaction);
        if (interaction.customId === "btn_stock_config") await handleStockConfigBtn(interaction);
        if (interaction.customId === "select_stock_manage" && interaction.isStringSelectMenu()) await handleStockManageSelect(interaction);
        if (interaction.customId.startsWith("btn_stock_delete_")) {
            const stockId = interaction.customId.replace("btn_stock_delete_", "");
            await deleteStock(stockId);
            await interaction.reply({ content: "Stock deleted.", ephemeral: true });
            await renderStockModule(interaction, message.guildId!);
        }
        if (interaction.customId.startsWith("btn_stock_edit_")) await handleStockEditBtn(interaction);
        if (interaction.customId === "btn_stock_home") await renderStockModule(interaction, message.guildId!);


        if (interaction.customId.startsWith("btn_disable_cmd")) await handleDisableBtn(interaction);
        if (interaction.customId === "select_enable_cmd" && interaction.isStringSelectMenu()) await handleEnableSelect(interaction);
        if (interaction.customId === "btn_add_channel") await handleChannelAddBtn(interaction);
        if (interaction.customId === "select_remove_channel" && interaction.isStringSelectMenu()) await handleChannelRemove(interaction);
        if (interaction.customId === "btn_add_perm") await handleAddPermBtn(interaction);
        if (interaction.customId.startsWith("select_perm_user_") && interaction.isUserSelectMenu()) await handlePermUserSelect(interaction);
        if (interaction.customId.startsWith("select_perm_role_") && interaction.isRoleSelectMenu()) await handlePermRoleSelect(interaction);
        if (interaction.customId.startsWith("select_perm_channel_") && interaction.isChannelSelectMenu()) await handlePermChannelSelect(interaction);
        if (interaction.customId === "btn_remove_perm_view" && interaction.isButton()) await handleRemovePermView(interaction);
        if (interaction.customId === "select_remove_perm" && interaction.isStringSelectMenu()) await handleRemovePermSelect(interaction);
    });

    collector.on("end", () => {
        reply.edit({ components: [] }).catch(() => { });
    });
}

async function renderDisablesModule(interaction: StringSelectMenuInteraction, guildId: string) {
    const config = await getGuildConfig(guildId);
    const disabled = config.disabledCommands || [];

    const embed = new EmbedBuilder()
        .setTitle("<a:No_Entry_signnn:1448573227151396978> Global Disabled Commands")
        .setDescription(disabled.length > 0 ? disabled.map((c: string) => `• \`${c}\``).join("\n") : "No commands are disabled.")
        .setColor(disabled.length > 0 ? "Red" : "Green");

    const btnRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder().setCustomId("btn_disable_cmd").setLabel("Disable New Command").setStyle(ButtonStyle.Danger)
        );

    const components: any[] = [btnRow];

    if (disabled.length > 0) {
        const enableSelect = new StringSelectMenuBuilder()
            .setCustomId("select_enable_cmd")
            .setPlaceholder("Select command to ENABLE")
            .addOptions(disabled.map((c: string) => ({ label: c, value: c })));
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(enableSelect));
    }

    components.push(getHomeButton());
    components.push(getMainMenuRow());
    await interaction.update({ embeds: [embed], components });
}

async function handleDisableBtn(interaction: Interaction) {
    if (!interaction.isButton()) return;

    const modal = new ModalBuilder()
        .setCustomId("modal_disable_cmd")
        .setTitle("Disable Command");

    const input = new TextInputBuilder()
        .setCustomId("input_cmd_name")
        .setLabel("Command Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. ping, shop, rob")
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.user.id === interaction.user.id }).catch(() => null);

    if (submitted) {
        const cmd = submitted.fields.getTextInputValue("input_cmd_name").toLowerCase();

        if (["disable", "enable", "adminpanel", "dashboard", "help"].includes(cmd)) {
            return submitted.reply({ content: "You cannot disable critical admin commands.", ephemeral: true });
        }

        const config = await getGuildConfig(submitted.guildId!);
        if (config.disabledCommands.includes(cmd)) {
            return submitted.reply({ content: `\`${cmd}\` is already disabled.`, ephemeral: true });
        }

        await updateGuildConfig(submitted.guildId!, { disabledCommands: { push: cmd } });

        const newConfig = await getGuildConfig(submitted.guildId!);
        const newDisabled = newConfig.disabledCommands;

        const embed = new EmbedBuilder()
            .setTitle("<a:No_Entry_signnn:1448573227151396978> Global Disabled Commands")
            .setDescription(newDisabled.length > 0 ? newDisabled.map((c: string) => `• \`${c}\``).join("\n") : "None")
            .setColor("Red");

        const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("btn_disable_cmd").setLabel("Disable New Command").setStyle(ButtonStyle.Danger).setEmoji("🛑")
        );

        const components: any[] = [btnRow];

        if (newDisabled.length > 0) {
            components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder().setCustomId("select_enable_cmd").setPlaceholder("Select command to ENABLE").addOptions(newDisabled.map((c: string) => ({ label: c, value: c })))
            ));
        }

        components.push(getHomeButton());
        components.push(getMainMenuRow());

        try {
            await (submitted as any).update({ embeds: [embed], components });
        } catch (e) {
            await submitted.reply({ embeds: [embed], components, ephemeral: true });
        }
    }
}

async function handleEnableSelect(interaction: StringSelectMenuInteraction) {
    const cmd = interaction.values[0];
    const guildId = interaction.guildId!;
    const config = await getGuildConfig(guildId);
    const newDisabled = config.disabledCommands.filter((c: string) => c !== cmd);
    await updateGuildConfig(guildId, { disabledCommands: newDisabled });
    await renderDisablesModule(interaction, guildId);
}

async function renderChannelsModule(interaction: Interaction, guildId: string) {
    const config = await getGuildConfig(guildId);
    const channels = config.casinoChannels || [];

    const embed = new EmbedBuilder()
        .setTitle("<:channel:1448573411084210238> Casino Channels")
        .setDescription(channels.length > 0 ? channels.map((c: string) => `• <#${c}>`).join("\n") : "Bot listens in ALL channels (No restriction).")
        .setColor("Blue");

    const rowAdd = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("btn_add_channel").setLabel("Add Channel WhiteList").setStyle(ButtonStyle.Success)
    );

    const components: any[] = [rowAdd];

    if (channels.length > 0) {
        const removeSelect = new StringSelectMenuBuilder()
            .setCustomId("select_remove_channel")
            .setPlaceholder("Select channel to Remove from Whitelist")
            .addOptions(channels.map((c: string) => ({ label: `Channel ${c}`, value: c })));

        const options = channels.map((c: string) => {
            const ch = interaction.guild?.channels.cache.get(c);
            return {
                label: ch ? `#${ch.name}` : `ID: ${c}`,
                value: c
            };
        });

        removeSelect.setOptions(options);
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect));
    }

    components.push(getHomeButton());
    components.push(getMainMenuRow());

    if (interaction.isMessageComponent()) {
        await interaction.update({ embeds: [embed], components });
    }
}

async function handleChannelAddBtn(interaction: Interaction) {
    if (!interaction.isButton()) return;

    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder().setCustomId("select_channel_add").setPlaceholder("Select Channel to Whitelist").addChannelTypes(0)
    );

    const reply = await interaction.reply({ content: "Select a channel to add.", components: [row], ephemeral: true, fetchReply: true });
    const selection = await reply.awaitMessageComponent({ time: 60000 }).catch(() => null);

    if (!selection || !selection.isChannelSelectMenu()) return;

    const chId = selection.values[0];
    const config = await getGuildConfig(interaction.guildId!);

    if (config.casinoChannels.length >= 10) return selection.update({ content: "Max 10 channels allowed.", components: [] });

    if (!config.casinoChannels.includes(chId)) {
        await updateGuildConfig(interaction.guildId!, { casinoChannels: { push: chId } });
        await selection.update({ content: `Added <#${chId}> to whitelist.`, components: [] });
    } else {
        await selection.update({ content: "Channel already whitelisted.", components: [] });
    }
}

async function handleChannelRemove(interaction: StringSelectMenuInteraction) {
    const chId = interaction.values[0];
    const config = await getGuildConfig(interaction.guildId!);
    const newCh = config.casinoChannels.filter((c: string) => c !== chId);
    await updateGuildConfig(interaction.guildId!, { casinoChannels: newCh });
    await renderChannelsModule(interaction, interaction.guildId!);
}

async function renderPermsModule(interaction: Interaction, guildId: string) {
    const perms = await prisma.commandPermission.findMany({
        where: { guildId },
        take: 15,
        orderBy: { id: 'desc' }
    });

    const list = perms.map(p => {
        let mention = `<@${p.targetId}>`;
        if (p.targetType === "ROLE") mention = `<@&${p.targetId}>`;
        if (p.targetType === "CHANNEL") mention = `<#${p.targetId}>`;
        return `• **${p.command}** -> ${p.action} for ${p.targetType} ${mention}`;
    }).join("\n");

    const embed = new EmbedBuilder()
        .setTitle("<:lockk:1448573334320185440> Granular Permissions (Last 15)")
        .setDescription(list || "No specific permissions set.")
        .setColor("Orange");

    const rowBtns = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("btn_add_perm").setLabel("Add Permission").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("btn_remove_perm_view").setLabel("Remove Permissions").setStyle(ButtonStyle.Danger)
    );

    const components: any[] = [rowBtns];

    if (perms.length > 0) {
        const removeOptions = await Promise.all(perms.map(async p => {
            let targetName = p.targetId;
            try {
                if (p.targetType === "USER") {
                    const m = await interaction.guild?.members.fetch(p.targetId).catch(() => null);
                    if (m) targetName = m.user.username;
                } else if (p.targetType === "ROLE") {
                    const r = await interaction.guild?.roles.fetch(p.targetId).catch(() => null);
                    if (r) targetName = r.name;
                } else if (p.targetType === "CHANNEL") {
                    const c = await interaction.guild?.channels.fetch(p.targetId).catch(() => null);
                    if (c) targetName = `#${c.name}`;
                }
            } catch { }

            return {
                label: `${p.command} (${targetName})`,
                value: p.id.toString(),
                description: `Type: ${p.targetType} | Action: ${p.action}`
            };
        }));

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId("select_remove_perm").setPlaceholder("Select Permission to Remove").addOptions(removeOptions)
        ));
    }

    components.push(getHomeButton());
    components.push(getMainMenuRow());

    if (interaction.isMessageComponent()) {
        await interaction.update({ embeds: [embed], components });
    }
}

async function handleAddPermBtn(interaction: Interaction) {
    if (!interaction.isButton()) return;

    const modal = new ModalBuilder().setCustomId("modal_perm_cmd").setTitle("Add Permission");
    const input = new TextInputBuilder().setCustomId("perm_cmd").setLabel("Command Name").setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.user.id === interaction.user.id }).catch(() => null);

    if (submitted) {
        const cmd = submitted.fields.getTextInputValue("perm_cmd").toLowerCase().trim();

        const rowU = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder().setCustomId(`select_perm_user_${cmd}`).setPlaceholder("Select User to Allow")
        );

        const rowR = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder().setCustomId(`select_perm_role_${cmd}`).setPlaceholder("Select Role to Allow")
        );

        const rowC = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`select_perm_channel_${cmd}`).setPlaceholder("Select Channel to Allow Override(s)").addChannelTypes(0)
        );

        const rowBack = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("btn_remove_perm_view").setLabel("Back to Permissions").setStyle(ButtonStyle.Secondary)
        );

        try {
            await (submitted as any).update({
                content: `**Add Permission for command:** \`${cmd}\`\nSelect a target User, Role, or Channel below.`,
                embeds: [],
                components: [rowU, rowR, rowC, rowBack]
            });
        } catch (e) {
            console.error("Failed to update dashboard inline:", e);
        }
    }
}

async function handlePermUserSelect(interaction: UserSelectMenuInteraction) {
    const cmd = interaction.customId.replace("select_perm_user_", "");
    const targetId = interaction.values[0];

    await prisma.commandPermission.upsert({
        where: { guildId_command_targetType_targetId: { guildId: interaction.guildId!, command: cmd, targetType: "USER", targetId } },
        create: { guildId: interaction.guildId!, command: cmd, targetType: "USER", targetId, action: "ALLOW" },
        update: { action: "ALLOW" }
    });

    await renderPermsModule(interaction, interaction.guildId!);
}

async function handlePermRoleSelect(interaction: RoleSelectMenuInteraction) {
    const cmd = interaction.customId.replace("select_perm_role_", "");
    const targetId = interaction.values[0];

    await prisma.commandPermission.upsert({
        where: { guildId_command_targetType_targetId: { guildId: interaction.guildId!, command: cmd, targetType: "ROLE", targetId } },
        create: { guildId: interaction.guildId!, command: cmd, targetType: "ROLE", targetId, action: "ALLOW" },
        update: { action: "ALLOW" }
    });

    await renderPermsModule(interaction, interaction.guildId!);
}

async function handlePermChannelSelect(interaction: ChannelSelectMenuInteraction) {
    const cmd = interaction.customId.replace("select_perm_channel_", "");
    const targetId = interaction.values[0];

    await prisma.commandPermission.upsert({
        where: { guildId_command_targetType_targetId: { guildId: interaction.guildId!, command: cmd, targetType: "CHANNEL", targetId } },
        create: { guildId: interaction.guildId!, command: cmd, targetType: "CHANNEL", targetId, action: "ALLOW" },
        update: { action: "ALLOW" }
    });

    await renderPermsModule(interaction, interaction.guildId!);
}

async function handleRemovePermSelect(interaction: StringSelectMenuInteraction) {
    const permId = interaction.values[0];
    await prisma.commandPermission.delete({ where: { id: permId } }).catch(() => { });
    await renderPermsModule(interaction, interaction.guildId!);
}

async function handleRemovePermView(interaction: ButtonInteraction) {
    await renderPermsModule(interaction, interaction.guildId!);
}

async function renderHome(interaction: Interaction) {
    const dashboardEmbed = new EmbedBuilder()
        .setTitle("<a:shieldd:1448576304151793665> Casino Admin Dashboard")
        .setDescription("Select a module below to manage permissions and configurations.")
        .setColor("Gold")
        .addFields(
            { name: "<a:No_Entry_signnn:1448573227151396978> Global Disables", value: "Disable/Enable commands server-wide.", inline: true },
            { name: "<:lockk:1448573334320185440> Granular Permissions", value: "Allow specific users/roles/channels to use commands.", inline: true },
            { name: "<:channel:1448573411084210238> Casino Channels", value: "Restrict bot usage to specific channels.", inline: true },
            { name: "📈 Stock Market", value: "Manage stocks, prices, and refresh rates.", inline: true }
        )
        .setFooter({ text: "Session expires in 10 minutes." });

    const row = getMainMenuRow();

    if (interaction.isMessageComponent()) {
        await interaction.update({ embeds: [dashboardEmbed], components: [row] });
    }
}


// --- STOCK MARKET MODULE ---

async function renderStockModule(interaction: Interaction, guildId: string) {
    const stocks = await getAllStocks(guildId);
    const config = await getGuildConfig(guildId);
    const refreshRate = config.stockRefreshRate || 600;

    const list = stocks.length > 0
        ? stocks.map(s => `• **${s.symbol}** (${s.name}) - $${s.currentPrice} (Vol: ${s.volatility}%)`).join("\n")
        : "No stocks found. Defaults will initialize on first command use, or add one below.";

    const embed = new EmbedBuilder()
        .setTitle("📈 Stock Market Administration")
        .setDescription(`**Refresh Rate:** Every ${refreshRate / 60} minutes\n\n**Current Stocks:**\n${list}`)
        .setColor("Green");

    const rowBtns = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("btn_stock_add").setLabel("Add Custom Stock").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("btn_stock_config").setLabel("Set Refresh Rate").setStyle(ButtonStyle.Secondary)
    );

    const components: any[] = [rowBtns];

    if (stocks.length > 0) {
        const stockOptions = stocks.map(s => ({
            label: `${s.symbol} ($${s.currentPrice})`,
            value: s.id,
            description: `Vol: ${s.volatility}%`
        })).slice(0, 25); // Max 25

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId("select_stock_manage").setPlaceholder("Select Stock to Edit/Delete").addOptions(stockOptions)
        ));
    }

    components.push(getHomeButton());
    components.push(getMainMenuRow());

    if (interaction.isMessageComponent()) {
        try {
            await interaction.update({ embeds: [embed], components });
        } catch (e) {
            // fallback if already replied
            await interaction.editReply({ embeds: [embed], components });
        }
    }
}

async function handleStockAddBtn(interaction: ButtonInteraction) {
    const modal = new ModalBuilder().setCustomId("modal_stock_add").setTitle("Add New Stock");

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("s_symbol").setLabel("Symbol (e.g. BTC)").setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("s_name").setLabel("Company Name").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("s_price").setLabel("Starting Price").setStyle(TextInputStyle.Short).setPlaceholder("100").setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("s_vol").setLabel("Volatility % (1-50)").setStyle(TextInputStyle.Short).setPlaceholder("5").setRequired(true))
    );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.user.id === interaction.user.id }).catch(() => null);
    if (!submitted) return;

    try {
        const symbol = submitted.fields.getTextInputValue("s_symbol");
        const name = submitted.fields.getTextInputValue("s_name");
        const price = parseInt(submitted.fields.getTextInputValue("s_price"));
        const vol = parseInt(submitted.fields.getTextInputValue("s_vol"));

        if (isNaN(price) || isNaN(vol)) return submitted.reply({ content: "Price and Volatility must be numbers.", ephemeral: true });

        await createStock(submitted.guildId!, symbol, name, price, vol);
        await submitted.deferUpdate();
        await renderStockModule(interaction, submitted.guildId!);
    } catch (e: any) {
        await submitted.reply({ content: `Error: ${e.message}`, ephemeral: true });
    }
}

async function handleStockConfigBtn(interaction: ButtonInteraction) {
    const modal = new ModalBuilder().setCustomId("modal_stock_config").setTitle("Configure Stock Market");

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("s_rate").setLabel("Refresh Rate (Minutes)").setStyle(TextInputStyle.Short).setPlaceholder("10").setRequired(true))
    );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.user.id === interaction.user.id }).catch(() => null);
    if (!submitted) return;

    const mins = parseInt(submitted.fields.getTextInputValue("s_rate"));
    if (isNaN(mins) || mins < 1) return submitted.reply({ content: "Invalid rate. Minimum 1 minute.", ephemeral: true });

    await updateGuildConfig(submitted.guildId!, { stockRefreshRate: mins * 60 });
    await submitted.deferUpdate();
    await renderStockModule(interaction, submitted.guildId!);
}

async function handleStockManageSelect(interaction: StringSelectMenuInteraction) {
    const stockId = interaction.values[0];
    const stock = await getStockById(stockId);

    if (!stock) return interaction.reply({ content: "Stock not found.", ephemeral: true });

    const embed = new EmbedBuilder()
        .setTitle(`Manage Stock: ${stock.symbol}`)
        .setDescription(`**Name:** ${stock.name}\n**Price:** $${stock.currentPrice}\n**Volatility:** ${stock.volatility}%\n**Base Price:** $${stock.basePrice}`)
        .setColor("Blue");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`btn_stock_edit_${stock.id}`).setLabel("Edit Price/Vol").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`btn_stock_delete_${stock.id}`).setLabel("Delete Stock").setStyle(ButtonStyle.Danger)
    );



    await interaction.update({ embeds: [embed], components: [row, new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("btn_stock_home").setLabel("Back").setStyle(ButtonStyle.Secondary))] });
}

async function handleStockEditBtn(interaction: ButtonInteraction) {
    const stockId = interaction.customId.replace("btn_stock_edit_", "");
    const stock = await getStockById(stockId);
    if (!stock) return interaction.reply({ content: "Stock not found.", ephemeral: true });

    const modal = new ModalBuilder().setCustomId(`modal_stock_edit_${stockId}`).setTitle(`Edit ${stock.symbol}`);
    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("e_price").setLabel("New Price").setStyle(TextInputStyle.Short).setValue(stock.currentPrice.toString()).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("e_vol").setLabel("New Volatility").setStyle(TextInputStyle.Short).setValue(stock.volatility.toString()).setRequired(true))
    );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.user.id === interaction.user.id }).catch(() => null);
    if (!submitted) return;

    const price = parseInt(submitted.fields.getTextInputValue("e_price"));
    const vol = parseInt(submitted.fields.getTextInputValue("e_vol"));

    if (isNaN(price) || isNaN(vol)) return submitted.reply({ content: "Invalid numbers.", ephemeral: true });

    await editStock(stockId, { currentPrice: price, volatility: vol });
    await submitted.deferUpdate();
    await renderStockModule(interaction, submitted.guildId!);
}