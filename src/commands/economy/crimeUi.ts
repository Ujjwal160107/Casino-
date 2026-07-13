import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { getCrimeByKey } from "../../data/crimeCatalog";
import { getCrimePrepItem } from "../../data/crimePrepWhitelist";
import {
  computeCrimePreview,
  CrimeSession,
  getMissingRequiredItemNames,
  getOwnedPrepKeys,
  isCrimePlayableWithKeys,
  tierLabel,
} from "../../services/crimeService";
import { CrimeRun } from "../../services/crimeRunService";
import { CrimeMinigameStage } from "../../data/crimeMinigameCatalog";
import { fmtCurrency } from "../../utils/format";
import { formatDiscordRelativeTime } from "../../services/cooldownService";

export const CRIME_V2_FLAGS = MessageFlags.IsComponentsV2 as const;

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

export function crimeCustomId(action: string, ownerId: string, sessionId: string, crimeKey?: string) {
  return crimeKey
    ? `crime:${action}:${ownerId}:${sessionId}:${crimeKey}`
    : `crime:${action}:${ownerId}:${sessionId}`;
}

export function crimeMinigameCustomId(
  ownerId: string,
  runId: string,
  stageIndex: number,
  optionIndex: number,
) {
  return `crime:mg:${ownerId}:${runId}:${stageIndex}:${optionIndex}`;
}

export function parseCrimeCustomId(customId: string) {
  const parts = customId.split(":");
  const action = parts[1] ?? "";
  if (action === "mg") {
    return {
      action,
      ownerId: parts[2] ?? "",
      runId: parts[3] ?? "",
      stageIndex: Number(parts[4]),
      optionIndex: Number(parts[5]),
      sessionId: undefined as string | undefined,
      crimeKey: undefined as string | undefined,
    };
  }
  return {
    action,
    ownerId: parts[2] ?? "",
    sessionId: parts[3] ?? "",
    crimeKey: parts[4],
    runId: undefined as string | undefined,
    stageIndex: undefined as number | undefined,
    optionIndex: undefined as number | undefined,
  };
}

export async function buildCrimeBoardPayload(ownerId: string, session: CrimeSession, prefix: string) {
  const owned = await getOwnedPrepKeys(ownerId);
  const lines: string[] = [];

  for (const key of session.crimeKeys) {
    const crime = getCrimeByKey(key);
    if (!crime) continue;
    const playable = isCrimePlayableWithKeys(crime, owned);
    if (playable) {
      const preview = await computeCrimePreview(ownerId, crime);
      const stageLabel = preview.stageCount === 1 ? "1 stage" : `${preview.stageCount} stages`;
      lines.push(
        `${Mascot.Emotes.Accept} **${tierLabel(crime.tier)}** · ${crime.name} · ${stageLabel} · ${fmtCurrency(preview.payoutMin)}–${fmtCurrency(preview.payoutMax)}`,
      );
    } else {
      const missing = getMissingRequiredItemNames(crime, owned);
      lines.push(
        `${Mascot.Emotes.Lock} **${tierLabel(crime.tier)}** · ${crime.name} · Requires: ${missing.join(", ")}`,
      );
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Gun} Crime Board`),
      new TextDisplayBuilder().setContent(
        `Pick a job you own the required gear for.\n\n${lines.join("\n")}\n\n-# Cooldown starts when you commit. Board refreshes in ~10 minutes.\n-# Buy gear from \`${prefix}shop\` or craft via Hunt Craft in \`${prefix}inventory\`.`,
      ),
    )
    .addSeparatorComponents(separator());

  const playableKeys = session.crimeKeys.filter((key) => {
    const crime = getCrimeByKey(key);
    return crime && isCrimePlayableWithKeys(crime, owned);
  });

  const components: (ContainerBuilder | ActionRowBuilder<StringSelectMenuBuilder>)[] = [container];

  if (playableKeys.length > 0) {
    const selectOptions = await Promise.all(
      playableKeys.map(async (key) => {
        const crime = getCrimeByKey(key)!;
        const preview = await computeCrimePreview(ownerId, crime);
        return new StringSelectMenuOptionBuilder()
          .setLabel(crime.name.slice(0, 100))
          .setValue(key)
          .setDescription(`${tierLabel(crime.tier)} · ${preview.stageCount} stage${preview.stageCount > 1 ? "s" : ""}`);
      }),
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId(crimeCustomId("select", ownerId, session.sessionId))
      .setPlaceholder("Select a crime")
      .addOptions(selectOptions);
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${Mascot.Emotes.Lock} All jobs on this board are locked. Buy required gear from \`${prefix}shop\` or craft via Hunt Craft in \`${prefix}inventory\`.`,
      ),
    );
  }

  return {
    components,
    flags: CRIME_V2_FLAGS,
  };
}

export async function buildCrimePrepPayload(ownerId: string, session: CrimeSession, crimeKey: string) {
  const crime = getCrimeByKey(crimeKey);
  if (!crime || !session.crimeKeys.includes(crimeKey)) {
    throw new Error("Invalid crime selection.");
  }

  const owned = await getOwnedPrepKeys(ownerId);
  if (!isCrimePlayableWithKeys(crime, owned)) {
    throw new Error("You do not own all required gear.");
  }

  const preview = await computeCrimePreview(ownerId, crime);
  const gearLines = crime.requiredItems.map((key) => {
    const prep = getCrimePrepItem(key)!;
    const craftTag = prep.source === "hunt_craft" ? " · Hunt Craft" : "";
    return `${Mascot.Emotes.Tick} **${prep.name}** · +${Math.round(prep.payoutBonus * 100)}% payout${craftTag}`;
  });

  const titlePrefix = crime.tier === "legendary" ? `${Mascot.Emotes.Alert} Legendary Prep` : `${Mascot.Emotes.Gun} Crime Prep`;
  const stageLabel = preview.stageCount === 1 ? "1 stage" : `${preview.stageCount} stages`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${titlePrefix} — ${crime.name}`),
      new TextDisplayBuilder().setContent(
        `This job has **${stageLabel}**. Pass all to succeed.\n\n` +
          `Required gear (must own all):\n\n${gearLines.join("\n")}\n\n` +
          `Payout ${fmtCurrency(preview.payoutMin)}–${fmtCurrency(preview.payoutMax)} · ` +
          `Fail fine ${fmtCurrency(crime.fineMin)}–${fmtCurrency(crime.fineMax)}`,
      ),
    )
    .addSeparatorComponents(separator());

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(crimeCustomId("confirm", ownerId, session.sessionId, crimeKey))
      .setLabel("Commit Crime")
      .setStyle(ButtonStyle.Danger)
      .setEmoji(Mascot.Emotes.Gun),
    new ButtonBuilder()
      .setCustomId(crimeCustomId("back", ownerId, session.sessionId))
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(Mascot.Emotes.Decline),
  );

  return {
    components: [container, row],
    flags: CRIME_V2_FLAGS,
  };
}

export function buildCrimeStagePayload(
  run: CrimeRun,
  stageDef: CrimeMinigameStage,
  crimeName: string,
  totalStages: number,
) {
  const stageNum = stageDef.stageIndex + 1;
  const deadlineUnix = Math.floor((run.stageStartedAt + stageDef.timeSeconds * 1000) / 1000);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.Gun} ${crimeName} — Stage ${stageNum}/${totalStages}`,
      ),
      new TextDisplayBuilder().setContent(`**${stageDef.title}**\n${stageDef.prompt}`),
      new TextDisplayBuilder().setContent(
        `-# ${stageDef.timeSeconds}s limit · ends <t:${deadlineUnix}:R> · Wrong choice fails the job`,
      ),
    )
    .addSeparatorComponents(separator());

  const buttons = stageDef.options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(crimeMinigameCustomId(run.ownerId, run.runId, stageDef.stageIndex, i))
      .setLabel(opt.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));

  return { components: [container, row], flags: CRIME_V2_FLAGS };
}

export async function buildCrimeCooldownPayload(
  ownerId: string,
  expiresAt: Date,
  prefix: string,
  lastResult?: { crimeName: string; success: boolean; amount: number; jailed?: boolean } | null,
) {
  let lastLine = "";
  if (lastResult) {
    lastLine = lastResult.success
      ? `\n\nLast job: **${lastResult.crimeName}** — ${Mascot.Emotes.Money} won ${fmtCurrency(lastResult.amount)}.`
      : `\n\nLast job: **${lastResult.crimeName}** — ${Mascot.Emotes.Fail} lost ${fmtCurrency(lastResult.amount)}${lastResult.jailed ? " (jailed)" : ""}.`;
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Cooldown} Crime Cooldown`),
      new TextDisplayBuilder().setContent(
        `Next job available ${formatDiscordRelativeTime(expiresAt)}.${lastLine}\n\n-# Run \`${prefix}crime\` again when the timer ends.`,
      ),
    );

  return { components: [container], flags: CRIME_V2_FLAGS };
}

export function buildCrimeResultPayload(
  title: string,
  body: string,
  accentColor: number,
) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body),
    );

  return { components: [container], flags: CRIME_V2_FLAGS };
}
