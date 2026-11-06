// Discord side effects of family events, shared by the crew routes, `!crew`
// and the family jobs: the public cards and the `family` DMs (spec 13.4).
// A dead home channel never stops the DMs, and nothing here throws: every
// announcer runs after its service committed, so a failure is only logged.
import type { Family, FamilyInvite } from "@prisma/client";
import type { Client } from "discord.js";
import prisma from "../../utils/prisma";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { familyLabel, getInviteCard, listMembers } from "../../services/crimeFamily/familyQueries";
import type { disbandFamily } from "../../services/crimeFamily/disbandService";
import type { PaidShare, PaydayPaid } from "../../services/crimeFamily/paydayService";
import { arrearsOwed } from "../../services/crimeFamily/vaultService";
import {
  familyArrearsNotice,
  familyDisbandedNotice,
  familyInviteNotice,
  familyMissedPaydayNotice,
  familyPaydayNotice,
  familyRoleNotice,
  notifyMany,
  sendOptOutDm,
} from "../../services/dmNoticeService";
import { fmtFortunes } from "../../utils/format";
import { buildClaimResolved, buildInviteResolved } from "./familyScreens";
import { buildNotice } from "./kit";
import { editChannelMessage, jumpLink, sendToChannel } from "./post";
import { announceExpiredApplications } from "./recruitAnnounce";
import { announcePendingVoteResults } from "./voteAnnounce";

/** Runs one announcer, logging instead of throwing so a committed action never reads as failed. */
async function safely(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(`[crimeFamily] ${name} failed:`, err);
  }
}

/** S28 payday card in the home channel, then a DM to each paid and each ineligible member. */
export async function announcePayday(client: Client, result: PaydayPaid): Promise<{ cardPosted: boolean }> {
  let cardPosted = false;
  await safely("announcePayday", async () => {
    const label = familyLabel(result.family);
    const paidIds = result.paid.map((p) => p.userId);
    const card = buildNotice(
      `## Payday: ${paidIds.length} members paid ${fmtFortunes(result.split.net)} each\n` +
      `**${label}**\n${paidIds.map((id) => `<@${id}>`).join(" ")}`,
    );
    cardPosted = (await sendToChannel(client, result.family.homeChannelId, card)) !== null;
    await notifyMany(client, "family", paidIds, () => familyPaydayNotice({ familyLabel: label, ...result.split }));
    const reasons = new Map(result.ineligible.map((m) => [m.userId, m.reason]));
    await notifyMany(client, "family", [...reasons.keys()], (id) => familyMissedPaydayNotice({ familyLabel: label, reason: reasons.get(id)! }));
  });
  return { cardPosted };
}

/**
 * The minute job's resumed shares (amendment 2.4): a payday DM to each member
 * it paid, naming the family as it is now, or "your former family" once it is
 * gone. The S28 card is not reposted.
 */
export async function announceResumedShares(client: Client, paid: PaidShare[]): Promise<void> {
  if (paid.length === 0) return;
  return safely("announceResumedShares", async () => {
    const families = await prisma.family.findMany({ where: { id: { in: [...new Set(paid.map((p) => p.familyId))] } }, select: { id: true, tag: true, name: true } });
    const labels = new Map(families.map((f) => [f.id, familyLabel(f)]));
    const shares = new Map(paid.map((p) => [p.userId, p]));
    await notifyMany(client, "family", [...shares.keys()], (id) => {
      const p = shares.get(id)!;
      return familyPaydayNotice({ familyLabel: labels.get(p.familyId) ?? "your former family", gross: p.gross, tax: p.tax, net: p.net });
    });
  });
}

/**
 * Edits the S23 claim notice when one was posted, then DMs: a claim tells the
 * old Boss, a hand-over tells every member. Last, the result of any vote the
 * move voided (F4).
 */
export async function announceChairChange(
  client: Client, family: Family, kind: "claimed" | "handed", oldBossId: string, newBossId: string,
): Promise<void> {
  return safely("announceChairChange", async () => {
    if (family.claimChannelId && family.claimMessageId) {
      const status = kind === "claimed" ? `Chair claimed by <@${newBossId}>` : `Chair handed to <@${newBossId}>`;
      await editChannelMessage(client, family.claimChannelId, family.claimMessageId, buildClaimResolved(status));
    }
    const label = familyLabel(family);
    if (kind === "claimed") {
      await sendOptOutDm(client, oldBossId, "family", familyRoleNotice("chair_claimed", { familyLabel: label, newBossId }));
    } else {
      const members = await listMembers(family.id);
      await notifyMany(client, "family", members.map((m) => m.userId), () => familyRoleNotice("chair_handed", { familyLabel: label, newBossId }));
    }
    await announcePendingVoteResults(client, family.id);
  });
}

/** The first missed dues day: a DM to the Boss and the Underboss. */
export async function announceArrears(client: Client, family: Family): Promise<void> {
  return safely("announceArrears", async () => {
    const officers = (await listMembers(family.id)).filter((m) => m.role === "BOSS" || m.role === "UNDERBOSS");
    const notice = { familyLabel: familyLabel(family), days: family.duesArrears, owed: arrearsOwed(family) };
    await notifyMany(client, "family", officers.map((m) => m.userId), () => familyArrearsNotice(notice));
  });
}

/** One DM to the member who was kicked, promoted or demoted. */
export async function announceRoleChange(
  client: Client, family: Family, kind: "kicked" | "promoted" | "demoted", targetId: string, newRole: FamilyRole | null,
): Promise<void> {
  return safely("announceRoleChange", async () => {
    await sendOptOutDm(client, targetId, "family", familyRoleNotice(kind, { familyLabel: familyLabel(family), role: newRole ?? undefined }));
  });
}

/** A DM to every former member, with their final payday net when they were paid; then each applicant's expiry DM. */
export async function announceDisband(client: Client, result: Awaited<ReturnType<typeof disbandFamily>>): Promise<void> {
  return safely("announceDisband", async () => {
    const label = familyLabel(result.family);
    const paid = new Set(result.paid.map((p) => p.userId));
    await notifyMany(client, "family", result.formerMembers, (id) => familyDisbandedNotice({
      familyLabel: label,
      finalNet: paid.has(id) && result.split ? result.split.net : null,
      burned: result.burned,
    }));
    await announceExpiredApplications(client, result.expiredApplications.map((application) => ({ application, familyLabel: label })));
  });
}

/** The invitee's DM for a new invite, linking the S4 card when it was posted. */
export async function announceInvite(client: Client, invite: FamilyInvite & { family: Family }, messageId: string | null): Promise<void> {
  return safely("announceInvite", async () => {
    await sendOptOutDm(client, invite.inviteeId, "family", familyInviteNotice({
      familyLabel: familyLabel(invite.family),
      inviterId: invite.inviterId,
      tag: invite.family.tag,
      expiresAt: invite.expiresAt,
      jumpUrl: messageId ? jumpLink(invite.guildId, invite.channelId, messageId) : null,
    }));
  });
}

/** Edits the S4 invite card to its final status; skipped when it was never stored or the family is gone. */
export async function resolveInviteCard(client: Client, inviteId: string, status: string): Promise<void> {
  return safely("resolveInviteCard", async () => {
    const card = await getInviteCard(inviteId);
    if (card && card.messageId) await editChannelMessage(client, card.channelId, card.messageId, buildInviteResolved(card.view, status));
  });
}
