
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Open the Setup Dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
    const config = await getGuildConfig(interaction.guildId!);
    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Think} Server Setup Dashboard`)
        .setDescription("Welcome to the Casino Setup Dashboard. Use the buttons below to configure your server.")
        .addFields(
            { name: "Economy", value: `Currency: ${config.currencyEmoji}\nStart: ${config.startMoney}`, inline: true },
            { name: "Jobs", value: "Configure sectors & salaries", inline: true },
            { name: "Crime", value: `Rob Chance: ${config.robSuccessPct}%`, inline: true }
        )
        .setColor(Mascot.Colors.Base as any);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("setup_general").setLabel("General").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("setup_banking").setLabel("Banking").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("setup_jobs").setLabel("Jobs").setStyle(ButtonStyle.Success)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("setup_crime").setLabel("Crime").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("setup_gambling").setLabel("Gambling").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("setup_education").setLabel("Education").setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({ embeds: [embed], components: [row1, row2] });
}
