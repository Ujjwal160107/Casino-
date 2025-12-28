import { Message } from "discord.js";
import { updateGuildConfig, getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { parseDuration, formatDuration } from "../../utils/format";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

const GAMES = ["roulette", "blackjack", "coinflip", "slots", "cockfight"];

export async function handleSetGlobalGameCooldown(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }

    const config = await getGuildConfig(message.guildId!);
    const timeInput = args.join(" ");

    if (!timeInput) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Usage", `\`${config.prefix}set-global-game-cooldown <time|off>\`\nExample: \`${config.prefix}set-global-game-cooldown 10s\` or \`${config.prefix}set-global-game-cooldown off\``)]
        });
    }

    let seconds = 0;
    if (timeInput.toLowerCase() === "off" || timeInput === "0") {
        seconds = 0;
    } else {
        const parsed = parseDuration(timeInput);
        if (parsed === null || parsed < 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Time", "Please provide a valid duration (e.g. `10s`, `1m`) or `off`.")] });
        }
        seconds = parsed;
    }

    let cooldowns: Record<string, number> = (config.gameCooldowns as Record<string, number>) || {};
    if (typeof cooldowns !== "object") cooldowns = {};

    // Update for all games
    for (const game of GAMES) {
        cooldowns[game] = seconds;
    }

    await updateGuildConfig(message.guildId!, {
        gameCooldowns: cooldowns
    });

    const status = seconds === 0 ? "disabled" : `set to **${formatDuration(seconds * 1000)}**`;
    return message.reply({
        embeds: [successEmbed(message.author, "Global Cooldown Updated", `🕐 Cooldown for ALL games has been ${status}.`)]
    });
}
