// Beta QA helpers for the turf area (leagues, cities, bids, wars, rackets).
// Only test code: seeds families quickly and checks the turf invariants.
import { levelDef, leagueOf, RACKETS } from "../../../src/data/crimeFamilyCatalog";
import { testPrisma, seedEligibleUser, seedFamily, daysAgo, seedWarHits, type SeedEligibleOpts } from "../../helpers";

export const ON = { enabled: true, turfEnabled: true };
export const M = 60_000;
export const H = 3_600_000;
export const DAY = 86_400_000;

let bareSeq = 0;
/** A non-snowflake user id that no gate will ever pass (bare census families only). */
const bareId = () => `bare-${process.pid}-${++bareSeq}`;

export type Crew = { f: Awaited<ReturnType<typeof seedFamily>>; ids: string[]; boss: string; ub: string; soldiers: string[] };

/**
 * A family of real, gate-passing users: Boss, Underboss and `size - 2` Soldiers,
 * all joined 10 days ago (past the 72 h tenure). `activeAt` seeds 3 correct war
 * hits per member for this family (census-active and racket-eligible).
 */
export async function crew(o: {
  level?: number; earnings?: number; treasury?: number; cityId?: string; tag?: string; name?: string; wallet?: number;
  channel?: string; guild?: string; size?: number; activeAt?: Date; user?: SeedEligibleOpts;
} = {}): Promise<Crew> {
  const size = o.size ?? 3;
  const ids: string[] = [];
  for (let i = 0; i < size; i++) ids.push(await seedEligibleUser({ wallet: o.wallet ?? 1_000_000, ...o.user }));
  const [boss, ub, ...soldiers] = ids;
  const f = await seedFamily({
    bossId: boss, level: o.level ?? 7, earnings: o.earnings ?? 0, treasury: o.treasury ?? 0, tag: o.tag, name: o.name,
    homeGuildId: o.guild ?? "g1", homeChannelId: o.channel ?? `ch-${boss.slice(-6)}`,
    data: o.cityId !== undefined ? { cityId: o.cityId } : {},
    members: [
      { userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) },
      ...soldiers.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
    ],
  });
  if (o.activeAt) for (const id of ids) await seedWarHits(id, f.id, 3, { createdAt: o.activeAt });
  return { f, ids, boss, ub, soldiers };
}

/**
 * n bare families (3 member rows, no User rows) whose members each have 3
 * correct war hits at `activeAt`, so the census counts them active. Fast:
 * used to grow a league past 40 families.
 */
export async function bareFamilies(n: number, o: { level: number; activeAt: Date; cityId?: string }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ids = [bareId(), bareId(), bareId()];
    const f = await seedFamily({
      bossId: ids[0], level: o.level,
      data: o.cityId !== undefined ? { cityId: o.cityId } : {},
      members: ids.slice(1).map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
    });
    await testPrisma.warHit.createMany({
      data: ids.flatMap((userId) => Array.from({ length: 3 }, () => ({
        warId: "65f0000000000000000000aa", familyId: f.id, userId, side: "ATK", block: "docks", slot: 0,
        deadline: o.activeAt, state: "HIT", createdAt: o.activeAt,
      }))),
    });
    out.push({ f, ids });
  }
  return out;
}

/** Placed active family counts per OPEN city of a league, lowest number first. */
export async function citySizes(league: string): Promise<number[]> {
  const open = await testPrisma.turfCity.findMany({ where: { league, status: "OPEN" }, orderBy: { number: "asc" } });
  return Promise.all(open.map((c) => testPrisma.family.count({ where: { cityId: c.id, activeMembers: { gte: 3 } } })));
}

/** Starting vault of each family (earnings + treasury), for the ledger reconciliation. */
export async function vaultBaseline(): Promise<Map<string, number>> {
  const fams = await testPrisma.family.findMany({ select: { id: true, earnings: true, treasury: true } });
  const ledger = await testPrisma.familyLedger.findMany({ select: { familyId: true, amount: true } });
  const sum = new Map<string, number>();
  for (const l of ledger) sum.set(l.familyId, (sum.get(l.familyId) ?? 0) + l.amount);
  // baseline = what the vault would hold with no ledger rows at all
  return new Map(fams.map((f) => [f.id, f.earnings + f.treasury - (sum.get(f.id) ?? 0)]));
}

const LIVE = ["ARMED", "ACTIVE", "SETTLING"];

/**
 * Every turf invariant this beta checks after a scenario; returns the
 * violations (empty = healthy). `baseline` (from vaultBaseline before the
 * scenario) adds the per-family ledger reconciliation.
 */
export async function turfInvariants(baseline?: Map<string, number>): Promise<string[]> {
  const bad: string[] = [];
  const families = await testPrisma.family.findMany();
  const famById = new Map(families.map((f) => [f.id, f]));
  const cities = await testPrisma.turfCity.findMany();
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const rackets = await testPrisma.racket.findMany();
  const wars = await testPrisma.war.findMany();
  const ledger = await testPrisma.familyLedger.findMany();
  const members = await testPrisma.familyMember.findMany({ select: { familyId: true, userId: true } });

  for (const f of families) {
    if (f.earnings < 0 || f.treasury < 0) bad.push(`family ${f.tag} negative vault ${f.earnings}/${f.treasury}`);
    const n = members.filter((m) => m.familyId === f.id).length;
    if (n !== f.memberCount) bad.push(`family ${f.tag} memberCount ${f.memberCount} != ${n}`);
    const held = rackets.filter((r) => r.ownerFamilyId === f.id);
    const cap = levelDef(f.level).racketCap;
    const live = wars.filter((w) => (w.status === "BIDDING" && w.topBidderFamilyId === f.id) || (LIVE.includes(w.status) && w.attackerFamilyId === f.id));
    // a war being settled may already have moved its racket: count each racket once
    const liveRackets = new Set([...held.map((r) => r.id), ...live.map((w) => w.racketId)]);
    if (liveRackets.size > cap) bad.push(`family ${f.tag} holds/bids ${liveRackets.size} rackets over cap ${cap}`);
    const crowns = new Set([...held.filter((r) => r.class === "CROWN").map((r) => r.id),
      ...live.filter((w) => RACKETS.find((d) => d.key === w.racketKey)?.class === "CROWN").map((w) => w.racketId)]);
    if (crowns.size > 1) bad.push(`family ${f.tag} has ${crowns.size} crowns held or bid`);
    if (f.cityId !== "") {
      const c = cityById.get(f.cityId);
      if (!c) bad.push(`family ${f.tag} placed in missing city`);
      else {
        if (c.status !== "OPEN") bad.push(`family ${f.tag} placed in CLOSED ${c.league} #${c.number}`);
        if (c.league !== leagueOf(f.level).key) bad.push(`family ${f.tag} L${f.level} placed in ${c.league} #${c.number}`);
      }
    }
    for (const r of held) {
      const c = cityById.get(r.cityId);
      if (c && c.league !== leagueOf(f.level).key) bad.push(`family ${f.tag} L${f.level} owns ${r.key} in ${c.league}`);
    }
  }
  for (const r of rackets) {
    if (r.ownerFamilyId && !famById.has(r.ownerFamilyId)) bad.push(`racket ${r.key} owned by a deleted family`);
    if (r.ownerFamilyId && cityById.get(r.cityId)?.status === "CLOSED") bad.push(`racket ${r.key} owned in a CLOSED city`);
  }
  for (const w of wars) {
    const r = rackets.find((x) => x.id === w.racketId);
    if (r && r.cityId !== w.cityId) bad.push(`war ${w.racketKey} cityId differs from its racket`);
    if ((w.topBid === 0) !== (w.topBidderFamilyId === "") && w.status === "BIDDING") bad.push(`war ${w.racketKey} topBid/topBidder mismatch`);
    if (w.status === "BIDDING" && w.topBidderFamilyId && !famById.has(w.topBidderFamilyId)) bad.push(`war ${w.racketKey} top bidder deleted`);
    if (LIVE.includes(w.status) && !famById.has(w.attackerFamilyId)) bad.push(`war ${w.racketKey} attacker deleted`);
    if ((w.status === "BIDDING" && w.topBid > 0 || LIVE.includes(w.status)) && cityById.get(w.cityId)?.status === "CLOSED") {
      bad.push(`war ${w.racketKey} live in a CLOSED city`);
    }
    // escrow per war: what was taken minus what was refunded
    const rows = ledger.filter((l) => (l.meta as any)?.warId === w.id && (l.type === "bid_escrow" || l.type === "bid_refund"));
    const held = -rows.reduce((s, l) => s + l.amount, 0);
    const expected = w.status === "CANCELLED" ? 0 : w.topBid;
    // a disbanded family's ledger rows are gone with it only if the product deletes ledgers; tolerate rows of deleted families
    const ownRowsComplete = rows.every((l) => famById.has(l.familyId));
    if (rows.length > 0 && ownRowsComplete && held !== expected)   // seeded wars carry no escrow rows
      bad.push(`war ${w.racketKey} (${w.status}) escrow ledger ${held} != ${expected}`);
  }
  if (baseline) {
    for (const f of families) {
      const base = baseline.get(f.id);
      if (base === undefined) continue;
      const sum = ledger.filter((l) => l.familyId === f.id).reduce((s, l) => s + l.amount, 0);
      if (Math.abs(base + sum - (f.earnings + f.treasury)) > 0.5) bad.push(`family ${f.tag} ledger ${base + sum} != vault ${f.earnings + f.treasury}`);
    }
  }
  const wallets = await testPrisma.wallet.findMany({ where: { balance: { lt: 0 } }, select: { userId: true, balance: true } });
  for (const w of wallets) bad.push(`wallet ${w.userId} negative ${w.balance}`);
  return bad;
}

/** Visible text of every reply/edit/followUp of a fake interaction. */
export function replies(i: any): string {
  return JSON.stringify([...i.reply.mock.calls, ...i.editReply.mock.calls, ...i.followUp.mock.calls]);
}
