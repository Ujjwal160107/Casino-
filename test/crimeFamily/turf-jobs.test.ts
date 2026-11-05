// test/crimeFamily/turf-jobs.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { CF_SCHEDULES } from "../../src/services/crimeFamily/scheduler";
import { tickWars, tickRackets } from "../../src/services/crimeFamily/turfJobs";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { nextWarStart } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import { fakeClient } from "./fakeClient";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWarHits, withCfConfig, flushTestKeys } from "../helpers";

const H = 3600_000;
const ON = { enabled: true, turfEnabled: true };
// Every tick time is relative to a valet_racket start in the future, so seeded users (aged from the real clock) are always old enough.
const base = nextWarStart(racketDef("valet_racket")!, new Date(Date.now() + 73 * H));
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(async () => { await resetFamilies(); await seedRackets(); await flushTestKeys("cf:render:war:*"); });

async function fam(channel: string, earnings = 0) {
  const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, earnings, homeGuildId: "g1", homeChannelId: channel, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, ids: [boss, ub, s], boss };
}

describe("turf jobs (15)", () => {
  it("schedules tickWars on its own minute entry, tickRackets at :05 and the hit sweep with the minute sweepers", () => {
    const names = (cron: string) => CF_SCHEDULES.filter((s) => s.cron === cron).map((s) => s.jobs.map((j) => j.name));
    expect(names("* * * * *")).toEqual(expect.arrayContaining([["tickWars"], expect.arrayContaining(["sweepWarHits"])]));
    expect(names("5 * * * *")).toEqual([["tickRackets"]]);
  });

  it("walks one war through every state once: open, bid, arm, warn, start, settle", async () => {
    await withCfConfig(ON, async () => {
      const owner = await fam("ch-d"); const a = await fam("ch-a", 3_000_000);
      await testPrisma.racket.update({ where: { key: "valet_racket" }, data: { ownerFamilyId: owner.f.id } });
      const c = fakeClient();
      const at = (h: number) => new Date(+base + h * H);
      await tickWars(c.client, at(-72)); await tickWars(c.client, new Date(+at(-72) + 30_000));
      expect(await testPrisma.war.count({ where: { racketKey: "valet_racket" } })).toBe(1);
      await placeBid({ racketKey: "valet_racket", actorId: a.boss, amount: 2_100_000, now: at(-48) });
      await tickWars(c.client, at(-1));
      expect(await testPrisma.war.findFirst({ where: { racketKey: "valet_racket" } })).toMatchObject({ status: "ARMED", defenderFamilyId: owner.f.id });
      await tickWars(c.client, at(-0.25)); await tickWars(c.client, new Date(+at(-0.25) + 60_000));
      expect(c.dm.size).toBe(6);
      expect([...c.dm.values()].every((n) => n === 1)).toBe(true);
      await tickWars(c.client, base);
      expect(c.calls.filter((x) => x.op === "send").map((x) => x.channelId).sort()).toEqual(["ch-a", "ch-d"]);
      for (let m = 1; m <= 60; m++) await tickWars(c.client, new Date(+base + m * 60_000));
      const w = (await testPrisma.war.findFirst({ where: { racketKey: "valet_racket" } }))!;
      expect(w).toMatchObject({ status: "RESOLVED", winnerFamilyId: owner.f.id, maxTickGapSeconds: 60 });
      expect((await testPrisma.racket.findUnique({ where: { key: "valet_racket" } }))!.ownerFamilyId).toBe(owner.f.id);
      expect(await testPrisma.familyLedger.count({ where: { type: "war_bid_burn" } })).toBe(1);
    });
  });

  it("with turf off: no new wars, and a bid war closing is cancelled and refunded (T1)", async () => {
    const a = await fam("ch-a", 3_000_000);
    const c = fakeClient();
    await withCfConfig(ON, async () => {
      await tickWars(c.client, new Date(+base - 72 * H));
      await placeBid({ racketKey: "valet_racket", actorId: a.boss, amount: 2_100_000, now: new Date(+base - 48 * H) });
    });
    await testPrisma.war.deleteMany({ where: { racketKey: { not: "valet_racket" } } });
    await tickWars(c.client, new Date(+base - H));
    expect(await testPrisma.war.findFirst({ where: { racketKey: "valet_racket" } })).toMatchObject({ status: "CANCELLED" });
    expect((await testPrisma.family.findUnique({ where: { id: a.f.id } }))!.earnings).toBe(3_000_000);
    expect(await testPrisma.war.count({ where: { status: "BIDDING" } })).toBe(0);
  });

  it("tickRackets mints for 3 eligible members, strikes and DMs otherwise, and does nothing while turf is off", async () => {
    const rich = await fam("ch-a"); const lazy = await fam("ch-b");
    for (const id of rich.ids) await seedWarHits(id, rich.f.id, 3);
    await seedWarHits(lazy.ids[2], lazy.f.id, 3);
    const old = new Date(Date.now() - 25 * 3600_000);
    await seedRacket("pawn_row", { ownerFamilyId: rich.f.id, lastPayoutAt: old });
    await seedRacket("docks_numbers", { ownerFamilyId: lazy.f.id, lastPayoutAt: old });
    const c = fakeClient();
    await tickRackets(c.client, new Date());
    expect((await testPrisma.family.findUnique({ where: { id: rich.f.id } }))!.earnings).toBe(0);
    await withCfConfig(ON, () => tickRackets(c.client, new Date()));
    expect((await testPrisma.family.findUnique({ where: { id: rich.f.id } }))!.earnings).toBe(300_000);
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.neglectStrikes).toBe(1);
    expect([...c.dm.keys()].sort()).toEqual([lazy.ids[0], lazy.ids[1]].sort()); // officers; the active Soldier is eligible
  });
});
