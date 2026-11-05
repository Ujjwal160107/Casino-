// Read seams for turf: the S16 map, S17 racket detail, the S18/S21 board and
// a family's live war. No writes.
import type { War } from "@prisma/client";
import prisma from "../../utils/prisma";
import { RACKETS, RACKET_CLASSES, racketDef } from "../../data/crimeFamilyCatalog";
import { bidBlockers, loadBidContext } from "./bidService";
import { familyLabel } from "./familyQueries";
import { can } from "./permissions";
import { FamilyError } from "./tx";
import { bidFloor, isBlackout, minNextBid, nextWarStart, scoresOf, type WarSide } from "./warMath";
import type { WarStatus } from "./warService";
import type { RacketDetailView, TurfMapView, TurfRacketLine, WarBoardView } from "./views";

const STREET = "the Street";
const LIVE_STATUSES: WarStatus[] = ["BIDDING", "ARMED", "ACTIVE"];
const TOP_HITTERS = 5;

/** "[TAG] Name" per family id; ids with no row are left out. */
async function labelsOf(ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const families = await prisma.family.findMany({ where: { id: { in: wanted } }, select: { id: true, tag: true, name: true } });
  return new Map(families.map((f) => [f.id, familyLabel(f)]));
}

/**
 * The lines of the given rackets (all by default) in `RACKETS` order, in 3
 * queries. A racket with no row yet renders as the Street, so the map works
 * before the first boot seed.
 */
async function racketLines(now: Date, keys?: string[]): Promise<TurfRacketLine[]> {
  const defs = keys ? RACKETS.filter((r) => keys.includes(r.key)) : RACKETS;
  const racketKeys = defs.map((r) => r.key);
  const rows = await prisma.racket.findMany({ where: { key: { in: racketKeys } }, select: { key: true, ownerFamilyId: true, neglectStrikes: true } });
  const wars = await prisma.war.findMany({
    where: { racketKey: { in: racketKeys }, status: { in: LIVE_STATUSES } },
    orderBy: { startsAt: "desc" },
  });
  const latest = new Map<string, War>();
  for (const w of wars) if (!latest.has(w.racketKey)) latest.set(w.racketKey, w);
  const labels = await labelsOf([...rows.map((r) => r.ownerFamilyId), ...wars.map((w) => w.topBidderFamilyId)]);

  return defs.map((def) => {
    const row = rows.find((r) => r.key === def.key);
    const owner = row?.ownerFamilyId ?? "";
    const war = latest.get(def.key);
    return {
      key: def.key, name: def.name, class: def.class, income: def.incomePerCycle,
      ownerFamilyId: owner, ownerLabel: (owner && labels.get(owner)) || STREET, strikes: row?.neglectStrikes ?? 0,
      war: war
        ? {
          id: war.id, status: war.status as WarStatus, topBid: war.topBid,
          topBidderLabel: war.topBidderFamilyId ? labels.get(war.topBidderFamilyId) ?? null : null,
          bidClosesAt: war.bidClosesAt, startsAt: war.startsAt,
        }
        : null,
      nextWarAt: nextWarStart(def, now),
    };
  });
}

export async function getTurfMapView(now: Date): Promise<TurfMapView> {
  const rackets = await racketLines(now);
  const soonest = rackets.reduce((a, b) => (b.nextWarAt < a.nextWarAt ? b : a));
  return { rackets, nextWar: { racketName: soonest.name, startsAt: soonest.nextWarAt } };
}

/** S17: the bid figures and the viewer's blockers, from the same context placeBid checks (read-only). */
export async function getRacketDetailView(racketKey: string, viewerId: string, now: Date): Promise<RacketDetailView> {
  const def = racketDef(racketKey);
  if (!def) throw new FamilyError("Unknown racket.");
  const member = await prisma.familyMember.findUnique({ where: { userId: viewerId }, select: { familyId: true } });
  const ctx = await loadBidContext(prisma, member?.familyId ?? null, viewerId, racketKey, now);
  const [line] = await racketLines(now, [racketKey]);
  const blockers = bidBlockers(ctx);
  const floor = bidFloor(def);
  return {
    line, floor, minBid: minNextBid(ctx.war?.topBid ?? 0, floor), minFamilyLevel: RACKET_CLASSES[def.class].minFamilyLevel,
    viewerIsOfficer: ctx.member ? can(ctx.member, "bid", now) : false, canBid: blockers.length === 0, blockers,
  };
}

export async function getWarBoardView(warId: string, now: Date): Promise<WarBoardView> {
  const war = await prisma.war.findUnique({ where: { id: warId } });
  const def = war && racketDef(war.racketKey);
  if (!war || !def) throw new FamilyError("This war is over.");
  const contributions = await prisma.warContribution.findMany({ where: { warId }, select: { userId: true, side: true, hits: true, points: true } });
  const labels = await labelsOf([war.attackerFamilyId, war.defenderFamilyId]);
  const side = (familyId: string) => ({ familyId, label: (familyId && labels.get(familyId)) || STREET });
  const ofSide = (s: WarSide) => contributions.filter((c) => c.side === s);
  const top = (s: WarSide) => ofSide(s)
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, TOP_HITTERS)
    .map((c) => ({ userId: c.userId, points: c.points }));
  const hits = (s: WarSide) => ofSide(s).reduce((sum, c) => sum + c.hits, 0);
  return {
    warId: war.id, racketKey: war.racketKey, racketName: def.name, racketClass: def.class, startsAt: war.startsAt, endsAt: war.endsAt,
    attacker: side(war.attackerFamilyId), defender: side(war.defenderFamilyId), scores: scoresOf(war),
    hits: { atk: hits("ATK"), def: hits("DEF") }, top: { atk: top("ATK"), def: top("DEF") }, blackout: isBlackout(war.endsAt, now),
  };
}

/** The family's ARMED or ACTIVE war, attacking or defending (wars never overlap: each racket has its own window). */
export function getLiveWarFor(familyId: string): Promise<War | null> {
  return prisma.war.findFirst({
    where: { status: { in: ["ARMED", "ACTIVE"] }, OR: [{ attackerFamilyId: familyId }, { defenderFamilyId: familyId }] },
  });
}
