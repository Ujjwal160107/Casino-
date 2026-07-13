import { Message } from "discord.js";
import { GRINDING_COMMANDS } from "../../utils/economyConfig";
import { checkCooldown } from "../../services/cooldownService";
import { checkJailStatus } from "../../services/jailService";
import { getOrCreateCrimeSession, getLastCrimeResult } from "../../services/crimeService";
import { buildCrimeBoardPayload, buildCrimeCooldownPayload } from "./crimeUi";
import { getGuildPrefix } from "../../utils/guildContext";
import { errorContainer, v2Reply } from "../../utils/componentsV2";
import { Mascot } from "../../config/branding";

export async function handleCrime(message: Message) {
  if (!message.guild) return;

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
