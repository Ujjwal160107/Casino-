// Discord side effects of turf, shared by the turf jobs, the turf: routes and
// `!turf`: the two home-channel war boards (post, edit, one dead-board
// repost), the war result, and the `turf` DMs (spec 13.2, 13.4, edge 28).
// Nothing here throws: every announcer runs after its service committed.
import type { Prisma, War } from "@prisma/client";
import type { Client } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { racketDef } from "../../data/crimeFamilyCatalog";
import { setNx } from "../../services/crimeFamily/activity";
import type { BidResult } from "../../services/crimeFamily/bidService";
import { checkMemberEligibility } from "../../services/crimeFamily/eligibility";
import { listMembers } from "../../services/crimeFamily/familyQueries";
import type { RacketCollect } from "../../services/crimeFamily/racketService";
import { getWarBoardView } from "../../services/crimeFamily/turfQueries";
import type { WarBoardRef, WarBoardView, WarResultView } from "../../services/crimeFamily/views";
import type { WarSide } from "../../services/crimeFamily/warMath";
import type { WarSettlement } from "../../services/crimeFamily/warService";
import {
  notifyMany, turfBidPlacedNotice, turfNeglectNotice, turfOutbidNotice, turfReleasedNotice, turfWarResultNotice, turfWarSoonNotice,
} from "../../services/dmNoticeService";
import { safely } from "./caperFlow";
import { buildNotice } from "./kit";
import { channelLink, editChannelMessage, sendToChannel } from "./post";
import { buildWarBoard, buildWarResult, warOutcomeLine } from "./turfScreens";

const boardsOf = (war: War): WarBoardRef[] => (Array.isArray(war.boards) ? (war.boards as unknown as WarBoardRef[]) : []);

/** The family sides of a war: the attacker, and the defender unless it is the Street. */
function familySides(war: Pick<War, "attackerFamilyId" | "defenderFamilyId">): [WarSide, string][] {
  const sides: [WarSide, string][] = [["ATK", war.attackerFamilyId]];
  if (war.defenderFamilyId !== "") sides.push(["DEF", war.defenderFamilyId]);
  return sides;
}

async function homesOf(familyIds: string[]): Promise<Map<string, { guildId: string; channelId: string }>> {
  const families = await prisma.family.findMany({ where: { id: { in: familyIds } }, select: { id: true, homeGuildId: true, homeChannelId: true } });
  return new Map(families.filter((f) => f.homeChannelId).map((f) => [f.id, { guildId: f.homeGuildId, channelId: f.homeChannelId }]));
}

async function officersOf(familyId: string): Promise<string[]> {
  return (await listMembers(familyId)).filter((m) => m.role === "BOSS" || m.role === "UNDERBOSS").map((m) => m.userId);
}

/** A new board message; null when the channel refused it. */
async function postBoard(client: Client, channelId: string, view: WarBoardView): Promise<{ messageId: string; hasBanner: boolean } | null> {
  const payload = buildWarBoard(view, "send");
  const messageId = await sendToChannel(client, channelId, payload);
  return messageId === null ? null : { messageId, hasBanner: !!payload.files?.length };
}

/**
 * One side's board after this sync (edge 28): a first post; a failed first
 * post or a dead edit gets exactly one repost, after which the board is dead
 * and never touched again. An edit keeps the gallery only when the message
 * holds the banner, and sends no files (T8).
 */
async function syncBoard(client: Client, ref: WarBoardRef, view: WarBoardView): Promise<WarBoardRef> {
  if (ref.dead) return ref;
  if (ref.messageId !== "") {
    const edited = await editChannelMessage(client, ref.channelId, ref.messageId, buildWarBoard(view, ref.hasBanner ? "keep" : "none"));
    if (edited !== "dead") return ref;
  }
  const posted = await postBoard(client, ref.channelId, view);
  return posted ? { ...ref, ...posted } : { ...ref, messageId: "", dead: true };
}

/**
 * S18 in both families' home channels. Renders only an ACTIVE war (or with
 * `force`), and without `force` at most once per warBoardRefreshSeconds (T7:
 * "held" skips; "set" and a Redis "error" render).
 */
export async function syncWarBoards(client: Client, warId: string, now: Date, opts: { force?: boolean } = {}): Promise<void> {
  return safely("syncWarBoards", async () => {
    const war = await prisma.war.findUnique({ where: { id: warId } });
    if (!war || (war.status !== "ACTIVE" && !opts.force)) return;
    if (!opts.force && (await setNx(`cf:render:war:${warId}`, CRIME_FAMILY_CONFIG.warBoardRefreshSeconds)) === "held") return;
    const view = await getWarBoardView(warId, now);
    const refs = boardsOf(war);
    const sides = familySides(war);
    const homes = await homesOf(sides.map(([, id]) => id));
    const next: WarBoardRef[] = [];
    for (const [side, familyId] of sides) {
      const ref = refs.find((r) => r.side === side);
      if (ref) {
        next.push(await syncBoard(client, ref, view));
        continue;
      }
      const home = homes.get(familyId);
      if (!home) continue;
      const posted = await postBoard(client, home.channelId, view);
      next.push({ side, guildId: home.guildId, channelId: home.channelId, messageId: "", hasBanner: false, dead: false, ...posted });
    }
    if (JSON.stringify(next) !== JSON.stringify(refs)) {
      await prisma.war.update({ where: { id: warId }, data: { boards: next as unknown as Prisma.InputJsonValue } });
    }
  });
}

/** S21 on every live board, an S28 result notice in both home channels, and a DM to each contributor. */
export async function announceWarResult(client: Client, s: WarSettlement, now: Date): Promise<void> {
  return safely("announceWarResult", async () => {
    const war = await prisma.war.findUnique({ where: { id: s.warId } });
    if (!war) return;
    const board = await getWarBoardView(s.warId, now);
    const labelOf = (familyId: string) => (familyId === board.attacker.familyId ? board.attacker.label : board.defender.label);
    const result: WarResultView = {
      board, outcome: s.outcome, overCap: s.overCap, xp: s.xp.map((x) => ({ label: labelOf(x.familyId), xp: x.xp })), heated: s.heated.length,
    };
    for (const ref of boardsOf(war)) {
      if (ref.dead || ref.messageId === "") continue;
      await editChannelMessage(client, ref.channelId, ref.messageId, buildWarResult(result, ref.hasBanner ? "keep" : "none"));
    }
    const summary = warOutcomeLine(result);
    const homes = await homesOf(familySides(war).map(([, id]) => id));
    for (const home of homes.values()) await sendToChannel(client, home.channelId, buildNotice(summary));
    const winner: WarSide | null = s.outcome === "CAPTURED" ? "ATK" : s.outcome === "HELD" ? "DEF" : null;
    const sideOf = new Map(s.contributors.map((c) => [c.userId, c.side]));
    await notifyMany(client, "turf", [...sideOf.keys()], (id) => turfWarResultNotice({
      racketName: s.racketName, side: sideOf.get(id)!, won: sideOf.get(id) === winner, summary,
    }));
  });
}

/** A bid: the owning family's Boss and Underboss hear of it; the outbid family's officers hear they were outbid. */
export async function announceBid(client: Client, r: BidResult): Promise<void> {
  return safely("announceBid", async () => {
    if (r.ownerFamilyId !== "") {
      await notifyMany(client, "turf", await officersOf(r.ownerFamilyId), () => turfBidPlacedNotice({
        racketName: r.racketName, bidderLabel: r.familyLabel, amount: r.amount, startsAt: r.startsAt,
      }));
    }
    if (r.previous) {
      const previous = r.previous;
      await notifyMany(client, "turf", await officersOf(previous.familyId), () => turfOutbidNotice({
        racketName: r.racketName, amount: r.amount, refunded: previous.amount, bidClosesAt: r.bidClosesAt,
      }));
    }
  });
}

/** The war-soon warning to every member of both families who may fight, linking their home channel (T9). */
export async function announceWarSoon(client: Client, warId: string, now: Date): Promise<void> {
  return safely("announceWarSoon", async () => {
    const war = await prisma.war.findUnique({ where: { id: warId } });
    if (!war) return;
    const racketName = racketDef(war.racketKey)?.name ?? war.racketKey;
    const sides = familySides(war);
    const homes = await homesOf(sides.map(([, id]) => id));
    for (const [side, familyId] of sides) {
      const members = await listMembers(familyId);
      const checks = await Promise.all(members.map((m) => checkMemberEligibility(m.userId, "war", { now })));
      const home = homes.get(familyId);
      const channelUrl = home ? channelLink(home.guildId, home.channelId) : "";
      await notifyMany(client, "turf", members.filter((_, i) => checks[i].ok).map((m) => m.userId),
        () => turfWarSoonNotice({ racketName, side, startsAt: war.startsAt, channelUrl }));
    }
  });
}

/** A neglect strike tells the ineligible members and the officers; a release tells every member. One DM per user. */
export async function announceRacketCollect(
  client: Client, out: RacketCollect, members: { all: string[]; ineligible: string[]; officers: string[] },
): Promise<void> {
  return safely("announceRacketCollect", async () => {
    if (out.status === "neglected") {
      const ids = [...new Set([...members.ineligible, ...members.officers])];
      await notifyMany(client, "turf", ids, () => turfNeglectNotice({
        racketName: out.racketName, strikes: out.strikes, max: CRIME_FAMILY_CONFIG.neglectStrikesToRelease,
      }));
    } else if (out.status === "released") {
      await notifyMany(client, "turf", members.all, () => turfReleasedNotice({ racketName: out.racketName }));
    }
  });
}
