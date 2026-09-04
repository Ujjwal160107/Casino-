import { Message, PermissionFlagsBits } from "discord.js";
import { getGuildSettings, updateGuildSettings } from "../../services/guildSettingsService";
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { isBotDeveloper } from "../../utils/developerAccess";

const ON = new Set(["on", "enable", "enabled", "true", "yes", "allow"]);
const OFF = new Set(["off", "disable", "disabled", "false", "no", "block"]);

/**
 * Server-admin toggle for !rob. Gated on Manage Server, matching setPrefix --
 * these are the two settings a server owner controls, and they should need the
 * same permission.
 *
 * With no argument it reports the current state rather than erroring, so an
 * admin can check without having to guess the syntax.
 */
export async function handleSetRob(message: Message, args: string[]) {
  try {
    if (!message.guild) return;

    const canManage = Boolean(
      message.member &&
      (isBotDeveloper(message.author.id) || message.member.permissions.has(PermissionFlagsBits.ManageGuild))
    );

    if (!canManage) {
      return message.reply(
        v2Reply(errorContainer("No Permission", "You need Manage Server permission to change whether robbing is allowed here."))
      );
    }

    const settings = await getGuildSettings(message.guild.id);
    const prefix = settings.prefix || "!";
    const choice = args[0]?.toLowerCase();

    if (!choice) {
      return message.reply(
        v2Reply(successContainer(
          "Robbing Setting",
          `Robbing is currently **${settings.robEnabled ? "enabled" : "disabled"}** in this server.\n` +
          `Change it with \`${prefix}setrob on\` or \`${prefix}setrob off\`.`,
        ))
      );
    }

    if (!ON.has(choice) && !OFF.has(choice)) {
      return message.reply(
        v2Reply(errorContainer("Invalid Option", `Usage: \`${prefix}setrob <on|off>\``))
      );
    }

    const robEnabled = ON.has(choice);
    if (robEnabled === settings.robEnabled) {
      return message.reply(
        v2Reply(successContainer(
          "No Change",
          `Robbing is already **${robEnabled ? "enabled" : "disabled"}** in this server.`,
        ))
      );
    }

    await updateGuildSettings(message.guild.id, { robEnabled });

    return message.reply(
      v2Reply(successContainer(
        robEnabled ? "Robbing Enabled" : "Robbing Disabled",
        robEnabled
          ? `Members can now use \`${prefix}rob\` here, against other members of this server.`
          : `\`${prefix}rob\` is now blocked in this server. Existing balances are unaffected.`,
      ))
    );
  } catch (err) {
    console.error("handleSetRob error:", err);
    return message.reply(
      v2Reply(errorContainer("Internal Error", "Failed to update the robbing setting."))
    );
  }
}
