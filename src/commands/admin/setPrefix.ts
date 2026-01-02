import { Message } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

export async function handleSetPrefix(message: Message, args: string[]) {
  try {
    if (!message.guild) return;
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
      return message.reply({
        embeds: [errorEmbed(message.author, "No Permission", "Admins or Bot Commanders only.")]
      });
    }

    const config = await getGuildConfig(message.guild.id);
    const currentPrefix = config.prefix || "!";
    const newPrefix = args[0];

    if (!newPrefix || newPrefix.length > 3) {
      return message.reply({
        embeds: [errorEmbed(message.author, "Invalid Prefix", `Usage: \`${currentPrefix}setprefix <symbol>\` (max 3 chars)`)]
      });
    }

    await updateGuildConfig(message.guildId!, { prefix: newPrefix });
    return message.reply({
      embeds: [successEmbed(message.author, "Prefix Updated", `New prefix set to **${newPrefix}**`)]
    });
  } catch (err) {
    console.error("handleSetPrefix error:", err);
    return message.reply({
      embeds: [errorEmbed(message.author, "Internal Error", "Failed to set prefix.")]
    });
  }
}