// The turf screens (spec 13.3 S16–S21 and the war half of S25), the bid modal
// and the hit result: pure builders from plain view objects. No I/O. Board
// art modes: "send" posts the banner file (a new message), "keep" shows the
// gallery the message already holds (an edit, no files), "none" no gallery.
import {
  ActionRowBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { RACKET_CLASSES, WAR_BLOCKS, WAR_RULES, racketDef } from "../../data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { cfEmoji } from "../../utils/crimeFamilyAssets";
import { fmtFortunes } from "../../utils/format";
import type { ArmedHit, ScoutReport } from "../../services/crimeFamily/warActions";
import { blockResults, type WarBlockKey } from "../../services/crimeFamily/warMath";
import type { RacketDetailView, TurfMapView, TurfRacketLine, WarBoardView, WarResultView } from "../../services/crimeFamily/views";
import { CREW_IDS, TURF_IDS } from "./ids";
import { addThumbSection, bannerGallery, buttonRow, cfButton, cfLabel, cfPayload, text, type CfPayload } from "./kit";

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const rel = (d: Date) => `<t:${unix(d)}:R>`;
const full = (d: Date) => `<t:${unix(d)}:F>`;
const sep = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
const mention = (id: string) => `<@${id}>`;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon 18:00 UTC". */
const warSlot = (d: Date) => `${DAYS[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
const blockDef = (key: WarBlockKey) => WAR_BLOCKS.find((b) => b.key === key)!;

// ── S16 ──────────────────────────────────────────────────────────────────────

function mapLine(line: TurfRacketLine, n: number): string {
  const war = line.war?.status === "BIDDING" && line.war.topBid > 0 ? ` · top bid ${fmtFortunes(line.war.topBid)}`
    : line.war?.status === "ACTIVE" ? " · war live" : "";
  return `${n}. ${cfLabel(RACKET_CLASSES[line.class].emojiKey, `**${line.name}**`)} · ${line.ownerLabel} · ` +
    `${fmtFortunes(line.income)}/day · war ${warSlot(line.nextWarAt)}${war}`;
}

/** S16: always into a message that does not hold the map, so the banner is sent and old attachments cleared. */
export function buildTurfMap(ownerId: string, v: TurfMapView): CfPayload {
  const banner = bannerGallery("turf_map");
  const numbered = v.rackets.map((line, i) => ({ line, n: i + 1 }));
  const group = (cls: TurfRacketLine["class"]) => {
    const c = RACKET_CLASSES[cls];
    const level = c.minFamilyLevel > 1 ? `family L${c.minFamilyLevel}+` : "any level";
    return text([`**${c.name}** (${level})`, ...numbered.filter((x) => x.line.class === cls).map((x) => mapLine(x.line, x.n))].join("\n"));
  };
  const container = new ContainerBuilder();
  if (banner) container.addMediaGalleryComponents(banner.gallery);
  container
    .addTextDisplayComponents(text(
      `## ${cfLabel("war", "Turf")}\n-# Rackets pay family earnings daily. Win a racket's weekly war to take it.`,
    ))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(group("CORNER"), group("DISTRICT"), group("CROWN"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(`**Next war:** ${v.nextWar.racketName} ${full(v.nextWar.startsAt)}`));
  const select = new StringSelectMenuBuilder()
    .setCustomId(TURF_IDS.select(ownerId))
    .setPlaceholder("Racket details…")
    .addOptions(v.rackets.map((line) => {
      const c = RACKET_CLASSES[line.class];
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(line.name)
        .setDescription(`${c.name} · ${fmtFortunes(line.income)}/day`)
        .setValue(line.key);
      const emoji = cfEmoji(c.emojiKey);
      if (emoji) option.setEmoji(emoji);
      return option;
    }));
  container
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select))
    .addActionRowComponents(buttonRow(
      cfButton(TURF_IDS.viewWar(ownerId), "War board", ButtonStyle.Primary, { emojiKey: "war" }),
      cfButton(CREW_IDS.view("home", ownerId), "Back"),
    ));
  return cfPayload(container, { files: banner ? [banner.file] : undefined, freshAttachments: true });
}

// ── S17 ──────────────────────────────────────────────────────────────────────

function biddingLine(line: TurfRacketLine): string {
  const war = line.war;
  if (war?.status === "BIDDING") {
    const top = war.topBid > 0 ? `${fmtFortunes(war.topBid)} by ${war.topBidderLabel ?? "a family"}` : "none yet";
    return `**Top bid:** ${top} · bidding closes ${rel(war.bidClosesAt)}`;
  }
  if (war?.status === "ARMED") return `**Bidding closed:** ${war.topBidderLabel ?? "a family"} attacks ${rel(war.startsAt)}`;
  if (war?.status === "ACTIVE") return `**War live:** ${war.topBidderLabel ?? "a family"} is attacking now`;
  const { phase, nextOpensAt } = line.bidding;
  if (phase === "OPEN") return "**Bidding:** open, no bids yet";
  if (phase === "CLOSED") return `**Bidding:** closed, no bids this week · next window opens ${rel(nextOpensAt)}`;
  return `**Bidding:** opens ${rel(nextOpensAt)}`;
}

/** S17: always sends its class thumbnail and clears old attachments (it opens over S16's map). */
export function buildRacketDetail(ownerId: string, v: RacketDetailView, note?: string): CfPayload {
  const { line } = v;
  const c = RACKET_CLASSES[line.class];
  const container = new ContainerBuilder();
  const file = addThumbSection(container, `## ${line.name}\n${c.name} racket · ${line.ownerLabel}`, c.emojiKey);
  const details = [
    `**Owner:** ${line.ownerLabel}`,
    `**Income:** ${fmtFortunes(line.income)} a day into earnings · neglect strikes ${line.strikes}/${CRIME_FAMILY_CONFIG.neglectStrikesToRelease}`,
    biddingLine(line),
    `**Floor:** ${fmtFortunes(v.floor)} · **next bid:** at least ${fmtFortunes(v.minBid)}`,
    `**War:** weekly, ${warSlot(line.nextWarAt)} · next ${full(line.nextWarAt)}`,
    `**Class level:** family L${v.minFamilyLevel}+`,
  ];
  const hint = note ?? (v.blockers[0]
    ? `-# ${v.blockers[0]}`
    : "-# Bids come from family earnings only (never the treasury) and are burned when the war settles, win or lose.");
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(details.join("\n")), text(hint))
    .addActionRowComponents(buttonRow(
      cfButton(TURF_IDS.bid(line.key, ownerId), "Bid", ButtonStyle.Primary, { disabled: !v.canBid }),
      cfButton(TURF_IDS.viewMap(ownerId), "Back"),
    ));
  return cfPayload(container, { files: file ? [file] : undefined, freshAttachments: true });
}

export function buildBidModal(racketKey: string, ownerId: string): ModalBuilder {
  const name = racketDef(racketKey)?.name ?? "racket";
  return new ModalBuilder()
    .setCustomId(TURF_IDS.bidModal(racketKey, ownerId))
    .setTitle(`Bid on ${name}`.slice(0, 45))
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("amount").setLabel("Bid (earnings only)").setStyle(TextInputStyle.Short)
        .setRequired(true).setMaxLength(20).setPlaceholder("e.g. 2.1m"),
    ));
}

// ── S18, S25 ─────────────────────────────────────────────────────────────────

/** Scout plus one Hit button per block: shared by S18 and the S25 war card. */
function warActionRow(warId: string) {
  return buttonRow(
    cfButton(TURF_IDS.scout(warId), "Scout", ButtonStyle.Secondary, { emojiKey: "role_lookout" }),
    ...WAR_BLOCKS.map((b) => cfButton(TURF_IDS.hit(warId, b.key), `Hit ${b.name}`, ButtonStyle.Danger, { emojiKey: b.emojiKey })),
  );
}

function sidesLine(v: WarBoardView): string {
  return `${v.attacker.label} attacks · ${v.defender.label} defends`;
}

function topLine(label: string, top: { userId: string; points: number }[]): string {
  return `${label}: ${top.length ? top.map((t) => `${mention(t.userId)} ${t.points}`).join(" · ") : "no points yet"}`;
}

export function buildWarBoard(v: WarBoardView, art: "send" | "keep" | "none"): CfPayload {
  const banner = art === "none" ? null : bannerGallery("war_banner");
  const scores = WAR_BLOCKS.map((b) => {
    const s = v.scores[b.key];
    return `${cfLabel(b.emojiKey, b.name)}: ${v.blackout ? "?? vs ??" : `${s.atk} vs ${s.def}`}`;
  });
  const hitters = v.blackout
    ? `**Blackout:** block scores are hidden until the end.\nHits: ${v.hits.atk} vs ${v.hits.def}`
    : `**Top hitters**\n${topLine("Attack", v.top.atk)}\n${topLine("Defence", v.top.def)}`;
  const c = CRIME_FAMILY_CONFIG;
  const container = new ContainerBuilder();
  if (banner) container.addMediaGalleryComponents(banner.gallery);
  container
    .addTextDisplayComponents(text(`## ${cfLabel("war", `War: ${v.racketName}`)}\n${sidesLine(v)} · ends ${rel(v.endsAt)}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(`**Block scores** (attack vs defence)\n${scores.join("\n")}`), text(hitters))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(
      `-# Scout is free once every ${Math.round(c.scoutSlotSeconds / 60)} minutes and shows one block's weak point. ` +
      `A hit costs ${fmtFortunes(c.hitCost)} and scores +${WAR_RULES.atkPoints} attacking or +${WAR_RULES.defPoints} defending with the right approach. ` +
      "Win 2 of 3 blocks. The board refreshes once a minute.",
    ))
    .addActionRowComponents(warActionRow(v.warId));
  const send = art === "send" && banner !== null;
  return cfPayload(container, { files: send ? [banner.file] : undefined, freshAttachments: send });
}

/** S25 war: a member's personal card (no scores, so it never needs a refresh). */
export function buildWarCard(v: { warId: string; racketName: string; endsAt: Date; jumpUrl: string | null }): CfPayload {
  const line = `War on ${v.racketName} ends ${rel(v.endsAt)}, scores on the home board.`;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(v.jumpUrl ? `${line}\n[Go to the board](${v.jumpUrl})` : line))
    .addActionRowComponents(warActionRow(v.warId));
  return cfPayload(container);
}

// ── S19, S20 ─────────────────────────────────────────────────────────────────

/** S19: plain-label approach buttons, so no emoji can hint at the weak point (16.3). */
export function buildHitCall(h: ArmedHit, blockName: string): CfPayload {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`### Hit on ${blockName}\nLock in an approach ${rel(h.deadline)} · this weak point holds until ${rel(h.slotEndsAt)}`),
      text("-# Use your crew's scout call if you have one. A miss scores nothing."),
    )
    .addActionRowComponents(buttonRow(...h.approaches.map((label, i) => cfButton(TURF_IDS.hitAnswer(h.hitId, i), label))));
  return cfPayload(container, { ephemeral: true });
}

export function buildHitResult(content: string): CfPayload {
  return cfPayload(new ContainerBuilder().addTextDisplayComponents(text(content)), { ephemeral: true });
}

export function buildScoutReport(r: ScoutReport, blockName: string): CfPayload {
  const container = new ContainerBuilder().addTextDisplayComponents(
    text(`${cfLabel(blockDef(r.block).emojiKey, blockName)}: weak point is **${r.approach}** until ${rel(r.slotEndsAt)}`),
    text("-# Share it with your crew in the home channel."),
  );
  return cfPayload(container, { ephemeral: true });
}

// ── S21 ──────────────────────────────────────────────────────────────────────

/** "Turf war on <racket>: <label> captured it (2 of 3 blocks)." / "…held it." / "… was called off: downtime.": S21 and the S28 result notice. */
export function warOutcomeLine(v: Pick<WarResultView, "board" | "outcome">): string {
  const b = v.board;
  const head = `Turf war on ${b.racketName}`;
  if (v.outcome === "CANCELLED") return `${head} was called off: downtime.`;
  if (v.outcome === "HELD") return `${head}: ${b.defender.label} held it.`;
  const won = blockResults(b.scores).filter((r) => r.winner === "ATK").length;
  return `${head}: ${b.attacker.label} captured it (${won} of ${WAR_BLOCKS.length} blocks).`;
}

function resultTerms(v: WarResultView): string {
  const b = v.board;
  const lines: string[] = [];
  if (v.outcome === "CANCELLED") {
    lines.push("The bid was refunded. No ownership change, XP or heat.");
  } else {
    if (v.outcome === "CAPTURED") {
      lines.push(v.overCap
        ? `${b.attacker.label} is at its racket cap, so ${b.racketName} goes to the Street.`
        : `${b.racketName} now belongs to ${b.attacker.label}.`);
    } else {
      lines.push(`${b.defender.label} keeps ${b.racketName}.`);
    }
    lines.push("The winning bid was burned.");
    if (v.xp.length) lines.push(`XP: ${v.xp.map((x) => `${x.label} +${fmtFortunes(x.xp)}`).join(" · ")}`);
    if (v.heated > 0) lines.push(`${v.heated} attacking hitter${v.heated === 1 ? "" : "s"} took +${WAR_RULES.lossHeat} heat.`);
  }
  return lines.join("\n");
}

/** S21: the edit of S18, with no action row and no files (the gallery stays only when the message holds it). */
export function buildWarResult(v: WarResultView, art: "keep" | "none"): CfPayload {
  const banner = art === "keep" ? bannerGallery("war_banner") : null;
  const results = blockResults(v.board.scores).map((r) => {
    const b = blockDef(r.block);
    const winner = v.outcome === "CANCELLED" ? "" : `, ${r.winner === "ATK" ? "attack" : "defence"}`;
    return `${cfLabel(b.emojiKey, b.name)}: ${r.atk} vs ${r.def}${winner}`;
  });
  const container = new ContainerBuilder();
  if (banner) container.addMediaGalleryComponents(banner.gallery);
  container
    .addTextDisplayComponents(text(`## ${cfLabel("war", `War over: ${v.board.racketName}`)}\n${warOutcomeLine(v)}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(results.join("\n")), text(resultTerms(v)));
  return cfPayload(container);
}
