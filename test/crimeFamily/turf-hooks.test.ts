import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { isActiveMember } from "../../src/services/crimeFamily/eligibility";
import { leaveFamily, kickMember } from "../../src/services/crimeFamily/membershipService";
import { disbandFamily, previewDisband } from "../../src/services/crimeFamily/disbandService";
import { getLeaderboard } from "../../src/services/crimeFamily/leaderboard";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution, seedWarHits } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });

describe("turf entries in plan 1's registries", () => {
  it("3 correct hits in 7 days make an active member; misses and old hits do not (7.3, D56)", async () => {
    const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: a, role: "SOLDIER", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedWarHits(a, f.id, 3);
    await seedWarHits(b, f.id, 2); await seedWarHits(b, f.id, 1, { state: "MISS" }); await seedWarHits(b, f.id, 3, { createdAt: daysAgo(8) });
    expect((await isActiveMember(a, new Date())).active).toBe(true);
    expect((await isActiveMember(b, new Date())).active).toBe(false);
  });

  it("leave is refused with a contribution in an ACTIVE war, allowed once it resolves (edge 32)", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    const war = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: f.id });
    await seedContribution({ warId: war.id, familyId: f.id, userId: s, side: "ATK" });
    await expect(leaveFamily(s)).rejects.toThrow("Members who fought in a live turf war stay until it resolves.");
    await testPrisma.war.update({ where: { id: war.id }, data: { status: "RESOLVED" } });
    await expect(leaveFamily(s)).resolves.toBeTruthy();
  });

  it("no kicks during an ACTIVE war, even of a member who never fought (edge 31)", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedWar({ racketKey: "pawn_row", status: "ACTIVE", defenderFamilyId: f.id, topBidderFamilyId: "65f000000000000000000009", topBid: 2_100_000 });
    await expect(kickMember(boss, s)).rejects.toThrow("No kicks during an active turf war.");
  });

  it("disband is refused while a war is ARMED (edge 17)", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "ARM" });
    await seedWar({ racketKey: "valet_racket", status: "ARMED", topBid: 2_100_000, topBidderFamilyId: f.id });
    await expect(disbandFamily(boss, "ARM")).rejects.toThrow("Your family is in a turf war; disband after it resolves.");
  });

  it("disband as top bidder returns the escrow, burns it with the vault and frees owned rackets (6.4, edge 18)", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "TOP", treasury: 1_000, earnings: 0, lastPaydayAt: daysAgo(1) });
    const war = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", topBid: 2_100_000, topBidderFamilyId: f.id });
    await seedRacket("pawn_row", { ownerFamilyId: f.id, neglectStrikes: 2 });
    expect((await previewDisband(f.id)).burnEarnings).toBe(2_100_000);
    await disbandFamily(boss, "TOP");
    expect(await testPrisma.war.findUnique({ where: { id: war.id } })).toMatchObject({ status: "BIDDING", topBid: 0, topBidderFamilyId: "" });
    expect(await testPrisma.racket.findUnique({ where: { key: "pawn_row" } })).toMatchObject({ ownerFamilyId: "", neglectStrikes: 0 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "bid_refund" } })).toMatchObject({ amount: 2_100_000 });
    expect((await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "disband_burn" } }))!.amount).toBe(-2_101_000);
  });

  it("racket counts feed the dashboard and the Rackets sort (10.4, P23)", async () => {
    const a = await seedFamily({ bossId: await seedEligibleUser() });
    const b = await seedFamily({ bossId: await seedEligibleUser() });
    const none = await seedFamily({ bossId: await seedEligibleUser() });
    await seedRacket("pawn_row", { ownerFamilyId: a.id }); await seedRacket("docks_numbers", { ownerFamilyId: a.id }); await seedRacket("valet_racket", { ownerFamilyId: b.id });
    const v = await getLeaderboard("rk", none.id);
    expect(v.rows.map((r) => [r.familyId, r.value, r.rackets])).toEqual([[a.id, 2, 2], [b.id, 1, 1]]);
    expect(v.viewer).toBeNull();
    expect(v.sorts.map((s) => s.key)).toEqual(["xp", "rk", "war"]);
  });

  it("the registry import cycle resolves from either entry point (T12)", async () => {
    vi.resetModules();
    const q = await import("../../src/services/crimeFamily/familyQueries");
    const ext = await import("../../src/services/crimeFamily/extensions");
    expect(ext.ACTIVITY_RULES.map((r) => r.key)).toContain("war_hits");
    expect(typeof q.getMembership).toBe("function");
    vi.resetModules();
    const ext2 = await import("../../src/services/crimeFamily/extensions");
    expect(ext2.FAMILY_HOOKS.map((h) => h.key)).toContain("turf");
    vi.resetModules();
    const lb = await import("../../src/services/crimeFamily/leaderboard");
    const ext3 = await import("../../src/services/crimeFamily/extensions");
    expect(lb.LEADERBOARD_SORTS.every(Boolean) && ext3.ACTIVITY_RULES.every(Boolean) && ext3.FAMILY_HOOKS.every(Boolean)).toBe(true);
    const src = (await import("fs")).readFileSync("src/services/crimeFamily/turfLeaderboard.ts", "utf8");
    expect(src.match(/^import (?!type ).*$/gm)!.every((l) => /utils\/prisma/.test(l))).toBe(true);   // only prisma, so turfHooks is reachable only through extensions
  });
});
