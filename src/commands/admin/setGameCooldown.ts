import { Message, PermissionsBitField } from "discord.js";
import { updateGuildConfig, getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { parseDuration, formatDuration } from "../../utils/format";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

export async function handleSetGameCooldown(message: Message, args: string[]) {
  if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
    return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
  }

  const config = await getGuildConfig(message.guildId!);
  const game = args[0]?.toLowerCase();
  const timeInput = args.slice(1).join(" ");

  if (!game || !timeInput) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Usage", `\`${config.prefix}set-game-cooldown <game> <time|off>\`\nExample: \`${config.prefix}game-cd slots 30s\` or \`${config.prefix}game-cd slots off\``)]
    });
  }

  const isOff = timeInput.toLowerCase() === "off" || timeInput === "0";
  const seconds = isOff ? 0 : parseDuration(timeInput);

  if (seconds === null || seconds < 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Time", "Please provide a valid duration (e.g. `30s`, `1m`, `1h`) or `off`.")] });
  }

  let cooldowns: Record<string, number> = (config.gameCooldowns as Record<string, number>) || {};
  if (typeof cooldowns !== "object") cooldowns = {};
  cooldowns[game] = seconds;

  await updateGuildConfig(message.guildId!, {
    gameCooldowns: cooldowns
  });

  const status = seconds === 0 ? "disabled" : `set to **${formatDuration(seconds * 1000)}**`;
  return message.reply({
    embeds: [successEmbed(message.author, "Configuration Updated", `🕐 **${game.toUpperCase()}** cooldown ${status}.`)]
  });
}