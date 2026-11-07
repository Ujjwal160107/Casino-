import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { collectRacket, racketEligibleMembers } from "../../src/services/crimeFamily/racketService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWarHits, racketByKey } from "../helpers";

const H = 3600_000;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const racket = (key: string) => racketByKey(key);
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War"]));
beforeEach(resetFamilies);

async function owner(o: { level?: number; duesArrears?: number } = {}) {
  const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, ...o, members: [{ userId: a, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, ids: [boss, a, b] };
}

describe("racket cycles (9.3)", () => {
  it("counts racket-eligible members from recent play", async () => {
    const { f, ids } = await owner();
    for (const id of ids.slice(0, 2)) await seedWarHits(id, f.id, 3);
    const m = await racketEligibleMembers(f.id, new Date());
    expect(m.eligible.sort()).toEqual(ids.slice(0, 2).sort());
    expect(m.ineligible).toEqual([ids[2]]);
    expect(m.officers.sort()).toEqual(ids.slice(0, 2).sort());
  });

  it("two ticks in one period mint once and keep the partial cycle", async () => {
    const { f } = await owner();
    const now = new Date();
    const r = await seedRacket("docks_numbers", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 25 * H) });
    const rs = await Promise.allSettled([collectRacket(r.id, now, 3), collectRacket(r.id, now, 3)]);
    expect(rs.map((x: any) => x.value?.status).filter((s) => s === "minted")).toHaveLength(1);
    expect(await fam(f.id)).toMatchObject({ earnings: 300_000, xp: 20 });
    expect((await racket("docks_numbers"))!.lastPayoutAt).toEqual(new Date(+now - H));
    expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: "racket_income" } })).toBe(1);
  });

  it("5 days of downtime bank 3 cycles", async () => {
    const { f } = await owner();
    const now = new Date();
    const r = await seedRacket("casino_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 120 * H) });
    expect(await collectRacket(r.id, now, 5)).toMatchObject({ status: "minted", cycles: 3, amount: 3_900_000 });
    expect(await fam(f.id)).toMatchObject({ earnings: 3_900_000, xp: 60 });
  });

  it("racket income retries dues arrears (7.4)", async () => {
    const { f } = await owner({ level: 1, duesArrears: 1 });
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 25 * H) });
    await collectRacket(r.id, new Date(), 3);
    expect(await fam(f.id)).toMatchObject({ earnings: 260_000, duesArrears: 0 });
  });

  it("fewer than 3 eligible: no mint, a strike, and the third strike releases (D24)", async () => {
    const { f } = await owner();
    const now = new Date();
    const r = await seedRacket("valet_racket", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 25 * H), neglectStrikes: 1 });
    expect(await collectRacket(r.id, now, 2)).toMatchObject({ status: "neglected", strikes: 2, amount: 0 });
    expect((await fam(f.id))!.earnings).toBe(0);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "racket_neglect" } })).toMatchObject({ amount: 0 });
    expect(await collectRacket(r.id, new Date(+now + 24 * H), 2)).toMatchObject({ status: "released", strikes: 3 });
    expect(await racket("valet_racket")).toMatchObject({ ownerFamilyId: "", neglectStrikes: 0 });
  });

  it("3 banked neglected cycles release at once", async () => {
    const { f } = await owner();
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 100 * H) });
    expect(await collectRacket(r.id, new Date(), 0)).toMatchObject({ status: "released", cycles: 3 });
  });

  it("a tick racing a capture mints nothing (edge 44)", async () => {
    const { f } = await owner(); const { f: attacker } = await owner();
    const now = new Date();
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 25 * H) });
    const delegate = prisma.racket as any; const original = delegate.findUnique; let first = true;
    delegate.findUnique = async (args: any) => {
      const snap = await original.call(delegate, args);
      if (first) { first = false; await testPrisma.racket.update({ where: { id: r.id }, data: { ownerFamilyId: attacker.id, lastPayoutAt: now, capturedAt: now } }); }
      return snap;
    };
    try { expect(await collectRacket(r.id, now, 3)).toMatchObject({ status: "skipped" }); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect([(await fam(f.id))!.earnings, (await fam(attacker.id))!.earnings]).toEqual([0, 0]);
  });
});
