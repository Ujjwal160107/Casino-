// Discord side effects of family events, shared by the crew routes, `!crew`
// and the family jobs: the public cards and the `family` DMs (spec 13.4).
// A dead home channel never stops the DMs, and nothing here throws.
import type { Family, FamilyInvite } from "@prisma/client";
import type { Client } from "discord.js";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { familyLabel, getInviteCard, listMembers } from "../../services/crimeFamily/familyQueries";
import type { disbandFamily } from "../../services/crimeFamily/disbandService";
import type { PaydayPaid } from "../../services/crimeFamily/paydayService";
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

/** S28 payday card in the home channel, then a DM to each paid and each ineligible member. */
export async function announcePayday(client: Client, result: PaydayPaid): Promise<{ cardPosted: boolean }> {
  const label = familyLabel(result.family);
  const paidIds = result.paid.map((p) => p.userId);
  const card = buildNotice(
    `## Payday: ${paidIds.length} members paid ${fmtFortunes(result.split.net)} each\n` +
    `**${label}**\n${paidIds.map((id) => `<@${id}>`).join(" ")}`,
  );
  const messageId = await sendToChannel(client, result.family.homeChannelId, card);
  await notifyMany(client, "family", paidIds, () => familyPaydayNotice({ familyLabel: label, ...result.split }));
  const reasons = new Map(result.ineligible.map((m) => [m.userId, m.reason]));
  await notifyMany(client, "family", [...reasons.keys()], (id) => familyMissedPaydayNotice({ familyLabel: label, reason: reasons.get(id)! }));
  return { cardPosted: messageId !== null };
}

/** Edits the S23 claim notice when one was posted, then DMs: a claim tells the old Boss, a hand-over tells every member. */
export async function announceChairChange(
  client: Client, family: Family, kind: "claimed" | "handed", oldBossId: string, newBossId: string,
): Promise<void> {
  if (family.claimChannelId && family.claimMessageId) {
    const status = kind === "claimed" ? `Chair claimed by <@${newBossId}>` : `Chair handed to <@${newBossId}>`;
    await editChannelMessage(client, family.claimChannelId, family.claimMessageId, buildClaimResolved(status));
  }
  const label = familyLabel(family);
  if (kind === "claimed") {
    await sendOptOutDm(client, oldBossId, "family", familyRoleNotice("chair_claimed", { familyLabel: label, newBossId }));
    return;
  }
  const members = await listMembers(family.id);
  await notifyMany(client, "family", members.map((m) => m.userId), () => familyRoleNotice("chair_handed", { familyLabel: label, newBossId }));
}

/** The first missed dues day: a DM to the Boss and the Underboss. */
export async function announceArrears(client: Client, family: Family): Promise<void> {
  const officers = (await listMembers(family.id)).filter((m) => m.role === "BOSS" || m.role === "UNDERBOSS");
  const notice = { familyLabel: familyLabel(family), days: family.duesArrears, owed: arrearsOwed(family) };
  await notifyMany(client, "family", officers.map((m) => m.userId), () => familyArrearsNotice(notice));
}

/** One DM to the member who was kicked, promoted or demoted. */
export async function announceRoleChange(
  client: Client, family: Family, kind: "kicked" | "promoted" | "demoted", targetId: string, newRole: FamilyRole | null,
): Promise<void> {
  await sendOptOutDm(client, targetId, "family", familyRoleNotice(kind, { familyLabel: familyLabel(family), role: newRole ?? undefined }));
}

/** A DM to every former member, with their final payday net when they were paid. */
export async function announceDisband(client: Client, result: Awaited<ReturnType<typeof disbandFamily>>): Promise<void> {
  const label = familyLabel(result.family);
  const paid = new Set(result.paid.map((p) => p.userId));
  await notifyMany(client, "family", result.formerMembers, (id) => familyDisbandedNotice({
    familyLabel: label,
    finalNet: paid.has(id) && result.split ? result.split.net : null,
    burned: result.burned,
  }));
}

/** The invitee's DM for a new invite, linking the S4 card when it was posted. */
export async function announceInvite(client: Client, invite: FamilyInvite & { family: Family }, messageId: string | null): Promise<void> {
  await sendOptOutDm(client, invite.inviteeId, "family", familyInviteNotice({
    familyLabel: familyLabel(invite.family),
    inviterId: invite.inviterId,
    tag: invite.family.tag,
    expiresAt: invite.expiresAt,
    jumpUrl: messageId ? jumpLink(invite.guildId, invite.channelId, messageId) : null,
  }));
}

/** Edits the S4 invite card to its final status; skipped when it was never stored or the family is gone. */
export async function resolveInviteCard(client: Client, inviteId: string, status: string): Promise<void> {
  const card = await getInviteCard(inviteId);
  if (card && card.messageId) await editChannelMessage(client, card.channelId, card.messageId, buildInviteResolved(card.view, status));
}
