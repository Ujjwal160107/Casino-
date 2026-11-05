// `!turf` (aliases `!racket`, `!rackets`; slash `/turf action racket amount`):
// the turf command (spec 13.1). One table maps each subaction to a handler;
// every screen is drawn by turfScreens and every rule lives in the turf
// services. The whole command is gated by isTurfOpen (T1); the Scout and Hit
// buttons on a war card already posted keep working through TURF_ROUTES.
import type { Message } from "discord.js";
import { RACKETS } from "../../data/crimeFamilyCatalog";
import { TURF_NOT_OPEN_HERE, warCardScreen } from "../../handlers/turfInteractionHandler";
import { touchActivity } from "../../services/crimeFamily/activity";
import { BAD_AMOUNT, parseBidAmount, placeBid } from "../../services/crimeFamily/bidService";
import { requireMembership } from "../../services/crimeFamily/familyQueries";
import { resolveRacketKey } from "../../services/crimeFamily/racketService";
import { getTurfMapView } from "../../services/crimeFamily/turfQueries";
import { FamilyError } from "../../services/crimeFamily/tx";
import { TURF_IDS } from "../../ui/crimeFamily/ids";
import { buildNotice, buildOpener, type CfPayload } from "../../ui/crimeFamily/kit";
import { announceBid } from "../../ui/crimeFamily/turfAnnounce";
import { buildTurfMap } from "../../ui/crimeFamily/turfScreens";
import { errorContainer, v2Quiet } from "../../utils/componentsV2";
import { isTurfOpen } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import { replyOrRefuse, type CrewCtx } from "./crew";

const TITLE = "Turf";
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const show = (ctx: CrewCtx, payload: CfPayload) => ctx.message.reply(payload);

/** Review Focus 2: the refusal for a racket argument that names no racket. */
function racketOf(raw: string | undefined) {
  const def = resolveRacketKey(raw);
  if (!def) throw new FamilyError(`Unknown racket. Use a key or number: ${RACKETS.map((r, n) => `${n + 1} ${r.key}`).join(", ")}`);
  return def;
}

/** S16, posted publicly. */
async function map(ctx: CrewCtx) {
  return show(ctx, buildTurfMap(ctx.uid, await getTurfMapView(new Date())));
}

/** S27: S17 opens ephemerally from the owner's button. */
async function racket(ctx: CrewCtx) {
  const def = racketOf(ctx.args[0]);
  return show(ctx, buildOpener(`<@${ctx.uid}>: ${def.name}: owner, income and bidding window.`, {
    customId: TURF_IDS.openRacket(def.key, ctx.uid), label: "Open racket",
  }));
}

/** T16: places the bid directly; every refusal is one public line with no vault amount (D59, T6). */
async function bid(ctx: CrewCtx) {
  const def = racketOf(ctx.args[0]);
  const amount = parseBidAmount(ctx.args[1]);
  if (amount === null) throw new FamilyError(BAD_AMOUNT);
  const result = await placeBid({ racketKey: def.key, actorId: ctx.uid, amount });
  try {
    return await show(ctx, buildNotice(
      `${result.familyLabel} bid ${fmtFortunes(result.amount)} on ${result.racketName}. Bidding closes <t:${unix(result.bidClosesAt)}:R>.`,
    ));
  } finally {
    void announceBid(ctx.message.client, result);
  }
}

/** S25 war, only in the family's home guild, where its boards and buttons live. */
async function war(ctx: CrewCtx) {
  const { family } = await requireMembership(ctx.uid);
  if (family.homeGuildId !== ctx.guildId) throw new FamilyError("War actions happen in your family's home server.");
  return show(ctx, await warCardScreen(ctx.uid, new Date()));
}

export const TURF_SUBACTIONS: Readonly<Record<"map" | "racket" | "bid" | "war", (ctx: CrewCtx) => Promise<unknown>>> = {
  map, racket, bid, war,
};

/**
 * No subaction is `map`. A first argument that is not a subaction is read as
 * a racket (so `!racket casino_row` and `!racket 9` open it); anything else
 * gets the unknown-racket refusal. `prefix` is the router's.
 */
export async function handleTurf(message: Message, args: string[], prefix = "!"): Promise<unknown> {
  if (!message.guildId) return undefined;
  if (!isTurfOpen(message.guildId)) return message.reply(v2Quiet(errorContainer(TITLE, TURF_NOT_OPEN_HERE)));
  const uid = message.author.id;
  void touchActivity(uid);
  const first = args[0]?.toLowerCase() ?? "map";
  const isSub = Object.prototype.hasOwnProperty.call(TURF_SUBACTIONS, first);
  const run = isSub ? TURF_SUBACTIONS[first as keyof typeof TURF_SUBACTIONS] : racket;
  const ctx: CrewCtx = { message, args: isSub ? args.slice(1) : args, uid, guildId: message.guildId, channelId: message.channelId, prefix };
  return replyOrRefuse(message, () => run(ctx), TITLE);
}
