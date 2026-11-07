// test/crimeFamily/turf-handlers.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { redisService } from "../../src/services/redisService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { weakPoint, slotOf } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import { fakeButton, fakeModal, said } from "./fakeInteraction";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedTurfCity, withCfConfig, turfCity } from "../helpers";

const ON = { enabled: true, turfEnabled: true };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

async function liveWar() {
  const boss = await seedEligibleUser({ wallet: 100_000 }); const s = await seedEligibleUser({ wallet: 100_000 });
  const a = await seedFamily({ bossId: boss, homeGuildId: "g1", members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  await seedRacket("docks_numbers");
  const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.id, defenderFamilyId: "" });
  return { w, boss, s, a };
}

describe("turf routes (13.2)", () => {
  it("the Bid button opens its modal before any Prisma or Redis call", async () => {
    const findUnique = prisma.familyMember.findUnique;
    const db = vi.spyOn(prisma.familyMember, "findUnique"); const redis = vi.spyOn(redisService, "getInstance");
    const i = fakeButton(TURF_IDS.bid("65f0000000000000000000aa", "u1"), { userId: "u1" });
    i.showModal.mockImplementation(async () => { expect(db).not.toHaveBeenCalled(); expect(redis).not.toHaveBeenCalled(); i.order.push("showModal"); });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.order[0]).toBe("showModal");
    db.mockRestore(); redis.mockRestore();
    Object.assign(prisma.familyMember, { findUnique });   // mockRestore writes undefined back on Prisma's model proxy
  });

  it("the map is refused while turf is closed", async () => {
    const i = fakeButton(TURF_IDS.viewMap("u1"), { userId: "u1", guildId: "g1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(said(i)).toContain("Turf wars are not open in this server yet.");
  });

  it("Hit → S19 → the right approach scores +10 on the board's war", async () => {
    const { w, s } = await liveWar();
    const hit = fakeButton(TURF_IDS.hit(w.id, "docks"), { userId: s, guildId: "g1" });
    await handleCrimeFamilyInteraction(hit as any);
    const ids = JSON.stringify(hit.editReply.mock.calls).match(/turf:hx:[0-9a-f]{24}:\d/g)!;
    expect(ids).toHaveLength(4);
    const right = weakPoint(w.seed, "docks", slotOf(w.startsAt, new Date()));
    const ans = fakeButton(ids[right], { userId: s, guildId: "g1", ephemeralSource: true });
    await handleCrimeFamilyInteraction(ans as any);
    expect(said(ans)).toContain("+10");
    expect((await testPrisma.war.findUnique({ where: { id: w.id } }))!.atkDocks).toBe(10);
  });

  it("Hit from another guild and Scout from a DM work like any press (A4)", async () => {
    await withCfConfig(ON, async () => {
      const { w, s } = await liveWar();
      const hit = fakeButton(TURF_IDS.hit(w.id, "docks"), { userId: s, guildId: "elsewhere" });
      await handleCrimeFamilyInteraction(hit as any);
      expect(JSON.stringify(hit.editReply.mock.calls)).toMatch(/turf:hx:[0-9a-f]{24}:\d/);
      const scout = fakeButton(TURF_IDS.scout(w.id), { userId: s, guildId: null });
      await handleCrimeFamilyInteraction(scout as any);
      expect(said(scout)).toContain("weak point is");
      expect(await testPrisma.warContribution.count({ where: { warId: w.id, userId: s } })).toBe(1);
    });
  });

  it("an unknown block argument and an unknown turf action are inactive buttons", async () => {
    const { w, s } = await liveWar();
    const i = fakeButton(`turf:hit:${w.id}:roof`, { userId: s, guildId: "g1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(said(i)).toContain("This button is no longer active.");
    const gone = fakeButton("turf:nope:u1", { userId: "u1" });
    await handleCrimeFamilyInteraction(gone as any);
    expect(said(gone)).toContain("This button is no longer active.");
  });

  it("War board names the family's own ARMED war and its start, not the map's soonest slot", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, homeGuildId: "g1" });
      const startsAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 20 * 60_000 + 7_000);   // off any schedule slot
      await seedWar({ racketKey: "casino_row", status: "ARMED", startsAt, topBid: 2_100_000, topBidderFamilyId: f.id });
      const i = fakeButton(TURF_IDS.viewWar(boss), { userId: boss, guildId: "g1" });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain(`Next war: ${racketDef("casino_row")!.name} <t:${startsAt.getTime() / 1000}:F>.`);
    });
  });

  it("the bid modal places the bid and re-renders S17 with a note", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, earnings: 3_000_000, data: { cityId: (await turfCity()).id } });
      const w = await seedWar({ racketKey: "pawn_row", status: "BIDDING" });
      const i = fakeModal(TURF_IDS.bidModal(w.racketId, boss), { amount: "2.1m" }, { userId: boss, guildId: "g1" });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain("Bid placed: 2,100,000.");
      expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.earnings).toBe(900_000);
    });
  });

  it("a stale map's racket in another city opens read-only and its bid is refused, nothing debited (Review Focus 1)", async () => {
    await withCfConfig(ON, async () => {
      const m1 = await seedTurfCity({ league: "SILVER", number: 1 }); const m2 = await seedTurfCity({ league: "SILVER", number: 2 });
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, level: 5, earnings: 9_000_000, data: { cityId: m2.id } });
      const w = await seedWar({ racketKey: "pawn_row", status: "BIDDING", cityId: m1.id });
      const away = "This racket is in Midtown #1. Your family plays in Midtown #2.";
      const open = fakeButton(TURF_IDS.openRacket(w.racketId, boss), { userId: boss, guildId: "g1" });
      await handleCrimeFamilyInteraction(open as any);
      expect(said(open)).toContain("**City:** Midtown #1 (Silver league)");
      expect(said(open)).toContain(away);
      const bid = fakeModal(TURF_IDS.bidModal(w.racketId, boss), { amount: "1.4m" }, { userId: boss, guildId: "g1" });
      await handleCrimeFamilyInteraction(bid as any);
      expect(said(bid)).toContain(away);
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).earnings).toBe(9_000_000);
      expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: "bid_escrow" } })).toBe(0);
    });
  });
});
