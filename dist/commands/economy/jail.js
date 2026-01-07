"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleJail = handleJail;
exports.handleBail = handleBail;
const discord_js_1 = require("discord.js");
const guildConfigService_1 = require("../../services/guildConfigService");
const jailService_1 = require("../../services/jailService");
const walletService_1 = require("../../services/walletService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";
async function handleJail(message) {
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    const status = await (0, jailService_1.checkJailStatus)(user.id);
    if (!status.isJailed) {
        return message.reply({
            embeds: [(0, embed_1.infoEmbed)(message.author, "Clean Record", "You are currently **not** in jail.")]
        });
    }
    const timeLeft = status.releaseTime ? Math.max(0, status.releaseTime.getTime() - Date.now()) : 0;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${POLICE_EMOTE} JAIL STATUS`)
        .setDescription(`You are currently incarcerated.`)
        .addFields({ name: "Release In", value: status.releaseTime ? `<t:${Math.floor(status.releaseTime.getTime() / 1000)}:R>` : "N/A", inline: true }, { name: "Bail Cost", value: (0, format_1.fmtCurrency)(config.jailFine, config.currencyEmoji), inline: true })
        .setColor(0xFF0000)
        .setThumbnail("https://cdn.discordapp.com/emojis/1457053051582939237.png")
        .setFooter({ text: `Type ${config.prefix}bail to pay the fine and leave.` });
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("pay_bail")
        .setLabel(`Pay Bail (${(0, format_1.fmtCurrency)(config.jailFine, "")})`)
        .setStyle(discord_js_1.ButtonStyle.Danger));
    return message.reply({ embeds: [embed], components: [row] });
}
async function handleBail(message) {
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    const status = await (0, jailService_1.checkJailStatus)(user.id);
    if (!status.isJailed) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Not Jailed", "You are not in jail, why are you trying to pay bail?")]
        });
    }
    const result = await (0, jailService_1.payBail)(user.id, message.guildId);
    if (result.success) {
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Bail Paid", result.message)]
        });
    }
    else {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Bail Failed", result.message)]
        });
    }
}
//# sourceMappingURL=jail.js.map