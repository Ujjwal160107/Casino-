// The caper screens (spec 13.3 S11–S15, the S25 caper card, the S28 GO call
// and "Lobby moved", and C14's cancelled card): pure builders from plain view
// objects to CfPayloads. No I/O. `art: true` means the target message does
// not hold the banner yet: the file is sent and old attachments are cleared.
import {
  ActionRowBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { caperRole, caperTier, CAPER_TIERS, type CaperRoleKey, type CaperTierDef } from "../../data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { cfEmoji } from "../../utils/crimeFamilyAssets";
import { fmtFortunes } from "../../utils/format";
import { splitCaperPool } from "../../services/crimeFamily/caperMath";
import type { BriefView, CaperCardView, CaperPlannerView, CaperSeatView } from "../../services/crimeFamily/views";
import { CPR_IDS } from "./ids";
import { addThumbSection, bannerGallery, buildNotice, buttonRow, cfButton, cfLabel, cfPayload, text, type CfPayload } from "./kit";
import { jumpLink } from "./post";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const sep = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
const minutes = (seconds: number) => Math.round(seconds / 60);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mention = (id: string) => `<@${id}>`;

/** "<emoji> Name", or the plain name while the role icon is not loaded. */
const roleLabel = (role: CaperRoleKey) => cfLabel(caperRole(role).emojiKey, caperRole(role).name);

function seatGates(tier: CaperTierDef): string {
  const g = tier.seatGate;
  return `${fmtFortunes(g.shifts)} shifts · ${g.fortunaAgeDays} days Fortuna age · ${fmtFortunes(g.netWorth)} net worth`;
}

function bustTerms(tier: CaperTierDef): string {
  const jail = tier.jail ? `, ${pct(tier.jail.chance)} chance of ${minutes(tier.jail.seconds)} min jail` : "";
  return `fine ${fmtFortunes(tier.bustFine)}${jail}`;
}

// ── S11 ──────────────────────────────────────────────────────────────────────

function tierLine(tier: CaperTierDef, unlocked: boolean): string {
  const lock = unlocked ? "" : ` · unlocks at L${tier.levelToPlan}`;
  return `**T${tier.tier} ${tier.name}** · L${tier.levelToPlan} · crew ${tier.crewMin}–${tier.crewMax}${lock}\n` +
    `Pool ${fmtFortunes(tier.poolPerSeat)} a seat · stake ${fmtFortunes(tier.stake)} · Bust ${bustTerms(tier)} · heat below ${tier.heatCeiling}\n` +
    `-# Gates: ${seatGates(tier)}`;
}

function familyStatus(v: CaperPlannerView): string {
  const lines = [
    `**Next caper:** ${v.nextCaperAt.getTime() > Date.now() ? rel(v.nextCaperAt) : "ready"}` +
      ` · **Started:** ${v.startedLast24h}/${CRIME_FAMILY_CONFIG.capersPerFamilyPer24h} in 24 h`,
  ];
  if (v.duesArrears > 0) lines.push(`Dues in arrears: ${v.duesArrears} days`);
  if (v.underInvestigation) lines.push("Under investigation: no capers until the family cools down.");
  if (v.live) {
    const link = v.live.messageId ? ` · ${jumpLink(v.live.guildId, v.live.channelId, v.live.messageId)}` : "";
    lines.push(`**Live caper:** T${v.live.tier} ${caperTier(v.live.tier).name} (${v.live.status.toLowerCase()})${link}`);
  }
  return lines.join("\n");
}

export function buildCaperPlanner(v: CaperPlannerView, opts: { art: boolean; ephemeral: boolean }): CfPayload {
  const unlocked = new Set(v.tiers.filter((t) => t.unlocked).map((t) => t.tier));
  const container = new ContainerBuilder();
  const file = addThumbSection(container, `## ${cfLabel("caper", "Capers")}\n${v.familyLabel} · level ${v.level}`, "caper");
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(
        "**How a caper works**\n" +
        `1. A Capo or above plans a tier and pays the stake; the lobby stays open ${minutes(CRIME_FAMILY_CONFIG.lobbySeconds)} minutes.\n` +
        "2. Members join by role, each holding one of the role's prep items, and pay the same stake.\n" +
        `3. GO lasts ${CRIME_FAMILY_CONFIG.goSeconds} s: open your brief, tell your contact their intel and lock your own call.\n` +
        `4. A seat that has not opened its brief ${CRIME_FAMILY_CONFIG.leakAtSecondsLeft} s before the end goes dark and counts as a miss.`,
      ),
      text(CAPER_TIERS.map((t) => tierLine(t, unlocked.has(t.tier))).join("\n")),
      text(familyStatus(v)),
    );
  if (v.canPlan && v.live === null && !v.underInvestigation && unlocked.size > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(CPR_IDS.plan(v.ownerId))
      .setPlaceholder("Plan a caper…")
      .addOptions(CAPER_TIERS.filter((t) => unlocked.has(t.tier)).map((t) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`T${t.tier} · ${t.name}`)
          .setDescription(`Stake ${fmtFortunes(t.stake)} · crew ${t.crewMin}–${t.crewMax}`)
          .setValue(String(t.tier))));
    container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  return cfPayload(container, { files: opts.art && file ? [file] : undefined, freshAttachments: opts.art, ephemeral: opts.ephemeral });
}

// ── S12, S13, S15, cancelled ────────────────────────────────────────────────

const seated = (v: CaperCardView) => v.seats.filter((s): s is CaperSeatView & { userId: string } => s.userId !== null);

function buildLobby(v: CaperCardView, tier: CaperTierDef, art: boolean): CfPayload {
  const banner = bannerGallery(tier.bannerKey);
  const clean = splitCaperPool({ poolPerSeat: tier.poolPerSeat, n: tier.crewMax, outcome: "CLEAN", locked: Array(tier.crewMax).fill(true) });
  const roster = v.seats.map((s) =>
    `${roleLabel(s.role)} · ${s.userId ? mention(s.userId) : "open"}${s.optional ? " (optional)" : ""}`);
  const hint = v.note ?? (v.openRoles.length === 0
    ? "All seats filled, waiting for Start"
    : `-# Pick a role from **Join as…** or use \`!caper join <role>\`. Start needs ${tier.required.map((r) => caperRole(r).name).join(", ")}; ` +
      "the caper starts by itself once every seat is filled.");

  const container = new ContainerBuilder();
  if (banner) container.addMediaGalleryComponents(banner.gallery);
  container
    .addTextDisplayComponents(text(`## ${tier.name}\n${v.familyLabel} · T${tier.tier} lobby · closes ${rel(v.lobbyClosesAt)}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(roster.join("\n")))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(
        `**Stake:** ${fmtFortunes(tier.stake)} a seat · **Clean cut:** ${fmtFortunes(clean.cutPerSeat)} a seat (full crew)\n` +
        `**Bust:** ${bustTerms(tier)}\n` +
        `**Heat:** +${tier.heat.clean} Clean · +${tier.heat.messy} Messy · +${tier.heat.bust} Bust · seats need heat below ${tier.heatCeiling}\n` +
        `**Seat gates:** ${seatGates(tier)}`,
      ),
      text(hint),
    );
  if (v.openRoles.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(CPR_IDS.join(v.caperId))
      .setPlaceholder("Join as…")
      .addOptions(v.openRoles.map((role) => {
        const option = new StringSelectMenuOptionBuilder().setLabel(caperRole(role).name).setValue(role);
        const emoji = cfEmoji(caperRole(role).emojiKey);
        if (emoji) option.setEmoji(emoji);
        return option;
      }));
    container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  container.addActionRowComponents(buttonRow(
    cfButton(CPR_IDS.leave(v.caperId), "Leave"),
    cfButton(CPR_IDS.start(v.caperId), "Start", ButtonStyle.Success),
    cfButton(CPR_IDS.cancel(v.caperId), "Cancel", ButtonStyle.Danger),
  ));
  return cfPayload(container, { files: art && banner ? [banner.file] : undefined, freshAttachments: art });
}

function buildGo(v: CaperCardView, tier: CaperTierDef, art: boolean): CfPayload {
  const banner = bannerGallery(tier.bannerKey);
  const roster = seated(v).map((s) => `${roleLabel(s.role)} · ${mention(s.userId)} · ${s.locked ? "locked in" : "deciding"}`);
  const hint = v.note ?? (v.status === "SETTLING"
    ? "-# Every call is in. Settling the take…"
    : "-# Open your brief: tell your contact their intel and lock your own call. A seat that has not opened its brief by the leak goes dark and misses.");
  const container = new ContainerBuilder();
  if (banner) container.addMediaGalleryComponents(banner.gallery);
  container
    .addTextDisplayComponents(text(`## ${tier.name} · GO\n${v.familyLabel} · GO ends ${rel(v.goEndsAt)} · intel leaks ${rel(v.leakAt)}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`**Locked in ${v.lockedCount}/${v.crewCount}**\n${roster.join("\n")}`),
      text(hint),
    )
    .addActionRowComponents(buttonRow(cfButton(CPR_IDS.brief(v.caperId), "Open brief", ButtonStyle.Primary)));
  return cfPayload(container, { files: art && banner ? [banner.file] : undefined, freshAttachments: art });
}

function stepLine(s: CaperSeatView & { userId: string }): string {
  const mark = s.passed ? Mascot.Emotes.Accept : Mascot.Emotes.Decline;
  const intel = s.holderId ? ` · intel ${mention(s.holderId)} → call ${mention(s.userId)}` : ` · ${mention(s.userId)}`;
  return `${mark} ${roleLabel(s.role)}${intel}${s.leaked ? " (leaked)" : ""}${s.dark ? " (went dark)" : ""}`;
}

function payoutLine(s: CaperSeatView & { userId: string }, tier: CaperTierDef): string {
  if (s.fine <= 0) return `${mention(s.userId)} +${fmtFortunes(s.cut)}`;
  const jail = s.jailed && tier.jail ? ` · jailed ${minutes(tier.jail.seconds)} min` : "";
  return `${mention(s.userId)} −${fmtFortunes(s.fine)}${jail}`;
}

function buildResult(v: CaperCardView, tier: CaperTierDef): CfPayload {
  const banner = bannerGallery(`result_${v.outcome.toLowerCase()}`);
  const seats = seated(v);
  const container = new ContainerBuilder();
  if (banner) container.addMediaGalleryComponents(banner.gallery);
  container
    .addTextDisplayComponents(text(
      `## ${tier.name}\n**${v.outcome}** · roll ${v.roll.toFixed(4)} vs patrol ${v.patrolChance.toFixed(4)} · pool ${fmtFortunes(v.pool)}\n${v.familyLabel}`,
    ))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(seats.map(stepLine).join("\n")))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(seats.map((s) => payoutLine(s, tier)).join("\n")),
      text(v.note ?? "-# Caper over. `!caper` shows when the family's next caper is ready."),
    );
  return cfPayload(container, { files: banner ? [banner.file] : undefined, freshAttachments: true });
}

function buildCancelled(v: CaperCardView, tier: CaperTierDef): CfPayload {
  const title = v.outcome === "VOID" ? "Caper void" : "Caper cancelled";
  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`## ${title}\n${tier.name} · ${v.familyLabel}`),
    text(v.note ? `Every stake was refunded.\n${v.note}` : "Every stake was refunded."),
  );
  return cfPayload(container, { freshAttachments: true });
}

/** The one shared caper card, by status: S12 lobby, S13 GO, S15 result, or the C14 cancelled card. */
export function buildCaperCard(v: CaperCardView, opts: { art: boolean }): CfPayload {
  const tier = caperTier(v.tier);
  switch (v.status) {
    case "LOBBY": return buildLobby(v, tier, opts.art);
    case "RUNNING":
    case "SETTLING": return buildGo(v, tier, opts.art);
    case "RESOLVED": return buildResult(v, tier);
    case "CANCELLED": return buildCancelled(v, tier);
  }
}

// ── S14 ──────────────────────────────────────────────────────────────────────

/** One seat's private brief. Option labels are plain text with no emoji, so nothing can hint at the answer (8.3). */
export function buildBrief(v: BriefView): CfPayload {
  const call: string[] = [];
  if (v.dark) {
    call.push("You went dark: this seat counts as a miss.");
  } else {
    call.push(`**${v.call.question}?** ${mention(v.call.fromUserId)} has your intel.`);
    if (v.leaked !== null) call.push(`Your contact went dark. The intel leaked: **${v.leaked}**`);
    if (v.lockedIndex !== null) call.push(`Locked in: **${v.call.options[v.lockedIndex]}**`);
    else if (v.leaked === null) call.push(`-# If your contact goes dark, the intel leaks ${rel(v.leakAt)}; press Refresh then.`);
  }
  call.push(`-# GO ends ${rel(v.goEndsAt)}.`);

  const refresh = cfButton(CPR_IDS.brief(v.caperId), "Refresh");
  const row = v.dark
    ? buttonRow(refresh)
    : buttonRow(
      ...v.call.options.map((label, i) => cfButton(CPR_IDS.act(v.caperId, i), label,
        v.lockedIndex === i ? ButtonStyle.Success : ButtonStyle.Secondary, { disabled: v.lockedIndex !== null })),
      refresh,
    );
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`### ${roleLabel(v.role)} brief\nTell ${mention(v.tell.userId)}: **${v.tell.label}**`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(call.join("\n")))
    .addActionRowComponents(row);
  return cfPayload(container, { ephemeral: true });
}

// ── S25, S28 ─────────────────────────────────────────────────────────────────

/** S25: a member's personal caper card (status and jump link, no roster, so it never needs a refresh). */
export function buildCaperSeatCard(v: { caperId: string; text: string; jumpUrl: string | null }): CfPayload {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(v.jumpUrl ? `${v.text}\n[Go to the caper](${v.jumpUrl})` : v.text))
    .addActionRowComponents(buttonRow(cfButton(CPR_IDS.brief(v.caperId), "Open brief", ButtonStyle.Primary)));
  return cfPayload(container);
}

/** S28 GO call: the only caper payload that pings, and only the crew. */
export function buildGoCall(v: { caperId: string; crewIds: string[]; goEndsAt: Date; pinched: string[] }): CfPayload {
  const pinched = v.pinched.length > 0 ? `\nPinched at Start: ${v.pinched.map(mention).join(", ")} (stake refunded)` : "";
  return buildNotice(
    `Caper GO! ${v.crewIds.map(mention).join(" ")} Open your brief. GO ends ${rel(v.goEndsAt)}.${pinched}`,
    { customId: CPR_IDS.brief(v.caperId), label: "Open brief" },
    v.crewIds,
  );
}

/** S28 "Lobby moved": the edit of a superseded lobby card, clearing its banner. */
export function buildLobbyMoved(jumpUrl: string): CfPayload {
  return { ...buildNotice(`Lobby moved: ${jumpUrl}`), attachments: [] };
}
