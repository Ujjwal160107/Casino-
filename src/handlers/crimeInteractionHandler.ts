import { ButtonInteraction, Interaction, MessageFlags } from "discord.js";
import { checkJailStatus } from "../services/jailService";
import { setCooldown } from "../services/cooldownService";
import {
  clearCrimeSession,
  CrimeExecuteResult,
  getCrimeSession,
  resolveCrimeFailure,
  resolveCrimeSuccess,
} from "../services/crimeService";
import {
  clearCrimeRun,
  getCrimeRun,
  startCrimeRun,
  submitStageAnswer,
} from "../services/crimeRunService";
import {
  buildCrimeBoardPayload,
  buildCrimePrepPayload,
  buildCrimeResultPayload,
  buildCrimeStagePayload,
  parseCrimeCustomId,
} from "../commands/economy/crimeUi";
import { fmtCurrency } from "../utils/format";
import { Mascot } from "../config/branding";
import { logToChannel } from "../utils/discordLogger";
import {
  ensureDeferredUpdate,
  safeEditReply,
  safeFollowUp,
  safeReply,
} from "../utils/interactionHelpers";
import { getGuildPrefix } from "../utils/guildContext";
import { TAX_CONFIG, GRINDING_COMMANDS } from "../utils/economyConfig";
import { getCrimeByKey } from "../data/crimeCatalog";
import { getStageCountForTier, getStagesForCrime, hasMinigameCatalog } from "../data/crimeMinigameCatalog";

async function finishCrimeResult(
  interaction: ButtonInteraction,
  result: CrimeExecuteResult,
  extraNote = "",
) {
  const title = result.success
    ? `${Mascot.Emotes.Success} ${result.crime.name} — Success`
    : `${Mascot.Emotes.Fail} ${result.crime.name} — Failed`;

  let body = result.message + extraNote;
  body += `\n\n**Wallet:** ${fmtCurrency(result.newBalance)}`;
  if (result.success && result.heat !== undefined && result.heat >= TAX_CONFIG.raidHeatThreshold * 0.7) {
    body += `\n**Heat:** ${result.heat} — your activity is drawing attention...`;
  } else if (result.success && result.heat !== undefined) {
    body += `\n**Heat:** ${result.heat}`;
  }

  const accent = result.success ? 0x2ecc71 : 0xe74c3c;
  const outcome = result.success ? "success" : result.jailed ? "jailed" : undefined;
  const prefix = interaction.guild ? await getGuildPrefix(interaction.guild.id) : undefined;
  await safeEditReply(interaction, buildCrimeResultPayload(title, body, accent, outcome, prefix));

  if (
    result.success &&
    interaction.guild &&
    (result.crime.tier === "legendary" || result.crime.tier === "elite" || result.appliedAmount >= 500_000)
  ) {
    await logToChannel(interaction.client, {
      guild: interaction.guild,
      type: "TRADE",
      title: "Crime Payout",
      description: `**${interaction.user.tag}** completed **${result.crime.name}** for **${fmtCurrency(result.appliedAmount)}**.`,
      color: 0x2ecc71,
    });
  }

  if (result.jailed && interaction.guild) {
    await logToChannel(interaction.client, {
      guild: interaction.guild,
      type: "TRADE",
      title: "Crime Arrest",
      description: `**${interaction.user.tag}** was jailed after failing **${result.crime.name}**.`,
      color: 0xe74c3c,
    });
  }
}

async function handleMinigameAnswer(
  interaction: ButtonInteraction,
  parsed: ReturnType<typeof parseCrimeCustomId>,
) {
  const { ownerId, runId, stageIndex, optionIndex } = parsed;
  if (!ownerId || !runId || stageIndex === undefined || optionIndex === undefined) return;
  if (!interaction.guild) return;

  const run = await getCrimeRun(ownerId);
  if (!run) {
    await safeEditReply(
      interaction,
      buildCrimeResultPayload(
        `${Mascot.Emotes.Fail} Crime Expired`,
        "Your run expired. Cooldown still applies — try again later.",
        0xe74c3c,
      ),
    );
    return;
  }

  const result = await submitStageAnswer(ownerId, runId, stageIndex, optionIndex);
  const crime = getCrimeByKey(run.crimeKey);
  if (!crime) return;

  if (result.outcome === "invalid") {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Alert} That choice is no longer valid.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (result.outcome === "wrong" || result.outcome === "expired") {
    const resolve = await resolveCrimeFailure(
      ownerId,
      interaction.user.username,
      run.crimeKey,
      interaction.guild.id,
    );
    await clearCrimeRun(ownerId);
    const failNote = `\n\nFailed at stage **${result.failedStage}**. Correct move: **${result.correctLabel}**`;
    return finishCrimeResult(interaction, resolve, failNote);
  }

  if (result.nextStageIndex === null) {
    const resolve = await resolveCrimeSuccess(
      ownerId,
      interaction.user.username,
      run.crimeKey,
      interaction.guild.id,
    );
    await clearCrimeRun(ownerId);
    return finishCrimeResult(interaction, resolve);
  }

  const stages = getStagesForCrime(run.crimeKey)!;
  const nextStage = stages[result.nextStageIndex];
  const total = getStageCountForTier(crime.tier);
  await safeEditReply(interaction, buildCrimeStagePayload(result.run, nextStage, crime.name, total));
}

export async function handleCrimeInteraction(interaction: Interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  if (!interaction.guild) return;

  const customId = interaction.customId;
  if (!customId.startsWith("crime:")) return;

  const parsed = parseCrimeCustomId(customId);

  if (parsed.action === "mg" && interaction.isButton()) {
    if (interaction.user.id !== parsed.ownerId) {
      return safeReply(interaction, {
        content: `${Mascot.Emotes.Decline} This stage is not yours.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!await ensureDeferredUpdate(interaction)) return;
    return handleMinigameAnswer(interaction, parsed);
  }

  const { action, ownerId, sessionId, crimeKey } = parsed;

  if (interaction.user.id !== ownerId) {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Decline} This crime board is not yours.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const session = await getCrimeSession(ownerId);
  if (!session || session.sessionId !== sessionId) {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Alert} Board expired — run the crime command again.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const jail = await checkJailStatus(ownerId);
  if (jail.isJailed) {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Lock} You cannot commit crimes while jailed.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const prefix = await getGuildPrefix(interaction.guild.id);

  if (action === "select" && interaction.isStringSelectMenu()) {
    const selectedKey = interaction.values[0];
    if (!session.crimeKeys.includes(selectedKey)) {
      return safeReply(interaction, {
        content: `${Mascot.Emotes.Alert} That job is not on your board.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      if (!await ensureDeferredUpdate(interaction)) return;
      const payload = await buildCrimePrepPayload(ownerId, session, selectedKey);
      await safeEditReply(interaction, payload);
    } catch (err) {
      await safeFollowUp(interaction, {
        content: `${Mascot.Emotes.Fail} ${(err as Error).message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (action === "back" && interaction.isButton()) {
    if (!await ensureDeferredUpdate(interaction)) return;
    const payload = await buildCrimeBoardPayload(ownerId, session, prefix);
    await safeEditReply(interaction, payload);
    return;
  }

  if (action === "confirm" && interaction.isButton()) {
    if (!crimeKey || !session.crimeKeys.includes(crimeKey)) {
      return safeReply(interaction, {
        content: `${Mascot.Emotes.Alert} Invalid crime.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!hasMinigameCatalog(crimeKey)) {
      return safeReply(interaction, {
        content: `${Mascot.Emotes.Alert} This job is not ready yet.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!await ensureDeferredUpdate(interaction)) return;

    try {
      await setCooldown(ownerId, GRINDING_COMMANDS.crime.commandName, GRINDING_COMMANDS.crime.cooldownSeconds);
      await clearCrimeSession(ownerId);

      const crime = getCrimeByKey(crimeKey)!;
      const { run, stage } = await startCrimeRun(ownerId, crimeKey, interaction.guild.id, sessionId);
      const total = getStageCountForTier(crime.tier);
      await safeEditReply(interaction, buildCrimeStagePayload(run, stage, crime.name, total));
    } catch (err) {
      await clearCrimeSession(ownerId);
      await safeEditReply(
        interaction,
        buildCrimeResultPayload(
          `${Mascot.Emotes.Fail} Crime Failed`,
          (err as Error).message,
          0xe74c3c,
        ),
      );
    }
    return;
  }
}
