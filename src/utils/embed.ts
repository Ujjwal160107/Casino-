import { EmbedBuilder, Colors, User } from "discord.js";
import { fmtCurrency } from "./format";
import { Mascot } from "../config/branding";

import { getEmoteUrl } from "../config/branding";

export function baseEmbed(user?: User) {
    const embed = new EmbedBuilder()
        .setColor(Mascot.Colors.Base as any)
        .setTimestamp()
        .setFooter({ text: `${Mascot.Name} • Play Responsibly`, iconURL: "attachment://fortuna.jpg" });

    if (user) {
        embed.setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 256 }) });
    }
    return embed;
}

export function infoEmbed(user: User, title: string, desc?: string) {
    const embed = baseEmbed(user).setTitle(title).setDescription(desc ?? "");
    const url = getEmoteUrl(Mascot.Emotes.Think);
    if (url) embed.setThumbnail(url);
    return embed;
}

export function successEmbed(user: User, title: string, desc?: string) {
    const embed = baseEmbed(user).setColor(Colors.Green).setTitle(title).setDescription(desc ?? "");
    const url = getEmoteUrl(Mascot.Emotes.Success);
    if (url) embed.setThumbnail(url);
    return embed;
}

export function errorEmbed(user: User, title: string, desc?: string) {
    const embed = baseEmbed(user).setColor(Colors.Red).setTitle(title).setDescription(desc ?? "");
    const url = getEmoteUrl(Mascot.Emotes.Fail);
    if (url) embed.setThumbnail(url);
    return embed;
}

export function balanceEmbed(user: User, wallet: number, bank: number, emoji: string) {
    const embed = baseEmbed(user)
        .setTitle(`${user.username}'s Balance`)
        .addFields(
            { name: "Wallet", value: fmtCurrency(wallet, emoji), inline: true },
            { name: "Bank", value: fmtCurrency(bank, emoji), inline: true }
        );
    const url = getEmoteUrl(Mascot.Emotes.Money);
    if (url) embed.setThumbnail(url);
    return embed;
}