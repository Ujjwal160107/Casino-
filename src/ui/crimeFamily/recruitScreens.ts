// The recruitment screens (amendment 8.9): S29 board, S30 family card, S31
// recruitment panel, S32 inbox, S33 my applications, and the M1 apply and M2
// listing modals. Pure builders from plain views; no I/O. Player free text
// (pitch, application message) is always rendered literally, with no pings.
import {
  ActionRowBuilder,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { leagueOf } from "../../data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import { REQUIREMENTS, type BoardSort, type Requirements } from "../../services/crimeFamily/recruitService";
import type { BoardView, FamilyCardView, InboxView, MyApplicationsView, RecruitPanelView, ReqCheck } from "../../services/crimeFamily/views";
import { CREW_IDS } from "./ids";
import { addThumbSection, buttonRow, cfButton, cfLabel, cfPayload, text, type CfPayload } from "./kit";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const sep = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
const withNote = (body: string, note?: string) => (note ? `${body}\n**${note}**` : body);
const selectRow = (select: StringSelectMenuBuilder) => new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

/**
 * Pitch and message text rendered literally (Review Focus 3): markdown, lists
 * and masked links through escapeMarkdown, plus every `#` (a heading or `-#`
 * anywhere), `<` (timestamps, mentions) and a line-leading `>` (blockquotes),
 * which escapeMarkdown leaves alone.
 */
export const literal = (s: string) =>
  escapeMarkdown(s, { bulletedList: true, numberedList: true, maskedLink: true })
    .replace(/[#<]/g, "\\$&")
    .replace(/^(\s*)>/gm, "$1\\>");

const SORT_LABELS: Readonly<Record<BoardSort, string>> = { lvl: "Level", mem: "Members", act: "Activity" };

/** The board line's short unit per requirement, in REQUIREMENTS order. */
const SHORT_UNITS: Readonly<Record<keyof Requirements, string>> = {
  netWorth: "net worth", shifts: "shifts", ageDays: "days", heists: "crew heists",
};

/** The non-zero requirements: "10,000,000 net worth · 300 shifts · 45 days · 5 crew heists", or "No requirements". */
export function reqLine(req: Requirements): string {
  const parts = REQUIREMENTS.filter((r) => req[r.key] > 0).map((r) => `${fmtFortunes(req[r.key])} ${SHORT_UNITS[r.key]}`);
  return parts.length > 0 ? parts.join(" · ") : "No requirements";
}

const checkMark = (c: { ok: boolean }) => (c.ok ? "✓" : "✗");

// ── S29 ──────────────────────────────────────────────────────────────────────

/**
 * The disabled page label's id. Every customId on a message must be unique;
 * the current sort button re-renders the current page and Prev/Next are the
 * neighbours, so the label takes a page none of them can be (the route clamps it).
 */
const PAGE_LABEL = -2;

export function buildBoard(v: BoardView): CfPayload {
  const { ownerId: owner, sort, qualifyOnly: q } = v;
  const header = `## Families recruiting\nSort: ${SORT_LABELS[sort]} · I qualify: ${q ? "on" : "off"} · page ${v.page + 1}/${v.pages}`;
  const lines = v.rows.map((r) =>
    `${cfLabel(r.crestKey, `**[${r.tag}] ${r.name}**`)} · L${r.level} · ${leagueOf(r.level).name} · ${r.members}/${r.cap} members · ${r.active} active${r.qualifies ? " ✓" : ""}\n` +
    `-# ${reqLine(r.req)}`);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(header))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(lines.length > 0 ? lines.join("\n") : (v.emptyReason ?? "No family is recruiting right now.")));
  if (v.rows.length > 0) {
    container.addActionRowComponents(selectRow(new StringSelectMenuBuilder()
      .setCustomId(CREW_IDS.boardSelect(owner))
      .setPlaceholder("Open a family")
      .addOptions(v.rows.map((r) => new StringSelectMenuOptionBuilder()
        .setLabel(`[${r.tag}] ${r.name}`)
        .setDescription(`L${r.level} · ${r.members}/${r.cap} members`)
        .setValue(r.familyId)))));
  }
  const sortButton = (s: BoardSort) => s === sort
    ? cfButton(CREW_IDS.board(s, q, v.page, owner), SORT_LABELS[s], ButtonStyle.Primary)
    : cfButton(CREW_IDS.board(s, q, 0, owner), SORT_LABELS[s]);
  container
    .addActionRowComponents(buttonRow(
      ...(Object.keys(SORT_LABELS) as BoardSort[]).map(sortButton),
      cfButton(CREW_IDS.board(sort, !q, 0, owner), "I qualify", q ? ButtonStyle.Success : ButtonStyle.Secondary),
    ))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.board(sort, q, v.page - 1, owner), "Prev", ButtonStyle.Secondary, { disabled: v.page <= 0 }),
      cfButton(CREW_IDS.board(sort, q, PAGE_LABEL, owner), `${v.page + 1}/${v.pages}`, ButtonStyle.Secondary, { disabled: true }),
      cfButton(CREW_IDS.board(sort, q, v.page + 1, owner), "Next", ButtonStyle.Secondary, { disabled: v.page >= v.pages - 1 }),
      cfButton(CREW_IDS.myApps(owner), "My applications"),
      cfButton(CREW_IDS.view("home", owner), "Back"),
    ));
  return cfPayload(container);
}

// ── S30 ──────────────────────────────────────────────────────────────────────

function cardStatus(v: FamilyCardView): string {
  const max = CRIME_FAMILY_CONFIG.maxPendingApplicationsPerApplicant;
  const pending = `Pending applications ${v.pending}/${max}`;
  if (v.appliedAt) return `${pending} · applied ${rel(v.appliedAt)}`;
  if (v.reapplyAt) return `${pending} · apply again ${rel(v.reapplyAt)}`;
  return v.applyBlock ? `${pending}\n-# ${v.applyBlock}` : pending;
}

export function buildFamilyCard(v: FamilyCardView, note?: string): CfPayload {
  const container = new ContainerBuilder();
  const file = addThumbSection(container,
    withNote(`## ${v.label}\nL${v.level} · ${leagueOf(v.level).name} · ${v.members}/${v.cap} members · ${v.active} active`, note),
    v.crestKey);
  const checks = [
    ...v.checks.map((c) => `${checkMark(c)} ${c.label}: ${fmtFortunes(c.need)} (you ${fmtFortunes(c.have)})`),
    v.joinGate ? `✗ ${v.joinGate}` : "✓ Join gates",
  ];
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(v.pitch ? literal(v.pitch) : "No pitch yet."),
      text(checks.join("\n")),
      text(cardStatus(v)),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.applyOpen(v.familyId, v.ownerId), "Apply…", ButtonStyle.Primary, { disabled: v.applyBlock !== null }),
      cfButton(CREW_IDS.myApps(v.ownerId), "My applications"),
    ));
  return cfPayload(container, { files: file ? [file] : undefined, freshAttachments: true });
}

// ── S31 ──────────────────────────────────────────────────────────────────────

export function buildRecruitPanel(v: RecruitPanelView, note?: string): CfPayload {
  const owner = v.ownerId;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(withNote(`## Recruitment · [${v.tag}]\n${v.recruiting ? "Recruiting" : "Not recruiting"}`, note)))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`${v.pitch ? literal(v.pitch) : "No pitch yet."}\n-# ${reqLine(v.req)}`),
      text(`Applications: ${v.pending}/${CRIME_FAMILY_CONFIG.maxPendingApplicationsPerFamily} pending`),
    )
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.recruit(v.recruiting ? "off" : "on", owner), v.recruiting ? "Recruiting on" : "Recruiting off",
        v.recruiting ? ButtonStyle.Success : ButtonStyle.Secondary, { disabled: !v.canEdit }),
      cfButton(CREW_IDS.recruitEdit(v.req, owner), "Edit listing…", ButtonStyle.Secondary, { disabled: !v.canEdit }),
      cfButton(CREW_IDS.recruit("inbox", owner), `Applications (${v.pending})`, ButtonStyle.Primary),
      cfButton(CREW_IDS.view("home", owner), "Back"),
    ));
  return cfPayload(container);
}

// ── S32 ──────────────────────────────────────────────────────────────────────

const checkSummary = (checks: ReqCheck[]) => checks.map((c) => `${checkMark(c)} ${c.label}`).join(" · ");

export function buildInbox(v: InboxView, note?: string): CfPayload {
  const owner = v.ownerId;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(withNote(`## Applications · [${v.tag}]\n${v.total} pending · page ${v.page + 1}/${v.pages}`, note)))
    .addSeparatorComponents(sep());
  if (v.rows.length === 0) container.addTextDisplayComponents(text("No pending applications."));
  for (const r of v.rows) {
    container
      .addTextDisplayComponents(text(
        `<@${r.applicantId}> · applied ${rel(r.createdAt)} · expires ${rel(r.expiresAt)}\n> ${literal(r.message)}\n${checkSummary(r.checks)}`,
      ))
      .addActionRowComponents(buttonRow(
        cfButton(CREW_IDS.appAnswer("accept", r.appId, owner), "Accept", ButtonStyle.Success),
        cfButton(CREW_IDS.appAnswer("decline", r.appId, owner), "Decline", ButtonStyle.Danger),
      ));
  }
  container.addActionRowComponents(buttonRow(
    cfButton(CREW_IDS.inboxPage(v.page - 1, owner), "Prev", ButtonStyle.Secondary, { disabled: v.page <= 0 }),
    cfButton(CREW_IDS.inboxPage(v.page, owner), `${v.page + 1}/${v.pages}`, ButtonStyle.Secondary, { disabled: true }),
    cfButton(CREW_IDS.inboxPage(v.page + 1, owner), "Next", ButtonStyle.Secondary, { disabled: v.page >= v.pages - 1 }),
    cfButton(CREW_IDS.recruit("home", owner), "Back"),
  ));
  return cfPayload(container);
}

// ── S33 ──────────────────────────────────────────────────────────────────────

export function buildMyApplications(v: MyApplicationsView, note?: string): CfPayload {
  const owner = v.ownerId;
  const container = new ContainerBuilder().addTextDisplayComponents(
    text(withNote("## Your applications", note)),
    text(v.rows.length > 0
      ? v.rows.map((r) => `${r.familyLabel} · applied ${rel(r.createdAt)} · expires ${rel(r.expiresAt)}`).join("\n")
      : "No pending applications."),
  );
  if (v.rows.length > 0) {
    container.addActionRowComponents(selectRow(new StringSelectMenuBuilder()
      .setCustomId(CREW_IDS.withdraw(owner))
      .setPlaceholder("Withdraw an application")
      .addOptions(v.rows.map((r) => new StringSelectMenuOptionBuilder().setLabel(`Withdraw ${r.familyLabel}`).setValue(r.appId)))));
  }
  container.addActionRowComponents(buttonRow(
    cfButton(CREW_IDS.board("lvl", false, 0, owner), "Board"),
    cfButton(CREW_IDS.view("home", owner), "Back"),
  ));
  return cfPayload(container);
}

// ── M1, M2 ───────────────────────────────────────────────────────────────────

const textInput = (id: string, label: string, style: TextInputStyle) =>
  new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style);
const inputRow = (input: TextInputBuilder) => new ActionRowBuilder<TextInputBuilder>().addComponents(input);

export function buildApplyModal(familyId: string, owner: string): ModalBuilder {
  const { min, max } = CRIME_FAMILY_CONFIG.applicationChars;
  return new ModalBuilder()
    .setCustomId(CREW_IDS.applyModal(familyId, owner))
    .setTitle("Apply to the family")
    .addComponents(inputRow(textInput("message", `Why should they take you? (${min}–${max} characters)`, TextInputStyle.Paragraph)
      .setMinLength(min).setMaxLength(max).setRequired(true)));
}

/** M2 (F10): the requirements are pre-filled from the opener's customId; a blank pitch keeps the stored one. */
export function buildListingModal(r: Requirements, owner: string): ModalBuilder {
  const requirement = (id: string, label: string, value: number) =>
    inputRow(textInput(id, label, TextInputStyle.Short).setRequired(false).setMaxLength(20).setValue(String(value)));
  return new ModalBuilder()
    .setCustomId(CREW_IDS.recruitModal(r, owner))
    .setTitle("Recruitment listing")
    .addComponents(
      inputRow(textInput("pitch", "Pitch", TextInputStyle.Paragraph).setRequired(false)
        .setMaxLength(CRIME_FAMILY_CONFIG.pitchChars.max).setPlaceholder("Leave blank to keep your current pitch")),
      requirement("nw", "Min net worth (like 10m)", r.netWorth),
      requirement("shifts", "Min lifetime shifts", r.shifts),
      requirement("age", "Min days on Fortuna", r.ageDays),
      requirement("heists", "Min lifetime crew heists", r.heists),
    );
}
