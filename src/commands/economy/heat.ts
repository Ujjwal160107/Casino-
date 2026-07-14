import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { getFixerCost, getHeatSnapshot, HeatSnapshot } from "../../services/taxService";
import { TAX_CONFIG } from "../../utils/economyConfig";
import { fmtCurrency } from "../../utils/format";

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function timestamp(date: Date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function heatStatus(heat: number): { label: string; raidText: string } {
  if (heat >= TAX_CONFIG.raidHeatThreshold) {
    return { label: "Wanted", raidText: "A raid check runs every hour while you are wanted." };
  }
  if (heat >= 70) return { label: "Watched", raidText: `Raid checks begin at ${TAX_CONFIG.raidHeatThreshold} heat.` };
  if (heat >= 40) return { label: "Noticed", raidText: `Raid checks begin at ${TAX_CONFIG.raidHeatThreshold} heat.` };
  return { label: "Cold", raidText: `Raid checks begin at ${TAX_CONFIG.raidHeatThreshold} heat.` };
}

function layLowStatus(snapshot: HeatSnapshot): { available: boolean; text: string } {
  if (snapshot.heat <= 0) return { available: false, text: "No heat to reduce" };
  if (snapshot.layLowAvailableAt) return { available: false, text: `Ready ${timestamp(snapshot.layLowAvailableAt)}` };
  return { available: true, text: "Available" };
}

function fixerStatus(snapshot: HeatSnapshot, cost: number): { available: boolean; text: string } {
  if (snapshot.heat < TAX_CONFIG.fixerMinimumHeat) {
    return { available: false, text: `Requires ${TAX_CONFIG.fixerMinimumHeat} heat` };
  }
  if (snapshot.fixerAvailableAt) return { available: false, text: `Ready ${timestamp(snapshot.fixerAvailableAt)}` };
  if (snapshot.walletBalance < cost) return { available: false, text: "Not enough wallet funds" };
  return { available: true, text: "Available" };
}

export function buildHeatCustomId(ownerId: string, actionId: "lay_low" | "fixer") {
  return `heat:${ownerId}:${actionId}`;
}

export async function buildHeatDashboard(ownerId: string, username: string) {
  const snapshot = await getHeatSnapshot(ownerId, username);
  const status = heatStatus(snapshot.heat);
  const layLow = layLowStatus(snapshot);
  const fixerCost = getFixerCost(snapshot.heat);
  const fixer = fixerStatus(snapshot, fixerCost);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Police} Heat & Lay Low`),
      new TextDisplayBuilder().setContent(
        `**Heat:** ${snapshot.heat} — **${status.label}**\n`
        + `**Passive Decay:** -${TAX_CONFIG.heatDecayPerHour} heat ${timestamp(snapshot.nextDecayAt)}\n`
        + `**Raid Risk:** ${status.raidText}\n`
        + `**Wallet:** ${fmtCurrency(snapshot.walletBalance)}`,
      ),
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${Mascot.Emotes.Meditation} Lay Low\n`
            + `**Free** · Reduce up to **${TAX_CONFIG.layLowHeatReduction} heat**\n`
            + `**Cooldown:** ${TAX_CONFIG.layLowCooldownSeconds / 3600} hours\n`
            + `**Status:** ${layLow.text}`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(buildHeatCustomId(ownerId, "lay_low"))
            .setLabel(layLow.available ? "Lay Low" : "Locked")
            .setStyle(layLow.available ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(layLow.available ? Mascot.Emotes.Meditation : Mascot.Emotes.Lock)
            .setDisabled(!layLow.available),
        ),
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${Mascot.Emotes.Currency} Call a Fixer\n`
            + `**Cost:** ${fmtCurrency(fixerCost)} · Reduce up to **${TAX_CONFIG.fixerHeatReduction} heat**\n`
            + `**Unlock:** ${TAX_CONFIG.fixerMinimumHeat} heat · **Cooldown:** ${TAX_CONFIG.fixerCooldownSeconds / 3600} hours\n`
            + `**Status:** ${fixer.text}`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(buildHeatCustomId(ownerId, "fixer"))
            .setLabel(fixer.available ? "Call a Fixer" : "Locked")
            .setStyle(fixer.available ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setEmoji(fixer.available ? Mascot.Emotes.Money : Mascot.Emotes.Lock)
            .setDisabled(!fixer.available),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "Raids only seize wallet money. Banking protects cash from raids, but not from crime or rob fines.",
      ),
    );

  return { container, snapshot };
}

export async function handleHeat(message: Message) {
  if (!message.guild) return;
  const dashboard = await buildHeatDashboard(message.author.id, message.author.username);
  await message.reply({ components: [dashboard.container], flags: MessageFlags.IsComponentsV2 });
}
