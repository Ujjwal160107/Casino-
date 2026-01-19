import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { ensureBankForUser } from "../../services/bankService";
import { getGuildConfig, updateGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin restricted commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub.setName("add-money")
            .setDescription("Add money to a user's wallet or bank")
            .addUserOption(opt => opt.setName("user").setDescription("Target user").setRequired(true))
            .addStringOption(opt => opt.setName("amount").setDescription("Amount to add").setRequired(true))
            .addStringOption(opt => opt.setName("target").setDescription("Wallet or Bank").setRequired(false).addChoices(
                { name: "Wallet", value: "wallet" },
                { name: "Bank", value: "bank" }
            ))
    )
    .addSubcommand(sub =>
        sub.setName("set-income")
            .setDescription("Configure income commands")
            .addStringOption(opt => opt.setName("command").setDescription("Command to config (work, beg, crime, rob)").setRequired(true).addChoices(
                { name: "Work", value: "work" },
                { name: "Beg", value: "beg" },
                { name: "Crime", value: "crime" },
                { name: "Rob", value: "rob" }
            ))
            .addStringOption(opt => opt.setName("field").setDescription("Field to update").setRequired(true).addChoices(
                { name: "Min Pay", value: "min" },
                { name: "Max Pay", value: "max" },
                { name: "Cooldown (sec)", value: "cooldown" },
                { name: "Success Rate (%)", value: "success" },
                { name: "Penalty (%)", value: "penalty" }
            ))
            .addNumberOption(opt => opt.setName("value").setDescription("New value").setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName("setup")
            .setDescription("Open the Setup Dashboard")
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const config = await getGuildConfig(interaction.guildId!);
    const emoji = config.currencyEmoji;

    // Additional Check for Bot Commander / Admin (though slash has default permissions, we can enforce DB role checks too if needed, but for now Default is safer)
    // if (!await canExecuteAdminCommandInt(interaction)) ...

    if (sub === "setup") {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Think} Server Setup Dashboard`)
            .setDescription("Welcome to the Casino Setup Dashboard. Use the buttons below to configure your server.")
            .addFields(
                { name: "Economy", value: `Currency: ${config.currencyEmoji}\nStart: ${config.startMoney}`, inline: true },
                { name: "Jobs", value: "Configure sectors & salaries", inline: true },
                { name: "Crime", value: `Rob Chance: ${config.robSuccessPct}%`, inline: true }
            )
            .setColor(Mascot.Colors.Base as any);

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("setup_general").setLabel("General").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("setup_banking").setLabel("Banking").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("setup_jobs").setLabel("Jobs").setStyle(ButtonStyle.Success)
        );
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("setup_crime").setLabel("Crime").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("setup_gambling").setLabel("Gambling").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("setup_education").setLabel("Education").setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({ embeds: [embed], components: [row1, row2] });
    }

    if (sub === "add-money") {
        const targetUser = interaction.options.getUser("user", true);
        const amountStr = interaction.options.getString("amount", true);
        const targetType = interaction.options.getString("target") || "wallet";
        await interaction.deferReply();

        const amount = parseSmartAmount(amountStr);
        if (isNaN(amount) || amount <= 0) {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive number.")] });
        }

        const target = await ensureUserAndWallet(targetUser.id, interaction.guildId!, targetUser.username);
        const MAX_INT = 2147483647;
        const safeAmount = amount > MAX_INT ? MAX_INT : amount;

        if (targetType === "bank") {
            const bank = await ensureBankForUser(target.id);
            const [_, updatedBank] = await prisma.$transaction([
                prisma.transaction.create({
                    data: { walletId: target.wallet!.id, amount: safeAmount, type: "admin_add_bank", meta: { by: interaction.user.id }, isEarned: false }
                }),
                prisma.bank.update({ where: { id: bank.id }, data: { balance: { increment: safeAmount } } }),
                prisma.audit.create({
                    data: { guildId: interaction.guildId!, userId: target.id, type: "admin_add", meta: { amount: safeAmount, target: "bank", by: interaction.user.id } }
                })
            ]);
            await logToChannel(interaction.client, {
                guild: interaction.guild!, type: "ADMIN", title: "Money Added (Bank)",
                description: `**Admin:** ${interaction.user.tag}\n**Target:** ${targetUser.tag}\n**Amount:** +${fmtCurrency(safeAmount, emoji)}`,
                color: 0x00FF00
            });
            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Money Added", `Added **${fmtCurrency(safeAmount, emoji)}** to ${targetUser}'s **Bank**.`)] });
        } else {
            const [_, updatedWallet] = await prisma.$transaction([
                prisma.transaction.create({
                    data: { walletId: target.wallet!.id, amount: safeAmount, type: "admin_add", meta: { by: interaction.user.id }, isEarned: false }
                }),
                prisma.wallet.update({ where: { id: target.wallet!.id }, data: { balance: { increment: safeAmount } } }),
                prisma.audit.create({
                    data: { guildId: interaction.guildId!, userId: target.id, type: "admin_add", meta: { amount: safeAmount, target: "wallet", by: interaction.user.id } }
                })
            ]);
            await logToChannel(interaction.client, {
                guild: interaction.guild!, type: "ADMIN", title: "Money Added (Wallet)",
                description: `**Admin:** ${interaction.user.tag}\n**Target:** ${targetUser.tag}\n**Amount:** +${fmtCurrency(safeAmount, emoji)}`,
                color: 0x00FF00
            });
            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Money Added", `Added **${fmtCurrency(safeAmount, emoji)}** to ${targetUser}'s **Wallet**.`)] });
        }
    }

    if (sub === "set-income") {
        const cmd = interaction.options.getString("command", true);
        const field = interaction.options.getString("field", true);
        const val = interaction.options.getNumber("value", true);
        await interaction.deferReply();

        const updates: any = {};
        if (field === "min") updates.minPay = Math.floor(val);
        else if (field === "max") updates.maxPay = Math.floor(val);
        else if (field === "cooldown") updates.cooldown = Math.floor(val);
        else if (field === "success") updates.successPct = Math.floor(val);
        else if (field === "penalty") updates.failPenaltyPct = Math.floor(val);

        if (cmd === "rob") {
            const guildUpdates: any = {};
            if (field === "cooldown") guildUpdates.robCooldown = updates.cooldown;
            else if (field === "success") guildUpdates.robSuccessPct = updates.successPct;
            else if (field === "penalty") guildUpdates.robFinePct = updates.failPenaltyPct;
            else return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Not Supported", "For 'rob', only cooldown, success, and penalty are valid.")] });

            await updateGuildConfig(interaction.guildId!, guildUpdates);
            return interaction.editReply({ embeds: [successEmbed(interaction.user, "Rob Config Updated", `Updated **rob**: ${field}=${val}`)] });
        }

        await prisma.incomeConfig.upsert({
            where: { guildId_commandKey: { guildId: interaction.guildId!, commandKey: cmd } },
            create: {
                guildId: interaction.guildId!, commandKey: cmd,
                minPay: updates.minPay ?? 50, maxPay: updates.maxPay ?? 150,
                cooldown: updates.cooldown ?? 60, successPct: updates.successPct ?? 100, failPenaltyPct: updates.failPenaltyPct ?? 50
            },
            update: updates
        });
        return interaction.editReply({ embeds: [successEmbed(interaction.user, "Config Updated", `**${cmd}** updated: ${field}=${val}`)] });
    }
}
