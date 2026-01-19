import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getUser, createUser } from "../../services/userService";
import { Mascot } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";

export const data = new SlashCommandBuilder()
    .setName("start")
    .setDescription("Start your adventure!");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    let user = await getUser(userId, guildId);

    if (user) {
        return interaction.reply({ content: "You already have a profile!", ephemeral: true });
    }

    await createUser(userId, guildId, interaction.user.username);
    const config = await getGuildConfig(guildId);

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Success} Welcome to ${Mascot.Name}!`)
        .setDescription(`Your profile has been created successfully!\n\n**Starting Balance:** ${config.currencyEmoji} ${config.startMoney}\n\nUse \`/tutorial\` to learn how to play.`)
        .setColor(Mascot.Colors.Success as any);

    interaction.reply({ embeds: [embed] });
}
