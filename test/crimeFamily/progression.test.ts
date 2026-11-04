import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { levelUp, awardFamilyXp } from "../../src/services/crimeFamily/progression";
import { getLeaderboard } from "../../src/services/crimeFamily/leaderboard";
import { runFamilyTx } from "../../src/services/crimeFamily/tx";
import { FAMILY_HOOKS } from "../../src/services/crimeFamily/extensions";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
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

describe("XP and leaderboard (10.2, 10.4)", () => {
  it("awardFamilyXp increments XP and writes an xp ledger row", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), xp: 100, treasury: 7, earnings: 9 });
    await runFamilyTx((tx) => awardFamilyXp(tx, f.id, 150, "caper_t1_clean", "u1", { caperId: "c" }));
    expect((await fam(f.id))!.xp).toBe(250);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "xp" } }))
      .toMatchObject({ actorId: "u1", amount: 0, treasuryAfter: 7, earningsAfter: 9, meta: { xp: 150, source: "caper_t1_clean", caperId: "c" } });
  });

  it("ranks the top 10 by XP and gives the viewer's rank outside it", async () => {
    const fams = [];
    for (let x = 1; x <= 12; x++) fams.push(await seedFamily({ bossId: await seedEligibleUser(), xp: x }));
    const v = await getLeaderboard("xp", fams[0].id);
    expect(v.rows).toHaveLength(10);
    expect(v.rows[0]).toMatchObject({ rank: 1, familyId: fams[11].id, value: 12, level: 1, members: 1, rackets: null });
    expect(v.viewer).toEqual({ rank: 12, value: 1 });
    expect(v.sorts).toEqual([{ key: "xp", label: "XP" }, { key: "war", label: "War wins" }]);
  });

  it("fills rackets from a racketsHeld hook (P23)", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), xp: 5 });
    FAMILY_HOOKS.push({ key: "t", racketsHeld: async (ids) => new Map(ids.map((id) => [id, 2])) });
    try { expect((await getLeaderboard("xp", f.id)).rows[0].rackets).toBe(2); } finally { FAMILY_HOOKS.pop(); }
  });
});
