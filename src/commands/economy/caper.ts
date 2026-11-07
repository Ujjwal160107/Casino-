// `!heist` (aliases `!crewheist`, `!caper`, `!capers`, slash `/heist action value`):
// the crew heist command, internally "caper" (spec 8, 13.1; amendment 9). One
// table maps each subaction to a handler; the shared card is drawn by the card
// writer, never built here. Only planning, joining and the no-live-caper view
// are gated by the guild switch (C3), so a live caper finishes under the kill
// switch. Jail is enforced by the seat gates, so a jailed member can still open
// their brief.
import type { Message } from "discord.js";
import { CAPER_ROLES, caperRole, type CaperRoleKey } from "../../data/crimeFamilyCatalog";
import { NOT_OPEN_HERE } from "../../handlers/crewInteractionHandler";
import { touchActivity } from "../../services/crimeFamily/activity";
import { joinCaper } from "../../services/crimeFamily/caperLobbyService";
import { buildPlannerView, getCaper, getLiveCaper, latestResolvedCaper, liveSeatOf } from "../../services/crimeFamily/caperQueries";
import { getMembership, requireMembership } from "../../services/crimeFamily/familyQueries";
import { FamilyError } from "../../services/crimeFamily/tx";
import { postCaperCard } from "../../ui/crimeFamily/caperCard";
import { onSeatsChanged, openLobby, runCancel, runLeave, runStart } from "../../ui/crimeFamily/caperFlow";
import { buildCaperPlanner, buildCaperSeatCard } from "../../ui/crimeFamily/caperScreens";
import { CPR_IDS } from "../../ui/crimeFamily/ids";
import { buildNotice, buildOpener, type CfPayload } from "../../ui/crimeFamily/kit";
import { jumpLink } from "../../ui/crimeFamily/post";
import { errorContainer, v2Quiet } from "../../utils/componentsV2";
import { CRIME_FAMILY_CONFIG, isCrimeFamilyOpen } from "../../utils/economyConfig";
import { replyOrRefuse, type CrewCtx } from "./crew";

const TITLE = "Crime Families";
const NO_LOBBY = "Your family has no open lobby.";
const JOINABLE = CAPER_ROLES.filter((r) => r.key !== "MASTERMIND").map((r) => r.name).join(", ");

const show = (ctx: CrewCtx, payload: CfPayload) => ctx.message.reply(payload);
const notice = (ctx: CrewCtx, text: string) => show(ctx, buildNotice(text));
const squash = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");

/** A caper role from free text: case, spaces, `-` and `_` ignored, matching a role key or name. */
export function parseRoleArg(raw: string | undefined): CaperRoleKey | null {
  if (raw === undefined) return null;
  const want = squash(raw);
  return CAPER_ROLES.find((r) => squash(r.key) === want || squash(r.name) === want)?.key ?? null;
}

function assertOpen(ctx: CrewCtx): void {
  if (!isCrimeFamilyOpen(ctx.guildId)) throw new FamilyError(NOT_OPEN_HERE);
}

/** The caller's family's live caper; the refusal when there is none. */
async function familyLiveCaper(ctx: CrewCtx) {
  const { family } = await requireMembership(ctx.uid);
  const live = await getLiveCaper(family.id);
  if (!live) throw new FamilyError(NO_LOBBY);
  return live;
}

/** Reposts the card here; a refusal when it could not be sent. */
async function repost(ctx: CrewCtx, caperId: string): Promise<void> {
  const posted = await postCaperCard(ctx.message.client, caperId, ctx.channelId);
  if (posted === null) throw new FamilyError("I couldn't post the crew heist card in this channel.");
}

/** C7: the live caper's card moves here; else a recent dead result is reposted; else S11. */
async function view(ctx: CrewCtx) {
  const membership = await getMembership(ctx.uid);
  if (!membership) throw new FamilyError(`You are not in a crime family. Start with \`${ctx.prefix}crew\`.`);
  const live = await getLiveCaper(membership.family.id);
  if (live && live.guildId === ctx.guildId) return repost(ctx, live.id);
  if (live) {
    const link = live.messageId ? `: ${jumpLink(live.guildId, live.channelId, live.messageId)}` : ".";
    return notice(ctx, `Your family's crew heist is running in another server${link}`);
  }
  const now = new Date();
  const last = await latestResolvedCaper(membership.family.id);
  const deadSince = now.getTime() - CRIME_FAMILY_CONFIG.caperDeadResultRepostSeconds * 1000;
  if (last && last.messageId === "" && last.updatedAt.getTime() >= deadSince) return repost(ctx, last.id);
  assertOpen(ctx);
  return show(ctx, buildCaperPlanner(await buildPlannerView(ctx.uid, now), { art: true, ephemeral: false }));
}

async function plan(ctx: CrewCtx) {
  assertOpen(ctx);
  const { caper, channelId, posted } = await openLobby(ctx.message.client, {
    uid: ctx.uid, tier: Number(ctx.args[0]), guildId: ctx.guildId, channelId: ctx.channelId,
  });
  if (posted === null) return notice(ctx, `Lobby opened, but the card could not be posted. Use \`${ctx.prefix}heist\` to post it.`);
  if (channelId !== ctx.channelId) return notice(ctx, `Lobby posted in <#${channelId}>: ${jumpLink(caper.guildId, channelId, posted)}`);
  return undefined;
}

async function join(ctx: CrewCtx) {
  assertOpen(ctx);
  const role = parseRoleArg(ctx.args.join(" "));
  if (!role) throw new FamilyError(`Unknown role. Roles: ${JOINABLE}.`);
  const live = await familyLiveCaper(ctx);
  if (live.status !== "LOBBY") throw new FamilyError(NO_LOBBY);
  const { caper, full } = await joinCaper({ caperId: live.id, uid: ctx.uid, role });
  const jumpUrl = caper.messageId ? jumpLink(caper.guildId, caper.channelId, caper.messageId) : null;
  // The seat is committed: a failed reply (deleted message, no Send Messages)
  // must not skip the auto-start or the roster redraw.
  try {
    await show(ctx, buildCaperSeatCard({ caperId: caper.id, text: `Seated as ${caperRole(role).name}.`, jumpUrl }));
  } finally {
    await onSeatsChanged(ctx.message.client, caper.id, full);
  }
}

async function leave(ctx: CrewCtx) {
  const live = await familyLiveCaper(ctx);
  const { cancelled } = await runLeave(ctx.message.client, live.id, ctx.uid);
  return notice(ctx, cancelled ? "Crew heist cancelled; every stake was refunded." : "You left the crew heist; your stake was refunded.");
}

async function start(ctx: CrewCtx) {
  const live = await familyLiveCaper(ctx);
  const result = await runStart(ctx.message.client, live.id, { kind: "press", uid: ctx.uid });
  if (result.status !== "started") throw new FamilyError(result.reason ?? "Lobby closed.");
  return undefined;
}

async function cancel(ctx: CrewCtx) {
  const live = await familyLiveCaper(ctx);
  await runCancel(ctx.message.client, live.id, ctx.uid);
  return notice(ctx, "Crew heist cancelled; every stake was refunded.");
}

/** S27: the caller's brief, when they hold a seat in a RUNNING caper. */
async function brief(ctx: CrewCtx) {
  const seat = await liveSeatOf(ctx.uid);
  const caper = seat ? await getCaper(seat.caperId) : null;
  if (!caper || caper.status !== "RUNNING") throw new FamilyError("No crew heist is running.");
  return show(ctx, buildOpener(`<@${ctx.uid}>: Your crew heist brief is ready.`, { customId: CPR_IDS.openBrief(caper.id, ctx.uid), label: "Open brief" }));
}

export const CAPER_SUBACTIONS: Readonly<Record<"view" | "plan" | "join" | "leave" | "start" | "cancel" | "brief", (ctx: CrewCtx) => Promise<unknown>>> = {
  view, plan, join, leave, start, cancel, brief,
};

/** `prefix` is the router's: the guild's prefix, or "/" for a slash user. */
export async function handleCaper(message: Message, args: string[], prefix = "!"): Promise<unknown> {
  if (!message.guildId) return undefined;
  const uid = message.author.id;
  void touchActivity(uid);
  const sub = args[0]?.toLowerCase() ?? "view";
  if (!Object.prototype.hasOwnProperty.call(CAPER_SUBACTIONS, sub)) {
    return message.reply(v2Quiet(errorContainer(TITLE, `Usage: ${prefix}heist [plan <1-4> | join <role> | leave | start | cancel | brief]`)));
  }
  const run = CAPER_SUBACTIONS[sub as keyof typeof CAPER_SUBACTIONS];
  const ctx: CrewCtx = { message, args: args.slice(1), uid, guildId: message.guildId, channelId: message.channelId, prefix };
  return replyOrRefuse(message, () => run(ctx));
}
