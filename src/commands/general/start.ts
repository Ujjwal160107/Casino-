import { Message } from "discord.js";
import { getUser, createUser } from "../../services/userService";
import { Mascot } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { getGuildPrefix } from "../../utils/guildContext";
import { STARTING_WALLET_BALANCE } from "../../utils/economyConfig";

export async function handleStart(message: Message) {
    if (!message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    // Check if exists
    let user = await getUser(userId, guildId);

    if (user) {
        return message.reply(v2Reply(errorContainer("Already Started", "You already have a profile!")));
    }

    // Create User
    await createUser(userId, guildId, message.author.username);
    const prefix = await getGuildPrefix(guildId);

    message.reply(v2Reply(successContainer(
        `${Mascot.Emotes.Success} Welcome to ${Mascot.Name}!`,
        `Your profile has been created successfully!\n\n**Starting Balance:** ${fmtCurrency(STARTING_WALLET_BALANCE)}\n\nUse \`${prefix}guide\` or \`${prefix}tutorial\` to learn how to play.`,
        { thumbnailUrl: message.author.displayAvatarURL(), hint: nextStepHint("start", prefix) }
    )));
}
