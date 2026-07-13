import { Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { getGuildSettings, updateGuildSettings } from "../../services/guildSettingsService";
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { isBotDeveloper } from "../../utils/developerAccess";

export async function handleSetPrefix(message: Message, args: string[]) {
  try {
    if (!message.guild) return;
    const canManagePrefix = Boolean(
      message.member &&
      (isBotDeveloper(message.author.id) || message.member.permissions.has(PermissionFlagsBits.ManageGuild))
    );

    if (!canManagePrefix) {
      return message.reply(
        v2Reply(errorContainer("No Permission", "You need Manage Server permission to update this server's prefix."))
      );
    }

    const settings = await getGuildSettings(message.guild.id);
    const currentPrefix = settings.prefix || "!";
    const newPrefix = args[0];

    if (!newPrefix || newPrefix.length > 3) {
      return message.reply(
        v2Reply(errorContainer("Invalid Prefix", `Usage: \`${currentPrefix}setprefix <symbol>\` (max 3 chars)`))
      );
    }

    await updateGuildSettings(message.guildId!, { prefix: newPrefix });
    return message.reply(
      v2Reply(successContainer("Prefix Updated", `New prefix set to **${newPrefix}**`))
    );
  } catch (err) {
    console.error("handleSetPrefix error:", err);
    return message.reply(
      v2Reply(errorContainer("Internal Error", "Failed to set prefix."))
    );
  }
}
