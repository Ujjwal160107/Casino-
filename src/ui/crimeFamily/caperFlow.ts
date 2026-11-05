// The Discord side of the caper (spec 8.4, 13.2, 13.4), shared by the cpr:
// routes, `!caper` and the sweeper: lobby calls, Start (card, GO call, DMs,
// reminders, the settle timer), cancel and resolve. Service refusals
// propagate; Discord failures are logged and never thrown, so a dead channel
// never stops the money or the DMs.
import type { Caper } from "@prisma/client";
import type { Client } from "discord.js";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { caperRole, caperTier, type CaperRoleKey, type CaperTierDef } from "../../data/crimeFamilyCatalog";
import { fmtFortunes } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { redisService } from "../../services/redisService";
import { enqueueReminder } from "../../services/cooldownReminderService";
import { getOwnedPrepKeys } from "../../services/crimeService";
import { caperGoNotice, caperLobbyNotice, notifyMany } from "../../services/dmNoticeService";
import { buildCaperCardView, cancelledLobbySince, getCaper, listCrew, startedSeatsSince } from "../../services/crimeFamily/caperQueries";
import { cancelCaper, leaveCaper, planCaper, startCaper, type StartBy, type StartResult } from "../../services/crimeFamily/caperLobbyService";
import { processBootedAt, resolveCaper, type ResolveResult } from "../../services/crimeFamily/caperSettleService";
import { checkMemberEligibility } from "../../services/crimeFamily/eligibility";
import { listMembers, requireMembership } from "../../services/crimeFamily/familyQueries";
import { pickLobbyChannel, postCaperCard, renderCaperCard, requestCaperRender } from "./caperCard";
import { buildGoCall } from "./caperScreens";
import { jumpLink, sendToChannel } from "./post";

const mention = (id: string) => `<@${id}>`;
const windowStart = (now: Date) => new Date(now.getTime() - CRIME_FAMILY_CONFIG.caperWindowSeconds * 1000);

/** Runs one Discord side effect, logging instead of throwing: the service step already committed. */
async function safely(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(`[crimeFamily] ${name} failed:`, err);
  }
}

/** One of the member's lobby DMs in the rolling window (14.3); a Redis error grants it. */
async function takeLobbyDmSlot(uid: string): Promise<boolean> {
  try {
    const redis = redisService.getInstance();
    const key = `cf:lobbydm:${uid}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, CRIME_FAMILY_CONFIG.caperWindowSeconds);
    return count <= CRIME_FAMILY_CONFIG.lobbyDmsPer24h;
  } catch (err) {
    console.error(`[crimeFamily] lobby DM cap error for ${uid}:`, err);
    return true;
  }
}

/** Whether an unseated member would qualify for one of the open seats (8.4 step 1): the tier gate, a prep item, a free seat. */
async function wouldQualify(uid: string, tier: CaperTierDef, open: readonly CaperRoleKey[], now: Date): Promise<boolean> {
  if (!(await checkMemberEligibility(uid, `caper_t${tier.tier}`, { now })).ok) return false;
  const owned = await getOwnedPrepKeys(uid);
  if (!open.some((role) => caperRole(role).prepKeys.some((k) => owned.has(k)))) return false;
  return (await startedSeatsSince(uid, windowStart(now))).length < CRIME_FAMILY_CONFIG.seatsPer24h;
}

/**
 * The caper_lobby DMs for a new lobby: unseated members in the lobby's guild
 * who would qualify for an open seat and have a lobby-DM slot left; nobody
 * within lobbyDmQuietAfterCancelSeconds of a cancelled lobby. The ids DMed.
 */
export async function announceLobby(client: Client, caperId: string, now: Date = new Date()): Promise<string[]> {
  const caper = await getCaper(caperId);
  const view = await buildCaperCardView(caperId, now);
  if (!caper || !view || view.status !== "LOBBY" || view.openRoles.length === 0) return [];
  const quietSince = new Date(now.getTime() - CRIME_FAMILY_CONFIG.lobbyDmQuietAfterCancelSeconds * 1000);
  if (await cancelledLobbySince(caper.familyId, quietSince)) return [];
  const guild = client.guilds.cache.get(caper.guildId);
  if (!guild) return [];

  const tier = caperTier(view.tier);
  const seated = new Set(view.seats.map((s) => s.userId));
  const ids: string[] = [];
  for (const { userId } of await listMembers(caper.familyId)) {
    if (seated.has(userId)) continue;
    try {
      await guild.members.fetch(userId);
    } catch {
      continue;
    }
    if (!(await wouldQualify(userId, tier, view.openRoles, now))) continue;
    if (await takeLobbyDmSlot(userId)) ids.push(userId);
  }
  const notice = {
    familyLabel: view.familyLabel, tierName: tier.name, stake: tier.stake, closesAt: view.lobbyClosesAt,
    jumpUrl: view.messageId ? jumpLink(view.guildId, view.channelId, view.messageId) : null,
  };
  await notifyMany(client, "caper_lobby", ids, () => caperLobbyNotice(notice));
  return ids;
}

/**
 * Plans a lobby from `channelId` (or the family's home channel, edge 75),
 * posts its card there and sends the lobby DMs in the background. `posted` is
 * null when the card could not be sent; `!caper` reposts it.
 */
export async function openLobby(
  client: Client, input: { uid: string; tier: number; guildId: string; channelId: string },
): Promise<{ caper: Caper; channelId: string; posted: string | null }> {
  const { family } = await requireMembership(input.uid);
  const channelId = await pickLobbyChannel(client, input.channelId, family);
  const caper = await planCaper({ uid: input.uid, tier: input.tier, guildId: input.guildId, channelId });
  const posted = await postCaperCard(client, caper.id, channelId);
  void announceLobby(client, caper.id).catch((err) => console.error("[crimeFamily] caper lobby DMs failed:", err));
  return { caper, channelId, posted };
}

/** After a Start committed: S13, the S28 GO call, the GO DMs, the seat-free reminders and the settle timer (C8). */
async function announceStart(client: Client, caperId: string, pinched: string[], now: Date): Promise<void> {
  const note = pinched.length > 0 ? `Pinched at Start: ${pinched.map(mention).join(", ")} (stake refunded)` : null;
  await safely("caper GO render", () => renderCaperCard(client, caperId, { note, now }));
  const caper = await getCaper(caperId);
  if (!caper) return;
  const crewIds = (await listCrew(caperId)).map((r) => r.userId);

  const goId = await sendToChannel(client, caper.channelId, buildGoCall({ caperId, crewIds, goEndsAt: caper.goEndsAt, pinched }));
  const jumpTo = goId ?? (caper.messageId || null);
  const jumpUrl = jumpTo ? jumpLink(caper.guildId, caper.channelId, jumpTo) : null;
  const tierName = caperTier(caper.tier).name;
  await notifyMany(client, "caper_lobby", crewIds, () => caperGoNotice({ tierName, goEndsAt: caper.goEndsAt, jumpUrl }));

  for (const uid of crewIds) {
    await safely("caper reminder", async () => {
      const seats = await startedSeatsSince(uid, windowStart(now));
      if (seats.length < CRIME_FAMILY_CONFIG.seatsPer24h) return;
      await enqueueReminder(uid, "caper", new Date(seats[0].startedAt.getTime() + CRIME_FAMILY_CONFIG.caperWindowSeconds * 1000));
    });
  }

  const delay = Math.max(0, caper.goEndsAt.getTime() - now.getTime()) + CRIME_FAMILY_CONFIG.caperSettleDelayMs;
  setTimeout(() => void safely("caper settle timer", () => resolveAndAnnounce(client, caperId, new Date())), delay).unref();
}

/** Start by a press, the last join or the sweeper; the card shows why a Start did not happen. */
export async function runStart(client: Client, caperId: string, by: StartBy, now: Date = new Date()): Promise<StartResult> {
  const result = await startCaper(caperId, by, now);
  if (result.status === "started") {
    await announceStart(client, caperId, result.pinched.map((p) => p.userId), now);
  } else if (result.status !== "closed") {
    await safely("caper start render", () => renderCaperCard(client, caperId, { note: result.reason, now }));
  }
  return result;
}

/** After a join, leave or kick: a full lobby starts itself; otherwise the card re-renders (debounced). */
export async function onSeatsChanged(client: Client, caperId: string, full: boolean, now: Date = new Date()): Promise<void> {
  if (full) await runStart(client, caperId, { kind: "auto" }, now);
  else await safely("caper roster render", () => requestCaperRender(client, caperId));
}

/** Leaves the lobby (the seat is refunded; the planner leaving cancels it) and redraws the card. */
export async function runLeave(client: Client, caperId: string, uid: string, now: Date = new Date()): Promise<{ cancelled: boolean }> {
  const result = await leaveCaper(caperId, uid, now);
  if (result.cancelled) await safely("caper cancel render", () => renderCaperCard(client, caperId, { now }));
  else await safely("caper roster render", () => requestCaperRender(client, caperId));
  return result;
}

/** Cancels the lobby (refunds every stake) and draws the cancelled card. */
export async function runCancel(client: Client, caperId: string, actorId: string | null, now: Date = new Date()): Promise<void> {
  await cancelCaper(caperId, actorId, now);
  await safely("caper cancel render", () => renderCaperCard(client, caperId, { now }));
}

/** Resolves a run (VOID, corrupt or settle), draws the result, and logs a big pool to the guild's trade log. */
export async function resolveAndAnnounce(client: Client, caperId: string, now: Date, bootedAt?: Date): Promise<ResolveResult> {
  const result = await resolveCaper(caperId, now, bootedAt ?? processBootedAt());
  if (!result.resolvedNow) return result;
  await safely("caper result render", () => renderCaperCard(client, caperId, { now }));
  if (result.status === "settled") {
    await safely("caper trade log", async () => {
      const view = await buildCaperCardView(caperId, now);
      const guild = view ? client.guilds.cache.get(view.guildId) : undefined;
      if (!view || !guild || view.pool < CRIME_FAMILY_CONFIG.caperTradeLogMinPool) return;
      await logToChannel(client, {
        guild, type: "TRADE", title: "Caper resolved",
        description: `${view.familyLabel} · T${view.tier} ${caperTier(view.tier).name} · ${view.outcome} · pool ${fmtFortunes(view.pool)}`,
      });
    });
  }
  return result;
}
