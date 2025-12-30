import { Message, EmbedBuilder } from "discord.js";
import { dropout } from "../../services/educationService";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleDropout(message: Message) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);
    const prefix = config?.prefix || "!";

    try {
        const res = await dropout(message.author.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Shocked} Dropped Out`)
            .setDescription(`You have dropped out of **${res.degreeName}**.\n\nYour tuition fees are non-refundable. You are now free to enroll in another program.`)
            .setColor("#E74C3C")
            .setFooter({ text: `Use ${prefix}enroll to join a new degree.` })
            .setThumbnail(getEmoteUrl(Mascot.Emotes.Shocked));

        message.reply({ embeds: [embed] });

    } catch (err: any) {
        message.reply({ embeds: [errorEmbed(message.author, "Dropout Failed", err.message)] });
    }
}
