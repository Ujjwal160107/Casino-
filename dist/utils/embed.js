"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseEmbed = baseEmbed;
exports.infoEmbed = infoEmbed;
exports.successEmbed = successEmbed;
exports.errorEmbed = errorEmbed;
exports.balanceEmbed = balanceEmbed;
const discord_js_1 = require("discord.js");
const format_1 = require("./format");
const branding_1 = require("../config/branding");
const branding_2 = require("../config/branding");
function baseEmbed(user) {
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(branding_1.Mascot.Colors.Base)
        .setTimestamp()
        .setFooter({ text: `${branding_1.Mascot.Name} • Play Responsibly`, iconURL: "attachment://fortuna.jpg" });
    if (user) {
        embed.setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 256 }) });
    }
    return embed;
}
function infoEmbed(user, title, desc) {
    const embed = baseEmbed(user).setTitle(title).setDescription(desc ?? "");
    const url = (0, branding_2.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
    if (url)
        embed.setThumbnail(url);
    return embed;
}
function successEmbed(user, title, desc) {
    const embed = baseEmbed(user).setColor(discord_js_1.Colors.Green).setTitle(title).setDescription(desc ?? "");
    const url = (0, branding_2.getEmoteUrl)(branding_1.Mascot.Emotes.Success);
    if (url)
        embed.setThumbnail(url);
    return embed;
}
function errorEmbed(user, title, desc) {
    const embed = baseEmbed(user).setColor(discord_js_1.Colors.Red).setTitle(title).setDescription(desc ?? "");
    const url = (0, branding_2.getEmoteUrl)(branding_1.Mascot.Emotes.Fail);
    if (url)
        embed.setThumbnail(url);
    return embed;
}
function balanceEmbed(user, wallet, bank, emoji) {
    const embed = baseEmbed(user)
        .setTitle(`${user.username}'s Balance`)
        .addFields({ name: "Wallet", value: (0, format_1.fmtCurrency)(wallet, emoji), inline: true }, { name: "Bank", value: (0, format_1.fmtCurrency)(bank, emoji), inline: true });
    const url = (0, branding_2.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
    if (url)
        embed.setThumbnail(url);
    return embed;
}
//# sourceMappingURL=embed.js.map