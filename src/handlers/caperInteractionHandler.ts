// CAPER_ROUTES: every `cpr:` press (spec 13.2). The router has already checked
// the owner and acknowledged; each route re-reads the caper and membership
// from the DB through one service, then hands the shared card to the flow
// module. A press on a shared card never sends a locally built card: the card
// writer edits the stored message.
import type { CaperRoleKey } from "../data/crimeFamilyCatalog";
import { joinCaper, leaveCaper, planCaper } from "../services/crimeFamily/caperLobbyService";
import { lockChoice, openBrief } from "../services/crimeFamily/caperPlayService";
import { buildPlannerView } from "../services/crimeFamily/caperQueries";
import { requireMembership } from "../services/crimeFamily/familyQueries";
import { FamilyError } from "../services/crimeFamily/tx";
import { pickLobbyChannel, postCaperCard, renderCaperCard, requestCaperRender } from "../ui/crimeFamily/caperCard";
import { announceLobby, onSeatsChanged, resolveAndAnnounce, runCancel, runStart } from "../ui/crimeFamily/caperFlow";
import { buildBrief, buildCaperPlanner } from "../ui/crimeFamily/caperScreens";
import { buildNotice, type CfPayload } from "../ui/crimeFamily/kit";
import { jumpLink } from "../ui/crimeFamily/post";
import { isCrimeFamilyOpen } from "../utils/economyConfig";
import { rejectPress, safeEditReply } from "../utils/interactionHelpers";
import type { CfInteraction, CfRoute, CfRouteEntry, CfRouteTable } from "./crimeFamilyRouter";
import { NOT_OPEN_HERE } from "./crewInteractionHandler";

const show = async (i: CfInteraction, payload: CfPayload) => { await safeEditReply(i, payload); };
const values = (i: CfInteraction): string[] => (i.isStringSelectMenu() ? i.values : []);
const owner = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "ephemeral", run });
const shared = (ack: CfRouteEntry["ack"], run: CfRoute): CfRouteEntry => ({ scope: "shared", ack, run });

/** Planning and joining are gated by the guild switch (C3); everything else runs so a live caper finishes. */
function assertOpen(i: CfInteraction): void {
  if (!isCrimeFamilyOpen(i.guildId)) throw new FamilyError(NOT_OPEN_HERE);
}

const planRoute: CfRoute = async (i) => {
  assertOpen(i);
  const uid = i.user.id;
  const { family } = await requireMembership(uid);
  const channelId = await pickLobbyChannel(i.client, i.channelId ?? "", family);
  const caper = await planCaper({ uid, tier: Number(values(i)[0]), guildId: i.guildId ?? "", channelId });
  const posted = await postCaperCard(i.client, caper.id, channelId);
  void announceLobby(i.client, caper.id).catch((err) => console.error("[crimeFamily] caper lobby DMs failed:", err));
  await show(i, buildNotice(posted
    ? `Lobby posted: ${jumpLink(caper.guildId, channelId, posted)}`
    : "Lobby opened, but the card could not be posted. Use `!caper` to post it."));
};

const joinRoute: CfRoute = async (i, [caperId]) => {
  assertOpen(i);
  const { full } = await joinCaper({ caperId, uid: i.user.id, role: values(i)[0] as CaperRoleKey, guildId: i.guildId });
  await onSeatsChanged(i.client, caperId, full);
};

const leaveRoute: CfRoute = async (i, [caperId]) => {
  const { cancelled } = await leaveCaper(caperId, i.user.id);
  if (cancelled) await renderCaperCard(i.client, caperId);
  else await requestCaperRender(i.client, caperId);
};

const startRoute: CfRoute = async (i, [caperId]) => {
  const result = await runStart(i.client, caperId, { kind: "press", uid: i.user.id });
  if (result.status !== "started" && result.reason) await rejectPress(i, result.reason);
};

const actRoute: CfRoute = async (i, [caperId, index]) => {
  const { brief, allLocked } = await lockChoice(caperId, i.user.id, Number(index));
  await show(i, buildBrief(brief));
  if (allLocked) await resolveAndAnnounce(i.client, caperId, new Date());
};

export const CAPER_ROUTES: CfRouteTable = {
  "v:plan": owner(async (i) => show(i, buildCaperPlanner(await buildPlannerView(i.user.id, new Date()), { art: true, ephemeral: true }))),
  plan: owner(planRoute),
  join: shared("update", joinRoute),
  leave: shared("update", leaveRoute),
  start: shared("update", startRoute),
  cancel: shared("update", (i, [caperId]) => runCancel(i.client, caperId, i.user.id)),
  brief: shared("auto", async (i, [caperId]) => show(i, buildBrief(await openBrief(caperId, i.user.id)))),
  act: shared("update", actRoute),
  "open:brief": owner(async (i, [, caperId]) => show(i, buildBrief(await openBrief(caperId, i.user.id)))),
};
