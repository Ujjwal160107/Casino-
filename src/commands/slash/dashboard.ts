import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Get the link to the web dashboard");

export async function execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
        .setTitle(`🌐 ${Mascot.Name} Dashboard`)
        .setDescription(`Manage server settings, view leaderboards, and more on our web dashboard!\n\n**[Click here to open Dashboard](https://fortunabot.dev/)**`)
        .setColor(Mascot.Colors.Base as any);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("Open Dashboard")
            .setStyle(ButtonStyle.Link)
            .setURL("https://fortunabot.dev/")
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}
