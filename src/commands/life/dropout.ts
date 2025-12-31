import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { dropout } from "../../services/educationService";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import prisma from "../../utils/prisma"; // Added prisma import

export async function handleDropout(message: Message) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);
    const prefix = config?.prefix || "!";

    try {
        const user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
            include: { currentEducation: { include: { degree: true } } }
        });

        if (!user?.currentEducation) {
            return message.reply({ embeds: [errorEmbed(message.author, "Not Enrolled", "You are not currently enrolled in any degree.")] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Confirm Dropout`)
            .setDescription(`Are you sure you want to drop out of **${user.currentEducation.degree.name}**?\n\n**Warning:**\n• You will lose all progress in this degree.\n• Tuition fees are non-refundable.\n• You will have to pay again to re-enroll.`)
            .setColor("#E74C3C")
            .setThumbnail(getEmoteUrl(Mascot.Emotes.Alert));

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("dropout_confirm")
                .setLabel("I want to Dropout")
                .setStyle(ButtonStyle.Danger)
                .setEmoji(Mascot.Emotes.Fail), // Skull or Sad or Fail
            new ButtonBuilder()
                .setCustomId("dropout_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(Mascot.Emotes.Decline)
        );

        message.reply({ embeds: [embed], components: [row] });

    } catch (err: any) {
        message.reply({ embeds: [errorEmbed(message.author, "Error", err.message)] });
    }
}
