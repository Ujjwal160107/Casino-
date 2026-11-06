// The Discord side of the no-confidence vote (amendment 4.3, 4.6, 4.7): S34
// in the home channel, its debounced re-render with one repost (F9), and the
// start and result DMs. Each announcement runs only for the winner of its
// CAS, so a crash before it, or a doubled sweep, announces exactly once
// (A42). Nothing here throws: the vote has already committed.
import type { Client } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import {
  familyNewBossNotice, familyVoteAgainstYouNotice, familyVoteOpenedNotice, familyVoteResultNotice, notifyMany, sendOptOutDm,
} from "../../services/dmNoticeService";
import {
  claimVoteAnnouncement, claimVoteRepost, getVoteView, setVoteMessage, unannouncedResultsOf, voteRecipients,
} from "../../services/crimeFamily/voteService";
import { safely } from "./caperFlow";
import { trailingRender } from "./debounce";
import { buildClaimResolved } from "./familyScreens";
import { editChannelMessage, sendToChannel } from "./post";
import { ballotRow, buildVoteCard, voteResultLine } from "./voteScreens";

/** After a start commits (or the sweeper finds it silent): S34 in the home channel and the start DMs, once. */
export async function announceVoteStart(client: Client, voteId: string): Promise<void> {
  return safely("announceVoteStart", async () => {
    if (!(await claimVoteAnnouncement(voteId, "start"))) return;
    const [view, to] = await Promise.all([getVoteView(voteId, null, new Date()), voteRecipients(voteId)]);
    if (!view || !to) return;
    const posted = await sendToChannel(client, view.homeChannelId, buildVoteCard(view));
    await setVoteMessage(voteId, "", view.homeChannelId, posted ?? "");
    const opened = { familyLabel: view.familyLabel, bossId: view.bossId, starterId: view.starterId, closesAt: view.closesAt, need: view.need, eligible: view.eligible };
    await notifyMany(client, "family", to.eligibleIds, () => familyVoteOpenedNotice(opened, ballotRow(voteId)));
    await sendOptOutDm(client, view.bossId, "family", familyVoteAgainstYouNotice({ familyLabel: view.familyLabel, starterId: view.starterId, closesAt: view.closesAt }));
  });
}

/**
 * After a close or a void commits: S34 edited to the result (posted once when
 * dead or never posted), a standing S23 edited on a pass, and the close DMs to
 * every member and the targeted Boss, once.
 */
export async function announceVoteResult(client: Client, voteId: string): Promise<void> {
  return safely("announceVoteResult", async () => {
    if (!(await claimVoteAnnouncement(voteId, "result"))) return;
    const [view, to] = await Promise.all([getVoteView(voteId, null, new Date()), voteRecipients(voteId)]);
    if (!view || !to) return;
    const card = buildVoteCard(view);
    const edit = view.messageId === "" ? "dead" : await editChannelMessage(client, view.channelId, view.messageId, card);
    if (edit === "dead") {
      const posted = await sendToChannel(client, view.homeChannelId, card);
      if (posted) await setVoteMessage(voteId, view.messageId, view.homeChannelId, posted);
    }
    const passed = view.status === "PASSED" && view.result !== null;
    if (passed) {
      const family = await prisma.family.findUnique({ where: { id: view.familyId }, select: { claimChannelId: true, claimMessageId: true } });
      if (family?.claimChannelId && family.claimMessageId) {
        await editChannelMessage(client, family.claimChannelId, family.claimMessageId, buildClaimResolved("Chair taken by vote"));
      }
    }
    const line = voteResultLine(view);
    await notifyMany(client, "family", to.resultIds, () => familyVoteResultNotice({ familyLabel: view.familyLabel, line }));
    if (passed) await sendOptOutDm(client, view.result!.newBossId, "family", familyNewBossNotice({ familyLabel: view.familyLabel }));
  });
}

/** Edits S34 to the live counts; a dead board gets one repost for the life of the vote, then renders stop (F9). */
async function renderVoteCard(client: Client, voteId: string): Promise<void> {
  const view = await getVoteView(voteId, null, new Date());
  if (!view || view.status !== "OPEN" || view.messageId === "") return;
  const card = buildVoteCard(view);
  if ((await editChannelMessage(client, view.channelId, view.messageId, card)) !== "dead") return;
  const posted = (await claimVoteRepost(voteId)) ? await sendToChannel(client, view.homeChannelId, card) : null;
  await setVoteMessage(voteId, view.messageId, view.homeChannelId, posted ?? "");
}

/** The debounced S34 render after a ballot (`cf:render:vote:<voteId>`, fails open). */
export function requestVoteRender(client: Client, voteId: string): Promise<void> {
  return trailingRender("vote", voteId, CRIME_FAMILY_CONFIG.voteRenderDebounceSeconds,
    () => safely("vote render", () => renderVoteCard(client, voteId)));
}

/** After any chair move: the result of each vote it voided (F4). */
export async function announcePendingVoteResults(client: Client, familyId: string): Promise<void> {
  return safely("announcePendingVoteResults", async () => {
    for (const voteId of await unannouncedResultsOf(familyId)) await announceVoteResult(client, voteId);
  });
}
