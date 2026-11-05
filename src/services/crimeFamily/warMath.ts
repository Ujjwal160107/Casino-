// Pure war and bid math (spec 9.1, 9.4, 15): the weekly window, ISO week,
// scout slots, weak points, block results, bid floors and raises, and XP.
// Integer arithmetic for money, so every figure matches the spec tables.
import { createHmac } from "crypto";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { RACKET_CLASSES, WAR_BLOCKS, WAR_RULES, type RacketDef } from "../../data/crimeFamilyCatalog";

export type WarBlockKey = (typeof WAR_BLOCKS)[number]["key"];
export type RacketClass = RacketDef["class"];
export type WarSide = "ATK" | "DEF";
export type ScoreField = "atkDocks" | "atkMain" | "atkAlleys" | "defDocks" | "defMain" | "defAlleys";
export type BlockScores = Record<WarBlockKey, { atk: number; def: number }>;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const FIELD_SUFFIX: Record<WarBlockKey, "Docks" | "Main" | "Alleys"> = { docks: "Docks", main: "Main", alleys: "Alleys" };

/** The racket's next weekly war start, strictly after `now`. */
export function nextWarStart(r: Pick<RacketDef, "warDow" | "warHourUtc">, now: Date): Date {
  const diff = (r.warDow - now.getUTCDay() + 7) % 7;
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff, r.warHourUtc);
  return new Date(t <= now.getTime() ? t + WEEK_MS : t);
}

/** ISO-8601 week key, e.g. "2026-W45": the ISO year is that of the week's Thursday. */
export function isoWeekKey(d: Date): string {
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK_MS);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The bid window and war length around one war start (9.4). */
export function warWindow(startsAt: Date): { periodKey: string; bidOpensAt: Date; bidClosesAt: Date; startsAt: Date; endsAt: Date } {
  const s = startsAt.getTime();
  const c = CRIME_FAMILY_CONFIG;
  return {
    periodKey: isoWeekKey(startsAt),
    bidOpensAt: new Date(s - c.bidOpensBeforeSeconds * 1000),
    bidClosesAt: new Date(s - c.bidClosesBeforeSeconds * 1000),
    startsAt: new Date(s),
    endsAt: new Date(s + c.warMinutes * 60_000),
  };
}

export type BidPhase = "UPCOMING" | "OPEN" | "CLOSED";

/**
 * Where `now` sits in the bid window of the war at `startsAt` (from
 * nextWarStart, so the war is still ahead), and when the next window opens:
 * this one while it is upcoming or open, next week's once it has closed.
 */
export function bidPhase(startsAt: Date, now: Date): { phase: BidPhase; nextOpensAt: Date } {
  const w = warWindow(startsAt);
  if (now < w.bidOpensAt) return { phase: "UPCOMING", nextOpensAt: w.bidOpensAt };
  if (now < w.bidClosesAt) return { phase: "OPEN", nextOpensAt: w.bidOpensAt };
  return { phase: "CLOSED", nextOpensAt: warWindow(new Date(startsAt.getTime() + WEEK_MS)).bidOpensAt };
}

/** The scout slot at `now`, clamped to 0..slots-1. */
export function slotOf(startsAt: Date, now: Date): number {
  const raw = Math.floor((now.getTime() - startsAt.getTime()) / (CRIME_FAMILY_CONFIG.scoutSlotSeconds * 1000));
  return Math.min(WAR_RULES.slots - 1, Math.max(0, raw));
}

export function slotEndsAt(startsAt: Date, slot: number): Date {
  return new Date(startsAt.getTime() + (slot + 1) * CRIME_FAMILY_CONFIG.scoutSlotSeconds * 1000);
}

/** HMAC_SHA256(seed, block:slot)[0] mod 4: an index into the block's 4 approaches. */
export function weakPoint(seed: string, block: WarBlockKey, slot: number): number {
  return createHmac("sha256", seed).update(`${block}:${slot}`).digest()[0] % 4;
}

/** The last `blackoutSeconds` of a war hide the block scores. */
export function isBlackout(endsAt: Date, now: Date): boolean {
  return now.getTime() >= endsAt.getTime() - CRIME_FAMILY_CONFIG.blackoutSeconds * 1000;
}

export function scoreField(side: WarSide, block: WarBlockKey): ScoreField {
  return `${side === "ATK" ? "atk" : "def"}${FIELD_SUFFIX[block]}` as ScoreField;
}

export function scoresOf(war: Record<ScoreField, number>): BlockScores {
  return Object.fromEntries(
    WAR_BLOCKS.map((b) => [b.key, { atk: war[scoreField("ATK", b.key)], def: war[scoreField("DEF", b.key)] }]),
  ) as BlockScores;
}

/** D52: the defender, family or Street, starts every block at the class baseline. */
export function baselineScores(cls: RacketClass): Record<"defDocks" | "defMain" | "defAlleys", number> {
  const b = RACKET_CLASSES[cls].baseline;
  return { defDocks: b, defMain: b, defAlleys: b };
}

/** Each block goes to the higher score; ties go to the defender. */
export function blockResults(s: BlockScores): { block: WarBlockKey; atk: number; def: number; winner: WarSide }[] {
  return WAR_BLOCKS.map((b) => {
    const { atk, def } = s[b.key];
    return { block: b.key, atk, def, winner: atk > def ? "ATK" : "DEF" };
  });
}

/** The attacker wins with at least 2 of 3 blocks. */
export function attackerWins(s: BlockScores): boolean {
  return blockResults(s).filter((b) => b.winner === "ATK").length >= 2;
}

/** D64: a defence earns XP only when the attacker scored on at least 2 blocks. */
export function defenceEarnsXp(s: BlockScores): boolean {
  return WAR_BLOCKS.filter((b) => s[b.key].atk > 0).length >= 2;
}

export function bidFloor(r: Pick<RacketDef, "incomePerCycle">): number {
  return CRIME_FAMILY_CONFIG.bidFloorDays * r.incomePerCycle;
}

/** The first bid meets the floor; a raise is max(ceil(top × 1.10), top + 100,000), in integers. */
export function minNextBid(top: number, floor: number): number {
  if (top === 0) return floor;
  const { bidRaisePct, bidMinRaise } = CRIME_FAMILY_CONFIG;
  return Math.max(Math.ceil((top * (100 + bidRaisePct)) / 100), top + bidMinRaise);
}

export function captureXp(cls: RacketClass): number {
  return Math.round(WAR_RULES.captureXp * RACKET_CLASSES[cls].xpMultiplier);
}
