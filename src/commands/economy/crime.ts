import { Message } from "discord.js";
import { GRINDING_COMMANDS } from "../../utils/economyConfig";
import { checkCooldown } from "../../services/cooldownService";
import { checkJailStatus } from "../../services/jailService";
import { getOrCreateCrimeSession, getLastCrimeResult, settleAbandonedCrimeRun } from "../../services/crimeService";
import { buildCrimeBoardPayload, buildCrimeCooldownPayload, buildCrimeResultPayload } from "./crimeUi";
import { fmtCurrency } from "../../utils/format";
import { getGuildPrefix } from "../../utils/guildContext";
import { errorContainer, v2Reply } from "../../utils/componentsV2";
import { Mascot } from "../../config/branding";

export async function handleCrime(message: Message) {
  if (!message.guild) return;

  // A run left unanswered past its stage timer is a failed job: charge it now,
  // before anything else, so walking away is never cheaper than a wrong answer.
  const abandoned = await settleAbandonedCrimeRun(message.author.id, message.author.username, message.guild.id);
  if (abandoned) {
    return message.reply(
      buildCrimeResultPayload(
        `${Mascot.Emotes.Fail} ${abandoned.crime.name} — Abandoned`,
        `You walked away from the job mid-stage, so it counts as a failure.\n\n${abandoned.message}\n\n**Wallet:** ${fmtCurrency(abandoned.newBalance)}`,
        0xe74c3c,
        abandoned.jailed ? "jailed" : undefined,
        await getGuildPrefix(message.guild.id),
      ),
    );
  }

  const jail = await checkJailStatus(message.author.id);
  if (jail.isJailed) {
    return message.reply(
      v2Reply(
        errorContainer(
          "Incarcerated",
          `${Mascot.Emotes.Lock} You cannot commit crimes while jailed. Use \`,bail\` or wait for release.`,
        ),
      ),
    );
  }

  const config = GRINDING_COMMANDS.crime;
  const cooldown = await checkCooldown(message.author.id, config.commandName);

  const prefix = await getGuildPrefix(message.guild.id);

  if (cooldown.active && cooldown.expiresAt) {
    const last = await getLastCrimeResult(message.author.id);
    const payload = await buildCrimeCooldownPayload(message.author.id, cooldown.expiresAt, prefix, last);
    return message.reply(payload);
  }

  const session = await getOrCreateCrimeSession(message.author.id);
  const payload = await buildCrimeBoardPayload(message.author.id, session, prefix);
  return message.reply(payload);
}
