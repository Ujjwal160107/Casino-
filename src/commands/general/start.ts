import { Message, EmbedBuilder } from "discord.js";
import { getUser, createUser } from "../../services/userService";
import { Mascot } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { getGuildPrefix } from "../../utils/guildContext";
import { STARTING_WALLET_BALANCE } from "../../utils/economyConfig";

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
    const prefix = await getGuildPrefix(guildId);

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Success} Welcome to ${Mascot.Name}!`)
        .setDescription(`Your profile has been created successfully!\n\n**Starting Balance:** ${fmtCurrency(STARTING_WALLET_BALANCE)}\n\nUse \`${prefix}guide\` or \`${prefix}tutorial\` to learn how to play.`)
        .setColor(Mascot.Colors.Success as any)
        .setThumbnail(message.author.displayAvatarURL());

    message.reply({ embeds: [embed] });
}
