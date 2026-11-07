// CAPER_ROUTES: every `cpr:` press (spec 13.2). The router has already checked
// the owner and acknowledged; each route re-reads the caper and membership
// from the DB through one service, then hands the shared card to the flow
// module. A press on a shared card never sends a locally built card: the card
// writer edits the stored message. Brief, Refresh and Share answer with the
// presser's private S14.
import type { CaperRoleKey } from "../data/crimeFamilyCatalog";
import { joinCaper } from "../services/crimeFamily/caperLobbyService";
import { lockChoice, openBrief, shareIntel } from "../services/crimeFamily/caperPlayService";
import { buildCaperCardView, buildPlannerView } from "../services/crimeFamily/caperQueries";
import { onSeatsChanged, openLobby, resolveAndAnnounce, runCancel, runLeave, runStart, safely, sendIntelNudge } from "../ui/crimeFamily/caperFlow";
import { buildBrief, buildCaperPlanner, buildPersonalCaperCard } from "../ui/crimeFamily/caperScreens";
import { buildNotice, type CfPayload } from "../ui/crimeFamily/kit";
import { jumpLink } from "../ui/crimeFamily/post";
import { rejectPress, safeEditReply } from "../utils/interactionHelpers";
import type { CfInteraction, CfRoute, CfRouteEntry, CfRouteTable } from "./crimeFamilyRouter";
import { assertCfOpen, assertServerOpen } from "./crewRouteKit";

const show = async (i: CfInteraction, payload: CfPayload) => { await safeEditReply(i, payload); };
const values = (i: CfInteraction): string[] => (i.isStringSelectMenu() ? i.values : []);
const owner = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "ephemeral", run });
const shared = (ack: CfRouteEntry["ack"], run: CfRoute): CfRouteEntry => ({ scope: "shared", ack, run });

// Planning and joining are gated by the kill switch (C3); everything else runs so a live caper finishes.
// Plan needs a server (the lobby posts there); a join works from any server or a DM (A4, A20).
const planRoute: CfRoute = async (i) => {
  assertServerOpen(i);
  const { caper, channelId, posted } = await openLobby(i.client, {
    uid: i.user.id, tier: Number(values(i)[0]), guildId: i.guildId ?? "", channelId: i.channelId ?? "",
  });
  await show(i, buildNotice(posted
    ? `Lobby posted: ${jumpLink(caper.guildId, channelId, posted)}`
    : "Lobby opened, but the card could not be posted. Use `!heist` to post it."));
};

// A join on the shared card leaves the edit to the card writer; any other pressed
// message (a DM, an S25 lobby card) becomes the presser's S25 card (G3), read after
// onSeatsChanged so a filling join shows GO. A refused join edits nothing.
// The seat has committed: a failed card read is logged, never sent as a refusal.
const joinRoute: CfRoute = async (i, [caperId]) => {
  assertCfOpen(i.guildId);
  const joined = await joinCaper({ caperId, uid: i.user.id, role: values(i)[0] as CaperRoleKey });
  await onSeatsChanged(i.client, caperId, joined.full);
  const onCard = i.isMessageComponent() && i.message.id === joined.caper.messageId;
  if (onCard) return;
  await safely("caper off-card join card", async () => {
    const card = await buildCaperCardView(caperId, new Date());
    if (card) await show(i, buildPersonalCaperCard(card, i.user.id));
  });
};

const startRoute: CfRoute = async (i, [caperId]) => {
  const result = await runStart(i.client, caperId, { kind: "press", uid: i.user.id });
  if (result.status !== "started" && result.reason) await rejectPress(i, result.reason);
};

const actRoute: CfRoute = async (i, [caperId, index]) => {
  const { brief, allLocked } = await lockChoice(caperId, i.user.id, Number(index));
  await show(i, buildBrief(brief));
  // The lock committed and is shown: a failed resolve is logged (the sweeper settles it), never sent as a refusal.
  if (allLocked) await safely("caper last-lock resolve", () => resolveAndAnnounce(i.client, caperId, new Date()));
};

// Share is not gated by the kill switch: a live crew heist finishes (A18).
const shareRoute: CfRoute = async (i, [caperId]) => {
  const { brief, nudge } = await shareIntel(caperId, i.user.id);
  await show(i, buildBrief(brief));
  if (nudge) await sendIntelNudge(i.client, caperId, i.user.id, nudge);
};

export const CAPER_ROUTES: CfRouteTable = {
  "v:plan": owner(async (i) => show(i, buildCaperPlanner(await buildPlannerView(i.user.id, new Date()), { art: true, ephemeral: true }))),
  plan: owner(planRoute),
  join: shared("update", joinRoute),
  leave: shared("update", async (i, [caperId]) => { await runLeave(i.client, caperId, i.user.id); }),
  start: shared("update", startRoute),
  cancel: shared("update", (i, [caperId]) => runCancel(i.client, caperId, i.user.id)),
  brief: shared("auto", async (i, [caperId]) => show(i, buildBrief(await openBrief(caperId, i.user.id)))),
  act: shared("update", actRoute),
  share: shared("auto", shareRoute),
  "open:brief": owner(async (i, [, caperId]) => show(i, buildBrief(await openBrief(caperId, i.user.id)))),
};
