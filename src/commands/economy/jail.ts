import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { checkJailStatus, payBail } from "../../services/jailService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { errorEmbed, successEmbed, infoEmbed } from "../../utils/embed";

const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";

export async function handleJail(message: Message) {
    const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);

    const status = await checkJailStatus(user.discordId);

    if (!status.isJailed) {
        return message.reply({
            embeds: [infoEmbed(message.author, "Clean Record", "You are currently **not** in jail.")]
        });
    }

    const timeLeft = status.releaseTime ? Math.max(0, status.releaseTime.getTime() - Date.now()) : 0;
    const config = await getGuildConfig(message.guildId!);

    const embed = new EmbedBuilder()
        .setTitle(`${POLICE_EMOTE} JAIL STATUS`)
        .setDescription(`You are currently incarcerated.`)
        .addFields(
            { name: "Release In", value: status.releaseTime ? `<t:${Math.floor(status.releaseTime.getTime() / 1000)}:R>` : "N/A", inline: true },
            { name: "Bail Cost", value: fmtCurrency(config.jailFine, config.currencyEmoji), inline: true }
        )
        .setColor(0xFF0000)
        .setThumbnail("https://cdn.discordapp.com/emojis/1457053051582939237.png")
        .setFooter({ text: `Type ${config.prefix}bail to pay the fine and leave.` });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("pay_bail")
                .setLabel(`Pay Bail (${fmtCurrency(config.jailFine, "")})`)
                .setStyle(ButtonStyle.Danger)
        );

    return message.reply({ embeds: [embed], components: [row] });
}

export async function handleBail(message: Message) {
    const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
    const status = await checkJailStatus(user.discordId);

    if (!status.isJailed) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Not Jailed", "You are not in jail, why are you trying to pay bail?")]
        });
    }

    const result = await payBail(user.discordId, message.guildId!);

    if (result.success) {
        return message.reply({
            embeds: [successEmbed(message.author, "Bail Paid", result.message)]
        });
    } else {
        return message.reply({
            embeds: [errorEmbed(message.author, "Bail Failed", result.message)]
        });
    }
}
