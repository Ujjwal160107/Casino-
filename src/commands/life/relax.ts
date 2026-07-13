import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from "discord.js";
import { Mascot } from "../../config/branding";
import { nextStepHint } from "../../config/nextSteps";
import { getRelaxSnapshot, listRelaxOptions } from "../../services/relaxService";
import { fmtCurrency } from "../../utils/format";
import { getGuildPrefix } from "../../utils/guildContext";

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

export function buildRelaxCustomId(ownerId: string, optionId: string) {
  return `relax:${ownerId}:${optionId}`;
}

export async function buildRelaxDashboard(ownerId: string, guildId: string, username: string) {
  const prefix = await getGuildPrefix(guildId);
  const snapshot = await getRelaxSnapshot(ownerId, username);
  const totalStress = snapshot.jobStress + (snapshot.educationStress ?? 0);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Meditation} Relax & Recover`),
      new TextDisplayBuilder().setContent(
        `**Wallet:** ${fmtCurrency(snapshot.walletBalance)}\n` +
        `**Job Stress:** ${snapshot.jobStress}/100\n` +
        `**Education Stress:** ${snapshot.hasEducation ? `${snapshot.educationStress}/100` : "Not enrolled"}`,
      ),
    )
    .addSeparatorComponents(separator());

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (const option of listRelaxOptions()) {
    const canUse = totalStress > 0 && snapshot.walletBalance >= option.cost;
    const status = totalStress <= 0
      ? "No stress"
      : snapshot.walletBalance >= option.cost
        ? "Available"
        : "Not enough wallet funds";

    container
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### ${option.name}\n` +
              `**Cost:** ${fmtCurrency(option.cost)}\n` +
              `**Reduces:** Job -${option.jobStressReduction}, Education -${option.educationStressReduction}\n` +
              `**Status:** ${status}`,
            ),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(buildRelaxCustomId(ownerId, option.id))
              .setLabel(canUse ? "Choose" : "Locked")
              .setStyle(canUse ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setEmoji(canUse ? Mascot.Emotes.Accept : Mascot.Emotes.Lock)
              .setDisabled(!canUse),
          ),
      )
      .addSeparatorComponents(separator());

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(buildRelaxCustomId(ownerId, option.id))
        .setLabel(option.name)
        .setStyle(canUse ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canUse),
    );

    if (currentRow.components.length === 4) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
  }

  if (currentRow.components.length > 0) rows.push(currentRow);

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("relax", prefix)!));

  return {
    container,
    rows,
    snapshot
  };
}

export async function handleRelax(message: Message) {
  if (!message.guild) return;

  const dashboard = await buildRelaxDashboard(message.author.id, message.guild.id, message.author.username);
  await message.reply({
    components: [dashboard.container],
    flags: MessageFlags.IsComponentsV2,
  });
}
