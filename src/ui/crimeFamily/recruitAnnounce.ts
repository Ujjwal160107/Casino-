// The Discord side of recruitment (amendment 8.10): the applicant's answer and
// expiry DMs and the officers' 6-hourly digest, all under the opt-out `recruit`
// type. Nothing here throws: the service has already committed.
import type { Family, FamilyInvite } from "@prisma/client";
import { ButtonStyle, type Client } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { familyLabel, listMembers } from "../../services/crimeFamily/familyQueries";
import { can } from "../../services/crimeFamily/permissions";
import { claimDigest, familiesDueDigest } from "../../services/crimeFamily/recruitService";
import {
  applicationAcceptedNotice, applicationDeclinedNotice, applicationExpiredNotice, notifyMany, recruitDigestNotice, sendOptOutDm,
} from "../../services/dmNoticeService";
import { safely } from "./caperFlow";
import { CREW_IDS } from "./ids";
import { buttonRow, cfButton } from "./kit";

/** The digest's Open inbox row, owner-scoped to the officer it is sent to. */
export function inboxRow(officerId: string) {
  return buttonRow(cfButton(CREW_IDS.recruit("inbox", officerId), "Open inbox", ButtonStyle.Primary));
}

/** The applicant's DM after an officer accepted or declined. */
export async function announceApplicationAnswer(
  client: Client, application: FamilyInvite, family: Family, answer: "accepted" | "declined",
): Promise<void> {
  return safely("announceApplicationAnswer", async () => {
    const label = familyLabel(family);
    const reapplyAt = new Date(application.resolvedAt.getTime() + CRIME_FAMILY_CONFIG.reapplyAfterDeclineSeconds * 1000);
    await sendOptOutDm(client, application.inviteeId, "recruit", answer === "accepted"
      ? applicationAcceptedNotice({ familyLabel: label })
      : applicationDeclinedNotice({ familyLabel: label, reapplyAt }));
  });
}

/** One expiry DM per application (the sweeper and a disband). */
export async function announceExpiredApplications(client: Client, rows: { application: FamilyInvite; familyLabel: string }[]): Promise<void> {
  return safely("announceExpiredApplications", async () => {
    for (const { application, familyLabel: label } of rows) {
      await sendOptOutDm(client, application.inviteeId, "recruit", applicationExpiredNotice({ familyLabel: label }));
    }
  });
}

/** Hourly: each due family's digest CAS, then one DM to every officer who may review applications. */
export async function sendApplicationDigests(client: Client, now: Date): Promise<void> {
  for (const familyId of await familiesDueDigest(now)) {
    await safely(`sendApplicationDigests(${familyId})`, async () => {
      const count = await claimDigest(familyId, now);
      if (count === 0) return;
      const family = await prisma.family.findUnique({ where: { id: familyId } });
      if (!family) return;
      const officers = (await listMembers(familyId))
        .filter((m) => can({ role: m.role as FamilyRole, joinedAt: m.joinedAt }, "review_apps", now))
        .map((m) => m.userId);
      const label = familyLabel(family);
      await notifyMany(client, "recruit", officers, (id) => recruitDigestNotice({ familyLabel: label, count }, inboxRow(id)));
    });
  }
}
