// TURF_ROUTES: every `turf:` press (spec 13.2). The router has already checked
// the owner and acknowledged; each route calls one turf service and renders
// one screen. The map, racket detail and bids are gated by isTurfOpen; Scout,
// Hit and the hit answer are not, so a war already running finishes (T1).
// Every war press is authorised against DB rows by the service, never the message.
import { WAR_BLOCKS, racketDef } from "../data/crimeFamilyCatalog";
import { BAD_AMOUNT, parseBidAmount, placeBid } from "../services/crimeFamily/bidService";
import { getMembership } from "../services/crimeFamily/familyQueries";
import { getLiveWarFor, getRacketDetailView, getTurfMapView } from "../services/crimeFamily/turfQueries";
import { FamilyError } from "../services/crimeFamily/tx";
import { answerHit, armHit, scoutWar } from "../services/crimeFamily/warActions";
import type { WarBlockKey } from "../services/crimeFamily/warMath";
import { buildNotice, type CfPayload } from "../ui/crimeFamily/kit";
import { jumpLink } from "../ui/crimeFamily/post";
import { announceBid, boardsOf } from "../ui/crimeFamily/turfAnnounce";
import {
  buildBidModal, buildHitCall, buildHitResult, buildRacketDetail, buildScoutReport, buildTurfMap, buildWarCard,
} from "../ui/crimeFamily/turfScreens";
import { isTurfOpen } from "../utils/economyConfig";
import { fmtFortunes } from "../utils/format";
import { safeEditReply } from "../utils/interactionHelpers";
import type { CfInteraction, CfRoute, CfRouteEntry, CfRouteTable } from "./crimeFamilyRouter";

export const TURF_NOT_OPEN_HERE = "Turf wars are not open in this server yet.";
const INACTIVE = "This button is no longer active.";
const APPROACH_COUNT = Math.min(...WAR_BLOCKS.map((b) => b.approaches.length));

const show = async (i: CfInteraction, payload: CfPayload) => { await safeEditReply(i, payload); };
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const blockOf = (key: string | undefined) => WAR_BLOCKS.find((b) => b.key === key) ?? null;
const blockName = (key: WarBlockKey) => blockOf(key)!.name;

/** An owner route gated by the turf switch (T1). */
const gated = (ack: CfRouteEntry["ack"], run: CfRoute): CfRouteEntry => ({
  scope: "owner",
  ack,
  run: async (i, args) => {
    if (!isTurfOpen(i.guildId)) throw new FamilyError(TURF_NOT_OPEN_HERE);
    await run(i, args);
  },
});
const shared = (ack: CfRouteEntry["ack"], run: CfRoute): CfRouteEntry => ({ scope: "shared", ack, run });

const racketScreen = async (uid: string, racketKey: string, note?: string) =>
  buildRacketDetail(uid, await getRacketDetailView(racketKey, uid, new Date()), note);

/**
 * S25 war (T20): the family's ACTIVE war with a jump link to its own side's
 * board (none when that board is dead or not posted), otherwise one line with
 * the next war time.
 */
export async function warCardScreen(uid: string, now: Date): Promise<CfPayload> {
  const membership = await getMembership(uid);
  const war = membership ? await getLiveWarFor(membership.family.id) : null;
  const racketName = war ? racketDef(war.racketKey)?.name ?? war.racketKey : "";
  if (war?.status === "ACTIVE") {
    const side = war.attackerFamilyId === membership!.family.id ? "ATK" : "DEF";
    const ref = boardsOf(war).find((r) => r.side === side && !r.dead && r.messageId !== "");
    return buildWarCard({ warId: war.id, racketName, endsAt: war.endsAt, jumpUrl: ref ? jumpLink(ref.guildId, ref.channelId, ref.messageId) : null });
  }
  // An ARMED war is the family's own next fight; the map's soonest slot may be another racket.
  const next = war ? { racketName, startsAt: war.startsAt } : (await getTurfMapView(now)).nextWar;
  return buildNotice(`No turf war is live for your family. Next war: ${next.racketName} <t:${unix(next.startsAt)}:F>.`);
}

const bidModalRoute: CfRouteEntry = {
  scope: "modalOpener",
  ack: "modal",
  run: async (i, [racketKey, owner]) => {
    if (i.isModalSubmit()) return;
    await i.showModal(buildBidModal(racketKey, owner));
  },
};

const bidSubmitRoute: CfRoute = async (i, [, racketKey]) => {
  if (!i.isModalSubmit()) return;
  const amount = parseBidAmount(i.fields.getTextInputValue("amount"));
  if (amount === null) throw new FamilyError(BAD_AMOUNT);
  const result = await placeBid({ racketKey, actorId: i.user.id, amount });
  try {
    await show(i, await racketScreen(i.user.id, racketKey, `Bid placed: ${fmtFortunes(amount)}.`));
  } finally {
    void announceBid(i.client, result);
  }
};

const hitRoute: CfRoute = async (i, [warId, block]) => {
  if (!blockOf(block)) throw new FamilyError(INACTIVE);
  const armed = await armHit({ warId, userId: i.user.id, guildId: i.guildId, block: block as WarBlockKey });
  await show(i, buildHitCall(armed, blockName(armed.block)));
};

const answerRoute: CfRoute = async (i, [hitId, index]) => {
  const choice = Number(index);
  if (!/^\d+$/.test(index ?? "") || choice >= APPROACH_COUNT) throw new FamilyError(INACTIVE);
  const { correct, points, block } = await answerHit({ hitId, userId: i.user.id, choice });
  await show(i, buildHitResult(correct ? `Hit! +${points} on ${blockName(block)}.` : "Missed. No points."));
};

export const TURF_ROUTES: CfRouteTable = {
  "v:map": gated("auto", async (i) => show(i, buildTurfMap(i.user.id, await getTurfMapView(new Date())))),
  "v:war": gated("auto", async (i) => show(i, await warCardScreen(i.user.id, new Date()))),
  sel: gated("auto", async (i) => show(i, await racketScreen(i.user.id, i.isStringSelectMenu() ? i.values[0] : ""))),
  "open:racket": gated("ephemeral", async (i, [, racketKey]) => show(i, await racketScreen(i.user.id, racketKey))),
  bid: bidModalRoute,
  "modal:bid": gated("ephemeral", bidSubmitRoute),
  scout: shared("ephemeral", async (i, [warId]) => {
    const report = await scoutWar({ warId, userId: i.user.id, guildId: i.guildId });
    await show(i, buildScoutReport(report, blockName(report.block)));
  }),
  hit: shared("ephemeral", hitRoute),
  hx: shared("update", answerRoute),
};
