// Rackets (spec 9.1–9.3, 15): seed the fixed list, resolve racket keys, count
// racket-eligible members and collect one racket's due cycles into earnings
// (or strike it for neglect and release it to the Street).
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { RACKETS, RACKET_CLASSES, WAR_RULES, racketDef, type RacketDef } from "../../data/crimeFamilyCatalog";
import { rentCyclesDue } from "../propertyService";
import { checkMemberEligibility } from "./eligibility";
import { listMembers } from "./familyQueries";
import { writeLedger } from "./ledger";
import { creditEarnings } from "./vaultService";
import { isUniqueViolation, runFamilyTx } from "./tx";

function upsertRacket(r: RacketDef) {
  const def = { name: r.name, class: r.class, incomePerCycle: r.incomePerCycle, baseDefense: RACKET_CLASSES[r.class].baseline, warDow: r.warDow, warHourUtc: r.warHourUtc };
  return prisma.racket.upsert({ where: { key: r.key }, create: { key: r.key, ...def }, update: def });
}

/**
 * T15: runs at every boot. Upserts the definition of each racket by key and
 * never touches ownership, timers or strikes (edge 61). No transaction is
 * open, so a P2002 from a concurrent first create is caught and retried once.
 */
export async function seedRackets(): Promise<void> {
  for (const r of RACKETS) {
    try {
      await upsertRacket(r);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await upsertRacket(r);
    }
  }
}

/** T11: a key, case-insensitive, or the map number 1–10 in `RACKETS` order. */
export function resolveRacketKey(raw: string | undefined): RacketDef | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return RACKETS[Number(s) - 1] ?? null;
  return racketDef(s.toLowerCase()) ?? null;
}

const OFFICERS = new Set(["BOSS", "UNDERBOSS"]);

/** The family's members split by the racket gate (9.3), plus the Boss and Underboss (who hear about neglect). */
export async function racketEligibleMembers(
  familyId: string, now: Date,
): Promise<{ all: string[]; eligible: string[]; ineligible: string[]; officers: string[] }> {
  const members = await listMembers(familyId);
  const results = await Promise.all(members.map((m) => checkMemberEligibility(m.userId, "racket", { now })));
  const all = members.map((m) => m.userId);
  return {
    all,
    eligible: all.filter((_, i) => results[i].ok),
    ineligible: all.filter((_, i) => !results[i].ok),
    officers: members.filter((m) => OFFICERS.has(m.role)).map((m) => m.userId),
  };
}

export type RacketCollect = {
  status: "minted" | "neglected" | "released" | "skipped";
  racketKey: string; racketName: string; familyId: string; cycles: number; strikes: number; amount: number;
};

/**
 * Spec 9.3: pays the racket's due cycles (at most 3 banked, the partial cycle
 * kept) into its owner's earnings when ≥ racketEligibleMin members are
 * eligible; otherwise each due cycle is a neglect strike, and the strike that
 * reaches neglectStrikesToRelease hands the racket to the Street (D24). The
 * CAS on owner and lastPayoutAt makes a second tick, or a tick racing a
 * capture, a no-op (edge 44).
 */
export async function collectRacket(racketId: string, now: Date, eligibleCount: number): Promise<RacketCollect> {
  const r = await prisma.racket.findUnique({ where: { id: racketId } });
  if (!r) throw new Error(`Racket ${racketId} not found`);
  const { cycles, nextCollected } = rentCyclesDue(r.lastPayoutAt, now, CRIME_FAMILY_CONFIG.racketCycleHours);
  const base = { racketKey: r.key, racketName: r.name, familyId: r.ownerFamilyId, cycles };
  const skipped: RacketCollect = { ...base, status: "skipped", strikes: r.neglectStrikes, amount: 0 };
  if (!r.ownerFamilyId || cycles === 0) return skipped;

  const minted = eligibleCount >= CRIME_FAMILY_CONFIG.racketEligibleMin;
  const strikes = minted ? 0 : r.neglectStrikes + cycles;
  const released = !minted && strikes >= CRIME_FAMILY_CONFIG.neglectStrikesToRelease;
  const amount = minted ? cycles * r.incomePerCycle : 0;

  return runFamilyTx(async (tx) => {
    const { count } = await tx.racket.updateMany({
      where: { id: r.id, ownerFamilyId: r.ownerFamilyId, lastPayoutAt: r.lastPayoutAt },
      data: released ? { lastPayoutAt: nextCollected, ownerFamilyId: "", neglectStrikes: 0 } : { lastPayoutAt: nextCollected, neglectStrikes: strikes },
    });
    if (count !== 1) return skipped;
    if (minted) {
      await creditEarnings(tx, r.ownerFamilyId, amount, "racket_income", "system", { racketKey: r.key, cycles }, { xp: WAR_RULES.racketCycleXp * cycles });
      return { ...base, status: "minted" as const, strikes, amount };
    }
    const fam = await tx.family.findUniqueOrThrow({ where: { id: r.ownerFamilyId }, select: { treasury: true, earnings: true } });
    await writeLedger(tx, {
      familyId: r.ownerFamilyId, actorId: "system", type: "racket_neglect", amount: 0,
      treasuryAfter: fam.treasury, earningsAfter: fam.earnings, meta: { racketKey: r.key, cycles, strikes },
    });
    return { ...base, status: released ? "released" as const : "neglected" as const, strikes, amount };
  });
}
