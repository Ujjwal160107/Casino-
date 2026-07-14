import { Message } from "discord.js";
import { getGuildPrefix } from "../../utils/guildContext";
import { successContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";

export async function handleFeed(message: Message, args: string[]) {
    if (!message.guildId) return;
    const prefix = await getGuildPrefix(message.guildId);

    const container = successContainer(
        "Feed Command Moved!",
        `Feeding is now done through the unified \`${prefix}use\` command.\n\n` +
        `**Examples:**\n` +
        `\`${prefix}use basic feed\` — +10 XP\n` +
        `\`${prefix}use protein feed\` — +35 XP\n` +
        `\`${prefix}use champion feed\` — +120 XP\n\n` +
        `You can also use shorthands: \`${prefix}use basic\`, \`${prefix}use protein\`, \`${prefix}use champion\`\n\n` +
        `**Daily Feed Cap:** 5 feeds per day across all types.`,
        { hint: nextStepHint("feed", prefix) }
    );

    return message.reply(v2Reply(container));
}
