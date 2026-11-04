// Discord side effects of family events, shared by the crew routes, `!crew`
// and the family jobs: the public cards and the `family` DMs (spec 13.4).
// A dead home channel never stops the DMs, and nothing here throws.
import type { Family } from "@prisma/client";
import type { Client } from "discord.js";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { familyLabel, listMembers } from "../../services/crimeFamily/familyQueries";
import type { disbandFamily } from "../../services/crimeFamily/disbandService";
import type { PaydayPaid } from "../../services/crimeFamily/paydayService";
import {
  familyDisbandedNotice,
  familyMissedPaydayNotice,
  familyPaydayNotice,
  familyRoleNotice,
  notifyMany,
  sendOptOutDm,
} from "../../services/dmNoticeService";
import { fmtFortunes } from "../../utils/format";
import { buildClaimResolved } from "./familyScreens";
import { buildNotice } from "./kit";
import { editChannelMessage, sendToChannel } from "./post";

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
