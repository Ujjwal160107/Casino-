import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleDashboard(message: Message) {
    const embed = new EmbedBuilder()
        .setTitle(`🌐 ${Mascot.Name} Dashboard`)
        .setDescription(`Manage server settings, view leaderboards, and more on our web dashboard!\n\n**[Click here to open Dashboard](https://fortunabot.dev/)**`)
        .setColor(Mascot.Colors.Base as any)
        .setThumbnail("https://fortunabot.dev/icon.png"); // Use the new icon if hosted? Or just standard mascot.

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("Open Dashboard")
            .setStyle(ButtonStyle.Link)
            .setURL("https://fortunabot.dev/")
    );

    await message.reply({ embeds: [embed], components: [row] });
}
