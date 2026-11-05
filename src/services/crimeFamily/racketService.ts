// Rackets (spec 9.1–9.3, 15): seed the fixed list and resolve racket keys.
import prisma from "../../utils/prisma";
import { RACKETS, RACKET_CLASSES, racketDef, type RacketDef } from "../../data/crimeFamilyCatalog";
import { isUniqueViolation } from "./tx";

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
