import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { placeBid, parseBidAmount } from "../../src/services/crimeFamily/bidService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar } from "../helpers";

const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const war = (id: string) => testPrisma.war.findUnique({ where: { id } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyExit", "Racket", "War"]));
beforeEach(resetFamilies);

async function bidder(o: { level?: number; earnings?: number; treasury?: number; tag?: string } = {}) {
  const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, earnings: 0, ...o, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, boss, ub, s };
}
const bid = (actorId: string, amount: number, racketKey = "docks_numbers") => placeBid({ racketKey, actorId, amount });

describe("bidding (9.4)", () => {
  it.each([["2.1m", 2_100_000], ["4.1m", 4_100_000], ["8.03m", 8_030_000], ["1.001m", 1_001_000], ["2.05m", 2_050_000], ["1.5000k", 1_500], ["1.0001k", null], ["0m", null], ["10,010,000", 10_010_000], ["all", null], ["max", null], ["-1", null], ["0", null], ["1e7", null], ["abc", null], ["2.5", null]] as const)(
    "parseBidAmount(%s) = %s", (raw, want) => expect(parseBidAmount(raw)).toBe(want));

  it("a first bid at the floor moves earnings into escrow", async () => {
    const { f, boss } = await bidder({ earnings: 3_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await expect(bid(boss, 2_099_999)).rejects.toThrow("Bid at least the floor of 2,100,000.");
    expect(await bid(boss, 2_100_000)).toMatchObject({ warId: w.id, amount: 2_100_000, previous: null });
    expect(await fam(f.id)).toMatchObject({ earnings: 900_000 });
    expect(await war(w.id)).toMatchObject({ topBid: 2_100_000, topBidderFamilyId: f.id });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "bid_escrow" } })).toMatchObject({ amount: -2_100_000 });
  });

  it("never uses the treasury, and says so without amounts (7.5 rule 4, Review Focus 5)", async () => {
    const { f, boss } = await bidder({ earnings: 1_000_000, treasury: 50_000_000 });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const err = await bid(boss, 2_100_000).catch((e) => e);
    expect(err.message).toBe("Not enough earnings for this bid (bids never use the treasury). Check `!crew vault`.");
    expect(await fam(f.id)).toMatchObject({ earnings: 1_000_000, treasury: 50_000_000 });
  });

  it("an outbid refunds the previous escrow to that family's earnings and enforces the raise", async () => {
    const a = await bidder({ earnings: 3_000_000 }); const b = await bidder({ earnings: 5_000_000 });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await bid(a.boss, 2_100_000);
    await expect(bid(a.ub, 2_400_000)).rejects.toThrow("You already hold the top bid.");
    await expect(bid(b.boss, 2_309_999)).rejects.toThrow("The top bid is 2,100,000. Bid at least 2,310,000.");
    expect(await bid(b.boss, 2_310_000)).toMatchObject({ previous: { familyId: a.f.id, amount: 2_100_000 } });
    expect([(await fam(a.f.id))!.earnings, (await fam(b.f.id))!.earnings]).toEqual([3_000_000, 2_690_000]);
  });

  it("two families bidding in the same second: one top bid, the loser keeps its earnings (edge 13)", async () => {
    const a = await bidder({ earnings: 5_000_000 }); const b = await bidder({ earnings: 5_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const rs = await Promise.allSettled([bid(a.boss, 2_100_000), bid(b.boss, 2_100_000)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = rs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason.message).toMatch(/top (bid )?is now|top bid is|Vault busy/);
    const top = (await war(w.id))!;
    const winner = top.topBidderFamilyId === a.f.id ? a : b; const loser = winner === a ? b : a;
    expect([(await fam(winner.f.id))!.earnings, (await fam(loser.f.id))!.earnings]).toEqual([2_900_000, 5_000_000]);
  });

  it("refuses after bidClosesAt, even before the tick arms the war (edge 81)", async () => {
    const { boss } = await bidder({ earnings: 5_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", startsAt: new Date(Date.now() + 30 * 60_000) });
    await expect(bid(boss, 2_100_000)).rejects.toThrow("Bidding is not open for this racket.");
    expect((await war(w.id))!.topBid).toBe(0);
  });

  it("checks owner, rank, jail, class level, arrears, investigation, racket cap and the Crown cap", async () => {
    const o = await bidder({ earnings: 50_000_000, level: 7 });
    await seedRacket("casino_row", { ownerFamilyId: o.f.id });
    for (const k of ["docks_numbers", "harbor_customs", "city_hall", "casino_row"]) await seedWar({ racketKey: k, status: "BIDDING" });
    await expect(bid(o.boss, 9_100_000, "casino_row")).rejects.toThrow("You already own this racket.");
    await expect(bid(o.s, 2_100_000)).rejects.toThrow("Only the Boss or Underboss can bid.");
    await expect(bid(o.boss, 9_100_000, "city_hall")).rejects.toThrow("Only one Crown racket at a time, held or bid on.");
    const young = await bidder({ earnings: 50_000_000, level: 3 });
    await expect(bid(young.boss, 4_550_000, "harbor_customs")).rejects.toThrow("District rackets need family level 4.");
    await bid(young.boss, 2_100_000);                                  // L3 cap 1: one live top bid
    await seedRacket("pawn_row");
    await seedWar({ racketKey: "pawn_row", status: "BIDDING" });
    await expect(bid(young.ub, 2_100_000, "pawn_row")).rejects.toThrow("Racket cap reached (1/1 held or bid).");
    const late = await bidder({ earnings: 50_000_000 });
    await testPrisma.family.update({ where: { id: late.f.id }, data: { duesArrears: 1 } });
    await expect(bid(late.boss, 2_310_000)).rejects.toThrow("Clear dues arrears first.");
    const jailed = await bidder({ earnings: 50_000_000 });
    await testPrisma.user.update({ where: { discordId: jailed.boss }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3600_000) } });
    await expect(bid(jailed.boss, 2_310_000)).rejects.toThrow("You can't bid while jailed.");
    const hot = await bidder({ earnings: 50_000_000 });
    for (const id of [hot.boss, hot.ub, hot.s]) await testPrisma.user.update({ where: { discordId: id }, data: { crimeHeat: 100 } });
    await expect(bid(hot.boss, 2_310_000)).rejects.toThrow("Your family is under investigation.");
  });

  it("the 14-day pair rule blocks shared Bosses or two shared members, both directions (D28)", async () => {
    const owner = await bidder({ earnings: 0 }); const b = await bidder({ earnings: 50_000_000 });
    await seedRacket("docks_numbers", { ownerFamilyId: owner.f.id });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const exit = (userId: string, familyId: string, days: number) => testPrisma.familyExit.create({ data: { userId, familyId, reason: "LEFT", leftAt: daysAgo(days) } });
    await exit(b.boss, owner.f.id, 15);
    expect(await bid(b.boss, 2_100_000)).toBeTruthy();                // 15 days ago: allowed
    const c = await bidder({ earnings: 50_000_000 });
    await exit(owner.boss, c.f.id, 13);                                 // the owner's Boss was in c
    await expect(bid(c.boss, 2_310_000)).rejects.toThrow("Blocked: your families shared a Boss or two members in the last 14 days.");
    const d = await bidder({ earnings: 50_000_000 });
    await exit(d.ub, owner.f.id, 3);
    await expect(bid(d.boss, 2_310_000)).resolves.toBeTruthy();         // one shared member: allowed
    const e = await bidder({ earnings: 50_000_000 });
    await exit(e.ub, owner.f.id, 3); await exit(e.s, owner.f.id, 3);
    await expect(bid(e.boss, 2_800_000)).rejects.toThrow(/shared a Boss or two members/);
  });

  it("a bid racing the top bidder's disband: the escrow is burned once and the new bid stands", async () => {
    const a = await bidder({ earnings: 2_100_000, tag: "AAA" }); const b = await bidder({ earnings: 5_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await bid(a.boss, 2_100_000);
    await testPrisma.family.update({ where: { id: a.f.id }, data: { lastPaydayAt: daysAgo(1) } });
    await Promise.allSettled([disbandFamily(a.boss, "AAA"), bid(b.boss, 2_310_000)]);
    expect(await war(w.id)).toMatchObject({ topBidderFamilyId: b.f.id, topBid: 2_310_000 });
    expect((await testPrisma.familyLedger.findFirst({ where: { familyId: a.f.id, type: "disband_burn" } }))!.amount).toBe(-2_100_000);
    expect((await fam(b.f.id))!.earnings).toBe(2_690_000);
  });
});
