import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { dropout } from "../../services/educationService";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma"; // Added prisma import
import { getGuildPrefix } from "../../utils/guildContext";
import { errorContainer, plainContainer, v2Reply } from "../../utils/componentsV2";

export async function handleDropout(message: Message) {
    if (!message.guild) return;
    const prefix = await getGuildPrefix(message.guild.id);
    

    try {
        const user = await prisma.user.findUnique({
            where: { discordId: message.author.id },
            include: { currentEducation: { include: { degree: true } } }
        });

        if (!user?.currentEducation) {
            return message.reply(v2Reply(errorContainer("Not Enrolled", "You are not currently enrolled in any degree.")));
        }

        const container = plainContainer(
            `## ⚠️ Confirm Dropout\nAre you sure you want to drop out of **${user.currentEducation.degree.name}**?\n\n**Warning:**\n• You will lose all progress in this degree.\n• Tuition fees are non-refundable.\n• You will have to pay again to re-enroll.`
        );

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

        container.addActionRowComponents(row);

        message.reply(v2Reply(container));

    } catch (err: any) {
        message.reply(v2Reply(errorContainer("Error", err.message)));
    }
}
