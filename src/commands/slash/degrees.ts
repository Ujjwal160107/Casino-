
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { errorEmbed } from "../../utils/embed";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";

export const data = new SlashCommandBuilder()
    .setName("degrees")
    .setDescription("View earned degrees");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId! } },
        include: { degrees: { include: { degree: true } } }
    });

    if (!user || user.degrees.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed(interaction.user, "No Degrees", "You haven't earned any degrees yet.")] });
    }

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Graduate} Earned Degrees`)
        .setColor(0xF1C40F);

    for (const ud of user.degrees) {
        embed.addFields({ name: `🎓 ${ud.degree.name}`, value: `**GPA:** ${ud.finalGpa.toFixed(1)}`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
}
