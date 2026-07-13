import { Message } from "discord.js";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { takeExam } from "../../services/educationService";
import { getGuildPrefix } from "../../utils/guildContext";
import { successContainer, errorContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";

/** Canonical enrollment is via `!education` dashboard buttons. */
export async function handleEnroll(message: Message, args: string[]) {
  if (!message.guild) return;
  const prefix = await getGuildPrefix(message.guild.id);
  const query = args.join(" ").trim();
  const hint = query
    ? `Try \`${prefix}education\` and use the Enroll button for **${query}**.`
    : `Use \`${prefix}education\` to browse programs and enroll with the Enroll button.`;
  const container = plainContainer(
    `${Mascot.Emotes.Graduate} Enrollment moved to the education dashboard.\n${hint}`,
    nextStepHint("enroll", prefix)!,
  );
  return message.reply(v2Reply(container));
}

export async function handleExam(message: Message) {
  if (!message.guild) return;
  const userId = message.author.id;
  const guildId = message.guild.id;
  const prefix = await getGuildPrefix(guildId);

  try {
    const res = await takeExam(userId, guildId);

    if (res.success) {
      return message.reply(v2Reply(successContainer("🎓 GRADUATED!", res.msg, { hint: nextStepHint("exam_pass", prefix)! })));
    }

    const sadUrl = getEmoteUrl(Mascot.Emotes.TeacherSad);
    return message.reply(v2Reply(errorContainer("Exam Failed", res.msg, sadUrl ? { thumbnailUrl: sadUrl } : undefined)));
  } catch (err: any) {
    return message.reply(v2Reply(errorContainer("Error", err.message)));
  }
}
