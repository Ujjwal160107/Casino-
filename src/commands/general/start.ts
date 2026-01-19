import { Message, EmbedBuilder } from "discord.js";
import { getUser, createUser } from "../../services/userService";
import { Mascot } from "../../config/branding";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleStart(message: Message) {
    if (!message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    // Check if exists
    let user = await getUser(userId, guildId);

    if (user) {
        return message.reply({ embeds: [errorEmbed(message.author, "Already Started", "You already have a profile!")] });
    }

    // Create User
    await createUser(userId, guildId, message.author.username);
    const config = await getGuildConfig(guildId);

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Success} Welcome to ${Mascot.Name}!`)
        .setDescription(`Your profile has been created successfully!\n\n**Starting Balance:** ${config.currencyEmoji} ${config.startMoney}\n\nUse \`!guide\` or \`!tutorial\` to learn how to play.`)
        .setColor(Mascot.Colors.Success as any)
        .setThumbnail(message.author.displayAvatarURL());

    message.reply({ embeds: [embed] });
}
