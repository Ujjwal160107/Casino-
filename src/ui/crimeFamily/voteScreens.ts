// The no-confidence vote screens (amendment 4.6): S34 (the public vote card
// and its result), S35 (the start confirm) and the S25 vote card. Pure
// builders; no screen ever reads a ballot, so none can say how anyone voted
// (A16, F21). No pings: every mention renders without notifying.
import { ButtonStyle, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { VoidReason } from "../../services/crimeFamily/voteRules";
import type { VoteStartView, VoteView } from "../../services/crimeFamily/views";
import { CREW_IDS } from "./ids";
import { buttonRow, cfButton, cfPayload, text, type CfPayload } from "./kit";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const sep = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
const hours = (seconds: number) => Math.round(seconds / 3_600);
const days = (seconds: number) => Math.round(seconds / 86_400);

const VOID_LINES: Readonly<Record<VoidReason, string>> = {
  chair_moved: "Void: the chair changed hands.",
  too_few: `Void: fewer than ${CRIME_FAMILY_CONFIG.voteMinEligible} eligible voters remained.`,
  no_heir: "Void: nobody could take the chair.",
};

/** Vote YES / Vote NO for one vote: S34, the S25 vote card and the opened-vote DM. */
export function ballotRow(voteId: string) {
  return buttonRow(
    cfButton(CREW_IDS.ballot("yes", voteId), "Vote YES", ButtonStyle.Success),
    cfButton(CREW_IDS.ballot("no", voteId), "Vote NO", ButtonStyle.Danger),
  );
}

/** The closed vote's one result line (S34 and the result DM): totals only. */
export function voteResultLine(v: VoteView): string {
  const r = v.result;
  if (!r) return "";
  if (v.status === "PASSED") return `Passed: <@${r.newBossId}> is Boss (YES ${r.yes}, NO ${r.no}, eligible ${v.eligible})`;
  if (v.status === "FAILED") return `Failed (YES ${r.yes}, NO ${r.no}, eligible ${v.eligible}, needed ${v.need})`;
  return VOID_LINES[r.voidReason ?? "no_heir"];
}

/** S34: open (7 components) or closed (3); a closed view's closesAt is when it actually closed. */
export function buildVoteCard(v: VoteView): CfPayload {
  const when = v.status === "OPEN" ? "closes" : "closed";
  const container = new ContainerBuilder().addTextDisplayComponents(text(
    `## No-confidence vote · [${v.tag}]\n<@${v.bossId}> · started by <@${v.starterId}> · ${when} ${rel(v.closesAt)}`,
  ));
  if (v.status !== "OPEN") return cfPayload(container.addTextDisplayComponents(text(voteResultLine(v))));
  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(
      `Eligible voters: ${v.eligible} · a pass needs **${v.need}** YES\n` +
      `**${v.voted} of ${v.eligible} have voted.** Ballots are secret and can change until the close.\n` +
      (v.heirId ? `On a pass <@${v.heirId}> takes the chair.` : "On a pass the heir order picks the next Boss."),
    ))
    .addActionRowComponents(ballotRow(v.voteId));
  return cfPayload(container);
}

/** S35: the start confirm (6); a refusal is shown in bold with Start disabled. */
export function buildVoteStartConfirm(v: VoteStartView): CfPayload {
  const body =
    `Eligible voters: ${v.eligible} · a pass needs ${v.need} YES · ${hours(CRIME_FAMILY_CONFIG.voteSeconds)} hours.\n` +
    `You are named as the starter and vote YES. A failed vote, or one voided for too few eligible voters, blocks another for ${days(CRIME_FAMILY_CONFIG.voteCooldownSeconds)} days. ` +
    "Ranks, kicks, disband and handover freeze while it is open." +
    (v.block ? `\n**${v.block}**` : "");
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`Start a no-confidence vote against <@${v.bossId}>?`), text(body))
    .addActionRowComponents(buttonRow(
      cfButton(CREW_IDS.voteOk(v.ownerId), "Start vote", ButtonStyle.Danger, { disabled: v.block !== null }),
      cfButton(CREW_IDS.voteCancel(v.ownerId), "Cancel"),
    ));
  return cfPayload(container);
}

/** S25 vote card (5): where a member reaches the open vote from `!crew vote` or S2. */
export function buildVoteSeatCard(v: VoteView): CfPayload {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`No-confidence vote on <@${v.bossId}> in [${v.tag}] closes ${rel(v.closesAt)}. Ballots are secret.`))
    .addActionRowComponents(ballotRow(v.voteId));
  return cfPayload(container);
}
