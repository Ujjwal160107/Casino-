"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetup = handleSetup;
const discord_js_1 = require("discord.js");
const branding_1 = require("../../config/branding");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const guildConfigService_1 = require("../../services/guildConfigService");
async function handleSetup(message, args) {
    if (!message.guild)
        return;
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Permission Denied", "You need Administrator permissions to use this command.")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${branding_1.Mascot.Emotes.Think} Server Setup Dashboard`)
        .setDescription("Welcome to the Casino Setup Dashboard. Use the buttons below to configure your server's economy, jobs, crime, and more.")
        .addFields({
        name: `${branding_1.Mascot.Emotes.MoneyBag} Economy`,
        value: `**Currency:** ${config.currencyEmoji} ${config.currencyName}\n**Start Money:** ${config.startMoney}\n**Bank Limit:** ${config.bankLimit || "Unlimited"}\n**Wallet Limit:** ${config.walletLimit || "Unlimited"}`,
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.JobWorking} Jobs`,
        value: "Configure job sectors, base salaries, and level multipliers.",
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.Alert} Crime`,
        value: `**Rob Chance:** ${config.robSuccessPct}%\n**Rob Fine:** ${config.robFinePct}%\n**Rob Cooldown:** ${config.robCooldown}s`,
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.Money} Gambling`,
        value: `**Min Bet:** ${config.minBet}\n**Max Bet:** ${config.maxBet || "Unlimited"}`,
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.Teacher} Education`,
        value: "Manage tuition fees, scholarship chances, and degree income boosts.",
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.Graph} Cooldowns`,
        value: "Set cooldowns for Work, Crime, Study, and Games.",
        inline: true
    })
        .setColor(branding_1.Mascot.Colors.Base)
        .setFooter({ text: "Click a button below to edit settings" });
    const row1 = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("setup_general")
        .setLabel("General & Economy")
        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
        .setCustomId("setup_banking")
        .setLabel("Banking")
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId("setup_jobs")
        .setLabel("Jobs")
        .setStyle(discord_js_1.ButtonStyle.Success));
    const row2 = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("setup_crime")
        .setLabel("Crime")
        .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
        .setCustomId("setup_gambling")
        .setLabel("Gambling")
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId("setup_education")
        .setLabel("Education")
        .setStyle(discord_js_1.ButtonStyle.Primary));
    const row3 = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("setup_cooldowns")
        .setLabel("Cooldowns")
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId("setup_next_steps")
        .setLabel("Next Steps")
        .setStyle(discord_js_1.ButtonStyle.Success));
    return message.reply({ embeds: [embed], components: [row1, row2, row3] });
}
//# sourceMappingURL=setup.js.map