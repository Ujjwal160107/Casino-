import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { levelUp, levelUpPreview, awardFamilyXp } from "../../src/services/crimeFamily/progression";
import { getLeaderboard } from "../../src/services/crimeFamily/leaderboard";
import { runFamilyTx } from "../../src/services/crimeFamily/tx";
import {
  testPrisma, seedEligibleUser, seedFamily, seedTurfCity, seedRacket, seedWar, resetFamilies, ensureUniqueIndexes, withCfConfig,
} from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War"]));
beforeEach(resetFamilies);
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });

describe("levelUp (10.1)", () => {
  it("L1 → L2 needs 1,000 XP and burns 2,000,000 earnings-first; XP is kept", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, xp: 1_200, earnings: 1_500_000, treasury: 1_000_000 });
    expect(await levelUp(f.id, boss, 1)).toMatchObject({ level: 2, fee: 2_000_000, fromEarnings: 1_500_000, fromTreasury: 500_000 });
    expect(await fam(f.id)).toMatchObject({ level: 2, xp: 1_200, earnings: 0, treasury: 500_000 });
  });

  it.each([
    ["xp short", { xp: 999 }, "Needs 1,000 XP (have 999)."],
    ["arrears", { xp: 2_000, duesArrears: 1 }, "Clear dues arrears first."],
    ["max", { level: 10, xp: 99_999 }, "Max level."],
  ] as const)("refuses %s", async (_n, seed, msg) => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 100_000_000, ...seed });
    await expect(levelUp(f.id, boss, f.level)).rejects.toThrow(msg);
    expect(await fam(f.id)).toMatchObject({ level: f.level, earnings: 100_000_000 });
  });

  it("refuses a Soldier and a stale expectedLevel, and pays once on a double press", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, xp: 5_000, earnings: 10_000_000, members: [{ userId: s, role: "SOLDIER" }] });
    await expect(levelUp(f.id, s, 1)).rejects.toThrow("Only the Boss or Underboss can level up.");
    await expect(levelUp(f.id, boss, 2)).rejects.toThrow("Level changed.");
    const rs = await Promise.allSettled([levelUp(f.id, boss, 1), levelUp(f.id, boss, 1)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(/^(Level changed\.|Vault busy, try again\.)$/);
    expect(await fam(f.id)).toMatchObject({ level: 2, earnings: 8_000_000 });
  });
});

describe("league-changing level-up preview (6.6)", () => {
  const T0 = new Date("2026-11-10T00:10:00Z");
  const FINISH = "Finish your turf first: a family can't move up to the Silver league while it holds a top bid or fights in a turf war.";
  /** An L3 family ready for L4 holding Pawn Row Fencing in Low Town #1. */
  async function bronze() {
    const boss = await seedEligibleUser();
    const low = await seedTurfCity({ league: "BRONZE", number: 1 });
    const f = await seedFamily({ bossId: boss, level: 3, xp: 6_000, earnings: 10_000_000, data: { cityId: low.id } });
    await seedRacket("pawn_row", { cityId: low.id, ownerFamilyId: f.id });
    return { f, boss, low };
  }

  it("warns an L3 family that the move releases its rackets and waits for the census; a top bid adds the H17 blocker", async () => {
    const { f, low } = await bronze();
    const p = await levelUpPreview(f, T0);
    expect(p.next?.level).toBe(4);
    expect(p.blockers).toEqual([]);
    expect(p.notes).toHaveLength(2);
    expect(p.notes[0]).toBe("Moving up to the Silver league releases Pawn Row Fencing to the Street.");
    expect(p.notes[1]).toMatch(/^Your family gets a Silver city at the next census \(<t:\d+:R>\)\.$/);
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: low.id, topBid: 700_000, topBidderFamilyId: f.id });
    expect((await levelUpPreview(f, T0)).blockers.at(-1)).toBe(FINISH);
  });

  it("shows no notes inside a league and runs no hook at the max level", async () => {
    const l1 = await seedFamily({ bossId: await seedEligibleUser(), xp: 1_000 });
    expect((await levelUpPreview(l1, T0)).notes).toEqual([]);
    const l10 = await seedFamily({ bossId: await seedEligibleUser(), level: 10, xp: 99_999 });
    expect(await levelUpPreview(l10, T0)).toEqual({ next: null, blockers: ["Max level."], notes: [] });
  });

  it("a stale S8 (L3 confirm on a family already at L4) answers Level changed. without running the Bronze → Silver hook", async () => {
    const { f, boss, low } = await bronze();
    await testPrisma.family.update({ where: { id: f.id }, data: { level: 4, xp: 12_000 } });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: low.id, topBid: 700_000, topBidderFamilyId: f.id });
    const before = await testPrisma.familyLedger.count({ where: { familyId: f.id } });
    await expect(levelUp(f.id, boss, 3, T0)).rejects.toThrow("Level changed.");
    expect(await fam(f.id)).toMatchObject({ level: 4, earnings: 10_000_000, cityId: low.id });
    expect(await testPrisma.familyLedger.count({ where: { familyId: f.id } })).toBe(before);
  });
});

describe("XP and leaderboard (10.2, 10.4)", () => {
  it("awardFamilyXp increments XP and writes an xp ledger row", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), xp: 100, treasury: 7, earnings: 9 });
    await runFamilyTx((tx) => awardFamilyXp(tx, f.id, 150, "caper_t1_clean", "u1", { caperId: "c" }));
    expect((await fam(f.id))!.xp).toBe(250);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "xp" } }))
      .toMatchObject({ actorId: "u1", amount: 0, treasuryAfter: 7, earningsAfter: 9, meta: { xp: 150, source: "caper_t1_clean", caperId: "c" } });
  });

  it("ranks the top 10 by XP and gives the viewer's rank outside it (turf on: racket counts and the Rackets tab)", async () => {
    const fams = [];
    for (let x = 1; x <= 12; x++) fams.push(await seedFamily({ bossId: await seedEligibleUser(), xp: x }));
    const v = await withCfConfig({ turfEnabled: true }, () => getLeaderboard("xp", fams[0].id));
    expect(v.rows).toHaveLength(10);
    expect(v.rows[0]).toMatchObject({ rank: 1, familyId: fams[11].id, value: 12, level: 1, members: 1, rackets: 0 });
    expect(v.viewer).toEqual({ rank: 12, value: 1 });
    expect(v.sorts).toEqual([{ key: "xp", label: "XP" }, { key: "rk", label: "Rackets" }, { key: "war", label: "War wins" }]);
  });
});
