import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { Mascot } from "../../config/branding";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleSetup(message: Message, args: string[]) {
    if (!message.guild) return;
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Permission Denied", "You need Administrator permissions to use this command.")] });
    }

    const config = await getGuildConfig(message.guild.id);

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Think} Server Setup Dashboard`)
        .setDescription("Welcome to the Casino Setup Dashboard. Use the buttons below to configure your server's economy, jobs, crime, and more.")
        .addFields(
            {
                name: `${Mascot.Emotes.MoneyBag} Economy`,
                value: `**Currency:** ${config.currencyEmoji} ${config.currencyName}\n**Start Money:** ${config.startMoney}\n**Bank Limit:** ${config.bankLimit || "Unlimited"}\n**Wallet Limit:** ${config.walletLimit || "Unlimited"}`,
                inline: true
            },
            {
                name: `${Mascot.Emotes.JobWorking} Jobs`,
                value: "Configure job sectors, base salaries, and level multipliers.",
                inline: true
            },
            {
                name: `${Mascot.Emotes.Alert} Crime`,
                value: `**Rob Chance:** ${config.robSuccessPct}%\n**Rob Fine:** ${config.robFinePct}%\n**Rob Cooldown:** ${config.robCooldown}s\n**Jail Fine:** ${config.jailFine}\n**Jail Time:** ${config.jailTime}s`,
                inline: true
            },
            {
                name: `${Mascot.Emotes.Money} Gambling`,
                value: `**Min Bet:** ${config.minBet}\n**Max Bet:** ${config.maxBet || "Unlimited"}`,
                inline: true
            },
            {
                name: `${Mascot.Emotes.Teacher} Education`,
                value: "Manage tuition fees, scholarship chances, and degree income boosts.",
                inline: true
            },
            {
                name: `${Mascot.Emotes.Channel} Chat Money`,
                value: `**Status:** ${config.chatMoneyEnabled ? "✅ On" : "❌ Off"}\n**Range:** ${config.chatMoneyMin}-${config.chatMoneyMax}\n**Interval:** ${config.chatMoneyInterval}s`,
                inline: true
            },
            {
                name: `${Mascot.Emotes.Graph} Cooldowns`,
                value: "Set cooldowns for Work, Crime, Study, and Games.",
                inline: true
            }
        )
        .setColor(Mascot.Colors.Base as any)
        .setFooter({ text: "Click a button below to edit settings" });

    const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("setup_general")
                .setLabel("General & Economy")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("setup_banking")
                .setLabel("Banking")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("setup_jobs")
                .setLabel("Jobs")
                .setStyle(ButtonStyle.Success)
        );

    const row2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("setup_crime")
                .setLabel("Crime")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("setup_gambling")
                .setLabel("Gambling")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("setup_education")
                .setLabel("Education")
                .setStyle(ButtonStyle.Primary)
        );

    const row3 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("setup_chatmoney")
                .setLabel("Chat Money")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("setup_cooldowns")
                .setLabel("Cooldowns")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("setup_next_steps")
                .setLabel("Next Steps")
                .setStyle(ButtonStyle.Success)
        );

    return message.reply({ embeds: [embed], components: [row1, row2, row3] });
}
