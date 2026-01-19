
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";

export const data = new SlashCommandBuilder()
    .setName("education")
    .setDescription("View education status");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId!);
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId! } },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user) return interaction.editReply("User not found (try /start).");

    if (user.currentEducation) {
        const edu = user.currentEducation;
        const deg = edu.degree;
        const progress = Math.min(100, Math.round((edu.currentGpa / 6.0) * 100));
        const embed = new EmbedBuilder()
            .setTitle(`Student Dashboard: ${deg.name}`)
            .setDescription(`**Degree Fee Paid**: ${fmtCurrency(deg.tuitionPerSem, config?.currencyEmoji)}\n${progress}% to Graduation`)
            .setColor(edu.stress > 80 ? 0xFF0000 : 0x3498DB)
            .addFields(
                { name: "Intelligence", value: `${edu.currentGpa.toFixed(1)} / 6.0`, inline: true },
                { name: "Stress", value: `${edu.stress}/100`, inline: true }
            );
        if (edu.stress > 70) embed.setDescription(embed.data.description + `\n\n${Mascot.Emotes.Alert} **High Stress!**`);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("edu_stress_sports").setLabel("Sports").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Sports),
            new ButtonBuilder().setCustomId("edu_stress_gym").setLabel("Gym").setStyle(ButtonStyle.Primary).setEmoji(Mascot.Emotes.Gym),
            new ButtonBuilder().setCustomId("edu_stress_meditation").setLabel("Meditation").setStyle(ButtonStyle.Secondary).setEmoji(Mascot.Emotes.Meditation)
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Education").setDescription("You are not enrolled. Use `/enroll` (Coming Soon) or check prefix command `!education` for the full list.")] });
    }
}
