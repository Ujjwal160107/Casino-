// The family screens (spec 13.3 S1–S10, S22–S24, S26): pure builders from
// plain view objects to CfPayloads. No I/O. `art: true` means the target
// message does not hold the art yet, so the file is sent and old attachments
// are cleared; `art: false` re-renders keep the attachment:// URL.
import {
  ActionRowBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type AttachmentBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { FAMILY_ROLES, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { cfEmoji } from "../../utils/crimeFamilyAssets";
import { fmtFortunes } from "../../utils/format";
import type { EligibilityResult } from "../../services/crimeFamily/eligibility";
import type { LedgerLine, LedgerType } from "../../services/crimeFamily/ledger";
import type { FamilyDashboardView, InviteView, LeaderboardView, PaydayPreview, VaultView } from "../../services/crimeFamily/views";
import { CPR_IDS, CREW_IDS, TURF_IDS, type CrewConfirmKind } from "./ids";
import { addThumbSection, buttonRow, cfButton, cfLabel, cfPayload, text, type CfPayload } from "./kit";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const sep = (divider = true) => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(divider);
const days = (seconds: number) => Math.round(seconds / 86_400);
const files = (art: boolean, file: AttachmentBuilder | null) => (art && file ? [file] : undefined);
const withNote = (body: string, note?: string) => (note ? `${body}\n**${note}**` : body);

function roleEmoji(role: FamilyRole | "ASSOCIATE"): string {
  const emoji = cfEmoji(FAMILY_ROLES[role].emojiKey);
  return emoji ? `${emoji} ` : "";
}

function checklist(result: EligibilityResult): string {
  return result.checks.map((c) => (c.ok ? `✓ ${c.need}` : `✗ ${c.need} (you have ${c.have})`)).join("\n");
}

// ── S1 ───────────────────────────────────────────────────────────────────────

export function buildNoFamilyCard(ownerId: string, join: EligibilityResult, found: EligibilityResult): CfPayload {
  const container = new ContainerBuilder();
  const file = addThumbSection(container,
    "## Crime Families\nYou're not in a family yet. Join one by invite, or found your own.", "fortuna_don");
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`**Join a family**\n${checklist(join)}`),
      text(`**Found one** (costs ${fmtFortunes(CRIME_FAMILY_CONFIG.createFee)})\n${checklist(found)}`),
      text("-# Ask a family's Capo for an invite; `!crew top` lists families; crew heist lobbies and results post in this server."),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.createOpen(ownerId), "Create", ButtonStyle.Primary, { disabled: !found.ok }),
      cfButton(CREW_IDS.view("invites", ownerId), "My invites"),
      cfButton(CREW_IDS.view("top", ownerId), "Top families"),
    ));
  return cfPayload(container, { files: file ? [file] : undefined, freshAttachments: true });
}

// ── S2 ───────────────────────────────────────────────────────────────────────

function rosterLine(m: FamilyDashboardView["roster"][number]): string {
  const associate = m.role !== "BOSS" && m.associateUntil !== null;
  const line = `${roleEmoji(associate ? "ASSOCIATE" : m.role)}<@${m.userId}> · ${FAMILY_ROLES[m.role].name}`;
  return associate ? `${line} · Associate until ${rel(m.associateUntil!)}` : line;
}

type RosterEntry = FamilyDashboardView["roster"][number];
/** Only a Soldier inside their 72 h is listed as an Associate; an officer stays on its rank line (F8). */
const isAssociateSoldier = (m: RosterEntry) => m.role === "SOLDIER" && m.associateUntil !== null;

const mention = (m: RosterEntry) => `<@${m.userId}>`;

const ROSTER_GROUPS: readonly { icon: FamilyRole | "ASSOCIATE"; label: string; holds: (m: RosterEntry) => boolean; entry: (m: RosterEntry) => string }[] = [
  { icon: "BOSS", label: "Boss", holds: (m) => m.role === "BOSS", entry: mention },
  { icon: "UNDERBOSS", label: "Underboss", holds: (m) => m.role === "UNDERBOSS", entry: mention },
  { icon: "CAPO", label: "Capos", holds: (m) => m.role === "CAPO", entry: mention },
  { icon: "SOLDIER", label: "Soldiers", holds: (m) => m.role === "SOLDIER" && !isAssociateSoldier(m), entry: mention },
  { icon: "ASSOCIATE", label: "Associates", holds: isAssociateSoldier, entry: (m) => `${mention(m)} ${rel(m.associateUntil!)}` },
];

/** S2's roster (amendment 2.5): one line per non-empty rank group. */
function groupedRoster(roster: readonly RosterEntry[]): string {
  return ROSTER_GROUPS.flatMap((g) => {
    const held = roster.filter(g.holds);
    return held.length > 0 ? [`${roleEmoji(g.icon)}**${g.label}** ${held.map(g.entry).join(" ")}`] : [];
  }).join("\n");
}

export function buildDashboard(view: FamilyDashboardView, opts: { art: boolean }): CfPayload {
  const member = view.viewer.role !== null;
  const owner = view.viewer.userId;
  const xp = view.nextLevelXp === null ? `XP ${fmtFortunes(view.xp)} (max level)` : `XP ${fmtFortunes(view.xp)} / ${fmtFortunes(view.nextLevelXp)}`;
  const container = new ContainerBuilder();
  const file = addThumbSection(container,
    `## ${cfLabel(view.crestKey, `[${view.tag}] ${view.name}`)}\nLevel ${view.level} · ${xp} · Members ${view.memberCount}/${view.memberCap}`,
    view.crestKey);

  const status: string[] = [];
  if (member) status.push(view.duesArrears > 0 ? `Dues in arrears: ${view.duesArrears} days` : "Dues paid");
  if (view.racketsHeld !== null) status.push(`Rackets ${view.racketsHeld}`);
  status.push(`Next crew heist ${rel(view.nextCaperAt)}`);
  if (view.underInvestigation) status.push("Under investigation");

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(groupedRoster(view.roster)))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(status.join(" · ")),
      text(member
        ? "-# `!crew deposit <amount>` funds the vault. Payday splits the earnings every week."
        : "-# `!crew top` lists every family."),
    );

  if (member) {
    const buttons = [
      cfButton(CREW_IDS.view("vault", owner), "Vault", ButtonStyle.Secondary, { emojiKey: "vault" }),
      cfButton(CPR_IDS.viewPlan(owner), "Crew Heist", ButtonStyle.Secondary, { emojiKey: "caper" }),
      ...(view.showTurf ? [cfButton(TURF_IDS.viewMap(owner), "Turf", ButtonStyle.Secondary, { emojiKey: "war" })] : []),
      cfButton(CREW_IDS.view("manage", owner), "Manage", ButtonStyle.Secondary, { disabled: !view.viewer.canManage }),
      cfButton(CREW_IDS.view("log", owner), "Log"),
    ];
    container.addActionRowComponents(buttonRow(...buttons));
    const second = [
      ...(view.viewer.canClaim ? [cfButton(CREW_IDS.claim(view.familyId), "Claim the chair", ButtonStyle.Danger)] : []),
    ];
    if (second.length > 0) container.addActionRowComponents(buttonRow(...second));
  }
  return cfPayload(container, { files: files(opts.art, file), freshAttachments: opts.art });
}

// ── S3 ───────────────────────────────────────────────────────────────────────

export function buildCreateConfirm(ownerId: string, v: { name: string; tag: string; fee: number }): CfPayload {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`## Found [${v.tag}] ${v.name}?`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(
      `**Cost:** ${fmtFortunes(v.fee)} from your wallet, burned. It is not refunded.\n` +
      "**Gates:** all met.\n" +
      `**Name:** ${v.name}\n**Tag:** ${v.tag}\n` +
      "-# You become the Boss. Confirm checks everything again.",
    ))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.createOk(v.tag, v.name, ownerId), "Confirm", ButtonStyle.Success),
      cfButton(CREW_IDS.createNo(ownerId), "Cancel"),
    ));
  return cfPayload(container);
}

// ── S4 ───────────────────────────────────────────────────────────────────────

const inviteHeaderText = (v: InviteView) =>
  `## ${cfLabel(v.crestKey, `Invite to ${v.familyLabel}`)}\n<@${v.inviteeId}>, <@${v.inviterId}> invited you to the family.`;

export function buildInviteCard(v: InviteView): CfPayload {
  const container = new ContainerBuilder();
  const file = addThumbSection(container, inviteHeaderText(v), v.crestKey);
  const hop = days(CRIME_FAMILY_CONFIG.hopCooldownSeconds.LEFT);
  container
    .addTextDisplayComponents(text(
      `Members ${v.memberCount}/${v.memberCap} · expires ${rel(v.expiresAt)}\n` +
      `-# Joining needs the family join gates. Leaving later means ${hop} days before you can join another family.`,
    ))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.invite("accept", v.inviteId), "Accept", ButtonStyle.Success),
      cfButton(CREW_IDS.invite("decline", v.inviteId), "Decline"),
    ));
  return cfPayload(container, { files: file ? [file] : undefined, mentionUsers: [v.inviteeId] });
}

/**
 * The S4 card after an answer or expiry: no buttons, no ping. A plain header
 * that drops the posted crest file, so the edit never names an attachment the
 * message lacks (the family may have moved to another crest tier since).
 */
export function buildInviteResolved(v: InviteView, status: string): CfPayload {
  const container = new ContainerBuilder().addTextDisplayComponents(text(inviteHeaderText(v)), text(`**${status}**`));
  return cfPayload(container, { freshAttachments: true });
}

// ── S5 ───────────────────────────────────────────────────────────────────────

const MANAGE_LEGEND =
  "-# Boss: everything. Underboss: promote, demote, payday and level up. Capo: invite and kick Soldiers. " +
  "Associates (first 72 h) can't take crew heist seats or war actions.";

/** S5, `managePageSize` members a page; `page` is clamped and a selection off the page counts as none. */
export function buildManagePanel(ownerId: string, view: FamilyDashboardView, selected: string | null, page: number): CfPayload {
  const size = CRIME_FAMILY_CONFIG.managePageSize;
  const pages = Math.max(1, Math.ceil(view.roster.length / size));
  const at = Math.min(Math.max(0, page), pages - 1);
  const start = at * size;
  const roster = view.roster.slice(start, start + size);
  const target = selected && roster.some((m) => m.userId === selected) && selected !== ownerId ? selected : null;
  const select = new StringSelectMenuBuilder()
    .setCustomId(CREW_IDS.manageSelect(at, ownerId))
    .setPlaceholder("Pick a member")
    .addOptions(roster.map((m, i) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`#${start + i + 1} · ${FAMILY_ROLES[m.role].name}`)
        .setDescription(m.userId)
        .setValue(m.userId)
        .setDefault(m.userId === target);
      const emoji = cfEmoji(FAMILY_ROLES[m.role].emojiKey);
      if (emoji) option.setEmoji(emoji);
      return option;
    }));
  const t = target ?? "0";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`## Manage [${view.tag}]\n${roster.map((m, i) => `\`#${start + i + 1}\` ${rosterLine(m)}`).join("\n")}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(MANAGE_LEGEND))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.manage("promote", t, ownerId), "Promote", ButtonStyle.Secondary, { disabled: !target }),
      cfButton(CREW_IDS.manage("demote", t, ownerId), "Demote", ButtonStyle.Secondary, { disabled: !target }),
      cfButton(CREW_IDS.manage("kick", t, ownerId), "Kick", ButtonStyle.Danger, { disabled: !target }),
      cfButton(CREW_IDS.manage("chair", t, ownerId), "Hand over", ButtonStyle.Danger, { disabled: !target || view.viewer.role !== "BOSS" }),
      cfButton(CREW_IDS.view("home", ownerId), "Back"),
    ))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.managePage(at - 1, ownerId), "Prev", ButtonStyle.Secondary, { disabled: at === 0 }),
      cfButton(CREW_IDS.managePage(at, ownerId), `Page ${at + 1}/${pages}`, ButtonStyle.Secondary, { disabled: true }),
      cfButton(CREW_IDS.managePage(at + 1, ownerId), "Next", ButtonStyle.Secondary, { disabled: at === pages - 1 }),
    ));
  return cfPayload(container);
}

// ── S6, S9: ledger lines ─────────────────────────────────────────────────────

const LEDGER_LABELS: Readonly<Record<LedgerType, string>> = {
  create_fee: "Founded", deposit: "Deposit", deposit_tax: "Deposit tax", payday: "Payday", payday_tax: "Payday tax",
  caper_cut: "Crew heist cut", racket_income: "Racket income", racket_neglect: "Racket neglect", dues: "Dues", dues_missed: "Dues missed",
  level_fee: "Level up", rename_fee: "Rename", bid_escrow: "Bid escrow", bid_refund: "Bid refund", war_bid_burn: "War bid burned",
  disband_burn: "Disband burn", xp: "XP",
};

function ledgerAmount(l: LedgerLine): string {
  const meta = l.meta ?? {};
  if (l.type === "xp") return `+${fmtFortunes(Number(meta.xp ?? 0))} XP`;
  if (typeof meta.burned === "number") return `${fmtFortunes(meta.burned)} burned`;
  if (typeof meta.paid === "number") return `${fmtFortunes(meta.paid)} paid`;
  if (l.amount === 0) return "";
  return `${l.amount > 0 ? "+" : "-"}${fmtFortunes(Math.abs(l.amount))}`;
}

export function ledgerLine(l: LedgerLine): string {
  const who = l.actorId === "system" ? "system" : `<@${l.actorId}>`;
  return [rel(l.at), LEDGER_LABELS[l.type], ledgerAmount(l), who].filter(Boolean).join(" · ");
}

// ── S6 ───────────────────────────────────────────────────────────────────────

export function buildVaultPanel(ownerId: string, v: VaultView, note?: string): CfPayload {
  const arrears = v.duesArrears > 0 ? ` · in arrears ${v.duesArrears} days (${fmtFortunes(v.arrearsOwed)} owed)` : "";
  const rules = v.payday.lockedReason
    ? [`-# ${v.payday.lockedReason}`, ...v.payday.ineligible.slice(0, 12).map((m) => `-# <@${m.userId}>: ${m.reason}`)].join("\n")
    : `-# Payday splits the earnings equally, up to ${fmtFortunes(CRIME_FAMILY_CONFIG.paydayGrossCap)} each, ` +
      `taxed ${Math.round(CRIME_FAMILY_CONFIG.vaultTaxRate * 100)}%. Deposits go to the treasury.`;
  const canLevel = v.canOfficer && v.levelUp.next !== null && v.levelUp.blockers.length === 0;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(withNote(`## ${cfLabel("vault", "Vault")} · [${v.tag}]`, note)))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(
        `**Treasury:** ${fmtFortunes(v.treasury)}\n**Earnings:** ${fmtFortunes(v.earnings)}\n` +
        `**Dues:** ${fmtFortunes(v.duesPerDay)} a day${arrears}\n` +
        `**Last payday:** ${rel(v.lastPaydayAt)} · **Next payday:** ${rel(v.nextPaydayAt)}`,
      ),
      text(v.ledger.length ? `**Recent**\n${v.ledger.map(ledgerLine).join("\n")}` : "**Recent**\nNo vault activity yet."),
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(rules))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.vault("deposit", ownerId), "Deposit", ButtonStyle.Primary),
      cfButton(CREW_IDS.vault("payday", ownerId), v.payday.lockedReason ? "Payday locked" : "Payday", ButtonStyle.Secondary,
        { disabled: !v.canOfficer || v.payday.lockedReason !== null }),
      cfButton(CREW_IDS.vault("level", ownerId), "Level up", ButtonStyle.Secondary, { disabled: !canLevel }),
      cfButton(CREW_IDS.view("home", ownerId), "Back"),
    ));
  return cfPayload(container);
}

// ── S7 ───────────────────────────────────────────────────────────────────────

export function buildPaydayPreview(ownerId: string, p: PaydayPreview, note?: string): CfPayload {
  const paid = p.eligible.slice(0, 12).map((id) => `<@${id}> · ${fmtFortunes(p.split.net)}`);
  const unpaid = p.ineligible.slice(0, 12).map((m) => `<@${m.userId}>: ${m.reason}`);
  const lines = [
    paid.length ? `**Paid**\n${paid.join("\n")}` : "**Paid**\nNobody qualifies yet.",
    ...(unpaid.length ? [`**Not paid**\n${unpaid.join("\n")}`] : []),
  ];
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(withNote(
        `## Payday preview\nEarnings **${fmtFortunes(p.earnings)}** split between **${p.count}** members: ` +
        `each gets ${fmtFortunes(p.split.gross)}, tax ${fmtFortunes(p.split.tax)}, receives **${fmtFortunes(p.split.net)}**.`,
        note ?? p.lockedReason ?? undefined,
      )),
      text(lines.join("\n")),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.paydayOk(p.earnings, p.count, ownerId), "Confirm", ButtonStyle.Success, { disabled: p.lockedReason !== null }),
      cfButton(CREW_IDS.view("vault", ownerId), "Cancel"),
    ));
  return cfPayload(container);
}

// ── S8 ───────────────────────────────────────────────────────────────────────

export function buildLevelUpConfirm(ownerId: string, v: VaultView): CfPayload {
  const next = v.levelUp.next;
  const fromEarnings = next ? Math.min(v.earnings, next.fee) : 0;
  const body = next
    ? `**Fee:** ${fmtFortunes(next.fee)}, burned: ${fmtFortunes(fromEarnings)} from earnings, ${fmtFortunes(next.fee - fromEarnings)} from the treasury.\n` +
      `**Level ${next.level}:** up to ${next.memberCap} members${next.tierUnlocked ? `, tier ${next.tierUnlocked} crew heists` : ""}.` +
      (v.levelUp.blockers.length ? `\n${v.levelUp.blockers.join("\n")}` : "")
    : "Your family is at the max level.";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`## ${next ? `Level up to ${next.level}?` : "Max level"}`),
      text(body),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.levelOk(v.level, ownerId), "Confirm", ButtonStyle.Success,
        { disabled: !next || v.levelUp.blockers.length > 0 || !v.canOfficer }),
      cfButton(CREW_IDS.view("vault", ownerId), "Cancel"),
    ));
  return cfPayload(container);
}

// ── S9 ───────────────────────────────────────────────────────────────────────

export function buildLedgerPage(ownerId: string, page: { rows: LedgerLine[]; page: number; pages: number }): CfPayload {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("## Family log"),
      text(page.rows.length ? page.rows.map(ledgerLine).join("\n") : "Nothing logged yet."),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.log(page.page - 1, ownerId), "Prev", ButtonStyle.Secondary, { disabled: page.page <= 0 }),
      cfButton(CREW_IDS.log(page.page, ownerId), `${page.page + 1}/${page.pages}`, ButtonStyle.Secondary, { disabled: true }),
      cfButton(CREW_IDS.log(page.page + 1, ownerId), "Next", ButtonStyle.Secondary, { disabled: page.page >= page.pages - 1 }),
    ));
  return cfPayload(container);
}

// ── S10 ──────────────────────────────────────────────────────────────────────

const MEDALS = [Mascot.Emotes.MedalGold, Mascot.Emotes.MedalSilver, Mascot.Emotes.MedalBronze];

function leaderboardLine(row: LeaderboardView["rows"][number], sortLabel: string): string {
  const place = MEDALS[row.rank - 1] ?? `**#${row.rank}**`;
  const crest = cfEmoji(row.crestKey);
  const parts = [`${place} ${crest ? `${crest} ` : ""}**[${row.tag}]** ${row.name}`, `L${row.level}`, `${row.members} members`];
  if (row.rackets !== null) parts.push(`${row.rackets} rackets`);
  parts.push(`${fmtFortunes(row.value)} ${sortLabel}`);
  if (row.level === CRIME_FAMILY_CONFIG.maxLevel) parts.push(`${Mascot.Emotes.MedalGold} Made Family`);
  return parts.join(" · ");
}

export function buildLeaderboard(ownerId: string, v: LeaderboardView, opts: { art: boolean }): CfPayload {
  const sortLabel = v.sorts.find((s) => s.key === v.sort)?.label ?? v.sort;
  const container = new ContainerBuilder();
  const file = addThumbSection(container, `## ${cfLabel("crest_4", "Top families")}\n-# Sorted by ${sortLabel}`, "crest_4");
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(v.rows.length ? v.rows.map((r) => leaderboardLine(r, sortLabel)).join("\n") : "No families yet."))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(v.viewer
      ? `**Your family:** #${v.viewer.rank} · ${fmtFortunes(v.viewer.value)} ${sortLabel}`
      : "-# Join or found a family to see its rank."))
    .addActionRowComponents(buttonRow(...v.sorts.map((s) =>
      cfButton(CREW_IDS.top(s.key, ownerId), s.label, s.key === v.sort ? ButtonStyle.Primary : ButtonStyle.Secondary))));
  return cfPayload(container, { files: files(opts.art, file), freshAttachments: opts.art });
}

// ── S22 ──────────────────────────────────────────────────────────────────────

export function buildDisbandConfirm(
  ownerId: string, tag: string, p: { finalPayday: PaydayPreview | null; burnTreasury: number; burnEarnings: number },
): CfPayload {
  const payday = p.finalPayday
    ? `**Final payday:** ${p.finalPayday.count} members get ${fmtFortunes(p.finalPayday.split.net)} each ` +
      `(${fmtFortunes(p.finalPayday.split.gross)} before ${fmtFortunes(p.finalPayday.split.tax)} tax).`
    : "**Final payday:** none due.";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`## Disband [${tag}]?\nThis cannot be undone. Every member leaves and the name and tag are freed.`),
      text(
        `${payday}\n**Burned:** ${fmtFortunes(p.burnTreasury)} treasury + ${fmtFortunes(p.burnEarnings)} earnings = ` +
        `**${fmtFortunes(p.burnTreasury + p.burnEarnings)}**\n-# Disband… asks you to type the tag.`,
      ),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.disband("open", ownerId), "Disband…", ButtonStyle.Danger),
      cfButton(CREW_IDS.disband("no", ownerId), "Cancel"),
    ));
  return cfPayload(container);
}

// ── S23 ──────────────────────────────────────────────────────────────────────

export function buildClaimNotice(familyId: string, underbossId: string, bossId: string): CfPayload {
  const away = days(CRIME_FAMILY_CONFIG.claimChairAfterSeconds);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(
      `<@${underbossId}>, the Boss <@${bossId}> has been inactive for ${away} days. As Underboss you can claim the chair.`,
    ))
    .addActionRowComponents(buttonRow(cfButton(CREW_IDS.claim(familyId), "Claim the chair", ButtonStyle.Danger)));
  return cfPayload(container, { mentionUsers: [underbossId] });
}

export function buildClaimResolved(status: string): CfPayload {
  return cfPayload(new ContainerBuilder().addTextDisplayComponents(text(status)));
}

// ── S24 ──────────────────────────────────────────────────────────────────────

export function buildMyInvites(ownerId: string, invites: InviteView[]): CfPayload {
  const shown = invites.slice(0, 5);
  const container = new ContainerBuilder().addTextDisplayComponents(
    text("## Your invites"),
    text(shown.length
      ? shown.map((v) => `**${v.familyLabel}** · from <@${v.inviterId}> · expires ${rel(v.expiresAt)}`).join("\n")
      : "No pending invites. Ask a family's Capo to invite you."),
  );
  if (shown.length) {
    container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(CREW_IDS.inviteSelect(ownerId))
        .setPlaceholder("Accept an invite")
        .addOptions(shown.map((v) => new StringSelectMenuOptionBuilder().setLabel(`Accept ${v.familyLabel}`).setValue(v.inviteId))),
    ));
  }
  container.addActionRowComponents(buttonRow(cfButton(CREW_IDS.view("home", ownerId), "Back")));
  return cfPayload(container);
}

// ── S26 ──────────────────────────────────────────────────────────────────────

const CONFIRM_TITLES: Readonly<Record<CrewConfirmKind, (target: string) => string>> = {
  leave: () => "Leave the family?",
  kick: (t) => `Kick <@${t}>?`,
  chair: (t) => `Hand the chair to <@${t}>?`,
};

export function buildConfirm(ownerId: string, kind: CrewConfirmKind, targetId: string | null, consequences: string): CfPayload {
  const target = targetId ?? "0";
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`## ${CONFIRM_TITLES[kind](target)}`), text(consequences))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.confirm(kind, "ok", target, ownerId), "Confirm", ButtonStyle.Danger),
      cfButton(CREW_IDS.confirm(kind, "no", target, ownerId), "Cancel"),
    ));
  return cfPayload(container);
}
