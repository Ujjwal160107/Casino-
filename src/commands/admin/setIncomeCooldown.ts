import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { parseDuration, formatDuration } from "../../utils/format";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";

const SUPPORTED = ["work", "beg", "crime", "slut"];

export async function handleSetIncomeCooldown(message: Message, args: string[]) {
  try {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
      return message.reply({ embeds: [errorEmbed(message.author, "No Permission", "Admins or Bot Commanders only.")] });
    }

    const config = await getGuildConfig(message.guildId!);
    const cmd = (args[0] ?? "").toLowerCase();
    const timeStr = args.slice(1).join(" ");

    let seconds: number | null = 0;
    if (timeStr.toLowerCase() === "off") {
      seconds = 0;
    } else {
      seconds = parseDuration(timeStr);
    }

    if (!SUPPORTED.includes(cmd) || seconds === null || seconds < 0) {
      return message.reply({
        embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}setincomecooldown <work|beg|crime|slut> <duration|off>\`\nExample: \`${config.prefix}setincomecooldown work 1h 30m\` or \`... work off\``)]
      });
    }

    await prisma.incomeConfig.upsert({
      where: { guildId_commandKey: { guildId: message.guildId!, commandKey: cmd } },
      create: { guildId: message.guildId!, commandKey: cmd, minPay: 10, maxPay: 50, cooldown: seconds, successPct: 100 },
      update: { cooldown: seconds }
    });

    return message.reply({
      embeds: [successEmbed(message.author, "Cooldown Updated", `Set **${cmd}** cooldown to **${formatDuration(seconds * 1000)}**`)]
    });

  } catch (err) {
    console.error("handleSetIncomeCooldown error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Internal Error", "Failed to set cooldown.")] });
  }
}