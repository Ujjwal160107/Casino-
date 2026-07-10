import { Message } from "discord.js";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { takeExam } from "../../services/educationService";
import { getGuildPrefix } from "../../utils/guildContext";

/** Canonical enrollment is via `!education` dashboard buttons. */
export async function handleEnroll(message: Message, args: string[]) {
  if (!message.guild) return;
  const prefix = await getGuildPrefix(message.guild.id);
  const query = args.join(" ").trim();
  const hint = query
    ? `Try \`${prefix}education\` and use the Enroll button for **${query}**.`
    : `Use \`${prefix}education\` to browse programs and enroll with the Enroll button.`;
  return message.reply(`${Mascot.Emotes.Graduate} Enrollment moved to the education dashboard.\n${hint}`);
}

export async function handleExam(message: Message) {
  if (!message.guild) return;
  const userId = message.author.id;
  const guildId = message.guild.id;

  try {
    const res = await takeExam(userId, guildId);

    if (res.success) {
      return message.reply({ embeds: [successEmbed(message.author, "🎓 GRADUATED!", res.msg)] });
    }

    const embed = errorEmbed(message.author, "Exam Failed", res.msg);
    const sadUrl = getEmoteUrl(Mascot.Emotes.TeacherSad);
    if (sadUrl) embed.setThumbnail(sadUrl);
    return message.reply({ embeds: [embed] });
  } catch (err: any) {
    return message.reply({ embeds: [errorEmbed(message.author, "Error", err.message)] });
  }
}
