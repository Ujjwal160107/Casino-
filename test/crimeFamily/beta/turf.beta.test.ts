// Crime Families beta QA: turf (leagues, cities, rackets, bids, wars).
// Hostile multi-player scenarios through the real services and the real
// turf: button routing. Confirmed bugs are it.fails("BUG-TURF-<n>: …").
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { handleCrimeFamilyInteraction } from "../../../src/handlers/crimeFamilyRouter";
import { TURF_IDS } from "../../../src/ui/crimeFamily/ids";
import { placeBid } from "../../../src/services/crimeFamily/bidService";
import { levelUp } from "../../../src/services/crimeFamily/progression";
import { seedTurf } from "../../../src/services/crimeFamily/turfCities";
import { racketDef } from "../../../src/data/crimeFamilyCatalog";
import { fakeButton, fakeModal, fakeSelect } from "../fakeInteraction";
import { fakeClient } from "../fakeClient";
import { runTurfCensus } from "../../../src/services/crimeFamily/census";
import { tickWars, tickRackets } from "../../../src/services/crimeFamily/turfJobs";
import { armHit, answerHit, scoutWar } from "../../../src/services/crimeFamily/warActions";
import { getWarBoardView } from "../../../src/services/crimeFamily/turfQueries";
import { leaveFamily, kickMember } from "../../../src/services/crimeFamily/membershipService";
import { disbandFamily } from "../../../src/services/crimeFamily/disbandService";
import { buildWarBoard } from "../../../src/ui/crimeFamily/turfScreens";
import { nextWarStart, weakPoint, slotOf, warWindow, type WarBlockKey } from "../../../src/services/crimeFamily/warMath";
import { testPrisma, resetFamilies, ensureUniqueIndexes, withCfConfig, seedWar, flushTestKeys, seedWarHits, seedEligibleUser } from "../../helpers";
import { ON, M, H, DAY, crew, bareFamilies, citySizes, turfInvariants, vaultBaseline, replies } from "./turf.helpers";

const city = (league: string, number: number) => testPrisma.turfCity.findUniqueOrThrow({ where: { league_number: { league, number } } });
const racket = (cityId: string, key: string) => testPrisma.racket.findUniqueOrThrow({ where: { cityId_key: { cityId, key } } });
const fam = (id: string) => testPrisma.family.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  await ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyExit", "TurfCity", "Racket", "War", "WarContribution", "CfJobRun"]);
  await testPrisma.$runCommandRaw({ create: "FamilyLedger" }).catch((err: Error) => {
    if (!/Code: `?48\b|NamespaceExists/.test(String(err?.message))) throw err;
  });
});
beforeEach(async () => { await resetFamilies(); await seedTurf(); await flushTestKeys("cf:*"); });

describe("BETA turf: forged and stale ids on the shared war buttons", () => {
  it("BUG-TURF-1: a forged non-ObjectId war or hit id on Scout / Hit / answer crashes into 'Something went wrong.' instead of a refusal", async () => {
    await withCfConfig(ON, async () => {
      const a = await crew({ cityId: (await city("GOLD", 1)).id });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        for (const [id, want] of [
          [TURF_IDS.scout("not-an-object-id"), "This war is over."],
          [TURF_IDS.hit("zzzzzzzzzzzzzzzzzzzzzzzz", "docks"), "This war is over."],
          [TURF_IDS.hitAnswer("nope", 0), "Not your hit."],
        ] as const) {
          const i = fakeButton(id, { userId: a.boss });
          await handleCrimeFamilyInteraction(i as any);
          expect(replies(i)).toContain(want);
        }
        expect(errors).not.toHaveBeenCalled();
      } finally { errors.mockRestore(); }
    });
  });

  it("well-formed but unknown war / hit ids, unknown blocks and out-of-range answers are clean refusals", async () => {
    await withCfConfig(ON, async () => {
      const a = await crew({ cityId: (await city("GOLD", 1)).id });
      const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id });
      for (const [id, want] of [
        [TURF_IDS.scout("65f0000000000000000000ff"), "This war is over."],
        [TURF_IDS.hit("65f0000000000000000000ff", "docks"), "This war is over."],
        [TURF_IDS.hitAnswer("65f0000000000000000000ff", 0), "Not your hit."],
        [`turf:hit:${w.id}:Docks`, "This button is no longer active."],
        [`turf:hit:${w.id}`, "This button is no longer active."],
        [`turf:hx:65f0000000000000000000ff:4`, "This button is no longer active."],
        [`turf:hx:65f0000000000000000000ff:-1`, "This button is no longer active."],
        [`turf:hx:65f0000000000000000000ff:1.0`, "This button is no longer active."],
        [`turf:hx:65f0000000000000000000ff`, "This button is no longer active."],
        [`turf:nuke:${w.id}`, "This button is no longer active."],
      ] as const) {
        const i = fakeButton(id, { userId: a.boss });
        await handleCrimeFamilyInteraction(i as any);
        expect(replies(i), id).toContain(want);
      }
      expect(await testPrisma.warContribution.count()).toBe(0);
    });
  });

  it("owner-scoped turf panels refuse another player's press; forged racket ids are 'Unknown racket.' with nothing debited", async () => {
    await withCfConfig(ON, async () => {
      const up1 = await city("GOLD", 1);
      const a = await crew({ cityId: up1.id, earnings: 10_000_000 });
      const thief = await crew({ cityId: up1.id, earnings: 10_000_000 });
      await seedWar({ racketKey: "docks_numbers", cityId: up1.id, status: "BIDDING" });
      const r = await racket(up1.id, "docks_numbers");
      for (const id of [TURF_IDS.viewMap(a.boss), TURF_IDS.openRacket(r.id, a.boss), TURF_IDS.bid(r.id, a.boss), TURF_IDS.city(up1.id, a.boss), TURF_IDS.league("GOLD", a.boss)]) {
        const i = fakeButton(id, { userId: thief.boss });
        await handleCrimeFamilyInteraction(i as any);
        expect(replies(i)).toContain("This panel is not yours.");
      }
      const stolenModal = fakeModal(TURF_IDS.bidModal(r.id, a.boss), { amount: "2.1m" }, { userId: thief.boss });
      await handleCrimeFamilyInteraction(stolenModal as any);
      expect(replies(stolenModal)).toContain("This panel is not yours.");
      for (const forged of ["", "x", "65f0000000000000000000ff", "../../etc", "<@1>", "6".repeat(25)]) {
        const m = fakeModal(`turf:modal:bid:${forged}:${a.boss}`, { amount: "2.1m" }, { userId: a.boss });
        await handleCrimeFamilyInteraction(m as any);
        expect(replies(m), forged).toContain("Unknown racket.");
        const sel = fakeSelect(TURF_IDS.select(a.boss), [forged], { userId: a.boss, ephemeralSource: true });
        await handleCrimeFamilyInteraction(sel as any);
        expect(replies(sel), forged).toContain("Unknown racket.");
      }
      expect((await fam(a.f.id)).earnings).toBe(10_000_000);
      expect(await testPrisma.war.count({ where: { topBid: { gt: 0 } } })).toBe(0);
    });
  });
});

describe("BETA turf: bidding under attack", () => {
  it("bid amount fuzz through the real modal: only exact whole fortunes at or above the floor ever move money", async () => {
    await withCfConfig(ON, async () => {
      const low = await city("BRONZE", 1);
      const a = await crew({ level: 2, cityId: low.id, earnings: 5_000_000 });
      await seedWar({ racketKey: "docks_numbers", cityId: low.id, status: "BIDDING" });
      const r = await racket(low.id, "docks_numbers");
      const press = async (amount: string) => {
        const m = fakeModal(TURF_IDS.bidModal(r.id, a.boss), { amount }, { userId: a.boss });
        await handleCrimeFamilyInteraction(m as any);
        return replies(m);
      };
      for (const bad of ["-5", "0", "1e20", "1e6", "NaN", "Infinity", "-Infinity", "0x10", "1.5", "699,999.5", "all", "MAX", "allin", "", " ", "1.0001k",
        "１０００", "7OO000", "700000; drop", "<@everyone>", "@here", "1,,,000k".repeat(3), "\u200b700000", "700\u200b000"]) {
        expect(await press(bad), JSON.stringify(bad)).toMatch(/Enter an amount like 2\.1m|Bid at least the floor/);
      }
      expect(await press("99999999999999999999")).toContain("Enter an amount like 2.1m");   // past MAX_SAFE_INTEGER
      expect(await press("5k")).toContain("Bid at least the floor of 700,000.");
      expect(await press("9007199254740991")).toContain("Not enough earnings");
      expect((await fam(a.f.id)).earnings).toBe(5_000_000);
      expect(await press("0.7m")).toContain("Bid placed: 700,000.");
      expect((await fam(a.f.id)).earnings).toBe(4_300_000);
      expect(await press("770k")).toContain("You already hold the top bid.");
    });
  });

  it("one family firing two bids at once never exceeds its racket cap (Bronze 1) and pays once", async () => {
    await withCfConfig(ON, async () => {
      const low = await city("BRONZE", 1);
      const a = await crew({ level: 2, cityId: low.id, earnings: 5_000_000 });
      const base = await vaultBaseline();
      const r1 = await racket(low.id, "docks_numbers"); const r2 = await racket(low.id, "pawn_row");
      await seedWar({ racketKey: "docks_numbers", cityId: low.id, status: "BIDDING" });
      await seedWar({ racketKey: "pawn_row", cityId: low.id, status: "BIDDING" });
      const res = await Promise.allSettled([
        placeBid({ racketId: r1.id, actorId: a.boss, amount: 700_000 }),
        placeBid({ racketId: r2.id, actorId: a.ub, amount: 700_000 }),
      ]);
      expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason.message)).toContain("Racket cap reached (1/1 held or bid).");
      expect((await fam(a.f.id)).earnings).toBe(4_300_000);
      expect(await turfInvariants(base)).toEqual([]);
    });
  });

  it("caps per league: Silver 2, Gold 3 with at most 1 Crown, raced from two officers at once", async () => {
    await withCfConfig(ON, async () => {
      const mid = await city("SILVER", 1); const up = await city("GOLD", 1);
      const s = await crew({ level: 5, cityId: mid.id, earnings: 50_000_000 });
      const g = await crew({ level: 9, cityId: up.id, earnings: 80_000_000 });
      const base = await vaultBaseline();
      const keys = ["docks_numbers", "pawn_row", "valet_racket", "casino_row", "city_hall"];
      for (const cityId of [mid.id, up.id]) for (const key of keys) await seedWar({ racketKey: key, cityId, status: "BIDDING" });
      const floor = async (cityId: string, key: string) => 7 * (await racket(cityId, key)).incomePerCycle;
      const bidAll = async (x: typeof s, cityId: string, list: string[]) => Promise.allSettled(list.map(async (key, n) =>
        placeBid({ racketId: (await racket(cityId, key)).id, actorId: n % 2 ? x.ub : x.boss, amount: await floor(cityId, key) })));
      expect((await bidAll(s, mid.id, ["docks_numbers", "pawn_row", "valet_racket"])).filter((x) => x.status === "fulfilled")).toHaveLength(2);
      expect((await bidAll(g, up.id, ["casino_row", "city_hall"])).filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect((await bidAll(g, up.id, ["docks_numbers", "pawn_row", "valet_racket"])).filter((x) => x.status === "fulfilled")).toHaveLength(2);
      expect(await turfInvariants(base)).toEqual([]);
    });
  });

  it("five families bidding the same amount in the same instant: one top bid, four untouched vaults, one escrow", async () => {
    await withCfConfig(ON, async () => {
      const up = await city("GOLD", 1);
      const fams = [];
      for (let n = 0; n < 5; n++) fams.push(await crew({ cityId: up.id, earnings: 5_000_000 }));
      const base = await vaultBaseline();
      const w = await seedWar({ racketKey: "docks_numbers", cityId: up.id, status: "BIDDING" });
      const r = await racket(up.id, "docks_numbers");
      const res = await Promise.allSettled(fams.map((x) => placeBid({ racketId: r.id, actorId: x.boss, amount: 2_100_000 })));
      expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const after = await Promise.all(fams.map((x) => fam(x.f.id)));
      expect(after.filter((f) => f.earnings === 2_900_000)).toHaveLength(1);
      expect(after.filter((f) => f.earnings === 5_000_000)).toHaveLength(4);
      expect((await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } })).topBid).toBe(2_100_000);
      // a raise race right after: one of the four outbids, the first is refunded exactly once
      const losers = fams.filter((_, i) => after[i].earnings === 5_000_000);
      const res2 = await Promise.allSettled(losers.map((x) => placeBid({ racketId: r.id, actorId: x.ub, amount: 2_310_000 })));
      expect(res2.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const total = (await Promise.all(fams.map((x) => fam(x.f.id)))).reduce((s, f) => s + f.earnings, 0);
      expect(total + 2_310_000).toBe(25_000_000);
      expect(await turfInvariants(base)).toEqual([]);
    });
  });

  it("a league-changing level-up racing a bid: never both a Silver family and a Bronze top bid", async () => {
    await withCfConfig(ON, async () => {
      for (let round = 0; round < 3; round++) {
        await resetFamilies(); await seedTurf();
        const low = await city("BRONZE", 1);
        const a = await crew({ level: 3, cityId: low.id, earnings: 20_000_000 });
        await testPrisma.family.update({ where: { id: a.f.id }, data: { xp: 10_000 } });
        const r1 = await racket(low.id, "docks_numbers");
        await seedWar({ racketKey: "docks_numbers", cityId: low.id, status: "BIDDING" });
        const base = await vaultBaseline();
        const ops = [() => placeBid({ racketId: r1.id, actorId: a.ub, amount: 700_000 }), () => levelUp(a.f.id, a.boss, 3)];
        const res = await Promise.allSettled(round % 2 ? ops.reverse().map((f) => f()) : ops.map((f) => f()));
        expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        const f = await fam(a.f.id);
        const top = await testPrisma.war.findFirstOrThrow({ where: { racketId: r1.id } });
        if (f.level === 4) expect(top.topBidderFamilyId).toBe("");
        else expect(top.topBidderFamilyId).toBe(a.f.id);
        expect(await turfInvariants(base)).toEqual([]);
      }
    });
  });

  it("bid then the bidder's Underboss leaves, the Boss disbands, or tries to jump leagues: escrow is never lost or doubled", async () => {
    await withCfConfig(ON, async () => {
      const low = await city("BRONZE", 1);
      const a = await crew({ level: 3, cityId: low.id, earnings: 3_000_000, tag: "BYE", size: 4 });
      await testPrisma.family.update({ where: { id: a.f.id }, data: { xp: 10_000 } });
      const b = await crew({ level: 2, cityId: low.id, earnings: 3_000_000 });
      const w = await seedWar({ racketKey: "pawn_row", cityId: low.id, status: "BIDDING" });
      const r = await racket(low.id, "pawn_row");
      await placeBid({ racketId: r.id, actorId: a.ub, amount: 700_000 });
      await leaveFamily(a.ub);                                           // the officer who bid walks out
      expect(await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ topBidderFamilyId: a.f.id, topBid: 700_000 });
      await expect(levelUp(a.f.id, a.boss, 3)).rejects.toThrow("Finish your turf first");
      expect((await fam(a.f.id)).level).toBe(3);
      await expect(placeBid({ racketId: r.id, actorId: b.boss, amount: 799_999 })).rejects.toThrow("at least 800,000");   // +100,000 beats +10% here
      const result = await disbandFamily(a.boss, "BYE");
      expect(result.burned).toBe(3_000_000);                             // 2,300,000 left + 700,000 escrow back, then burned
      expect(await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "BIDDING", topBidderFamilyId: "", topBid: 0 });
      await placeBid({ racketId: r.id, actorId: b.boss, amount: 700_000 });   // the floor again: the war reset
      expect((await fam(b.f.id)).earnings).toBe(2_300_000);
      expect(await turfInvariants()).toEqual([]);
    });
  });

  it("bidding while broke, in arrears, jailed, unplaced, homeless or as a Soldier: refused before any money moves", async () => {
    await withCfConfig(ON, async () => {
      const low = await city("BRONZE", 1);
      await seedWar({ racketKey: "docks_numbers", cityId: low.id, status: "BIDDING" });
      const r = await racket(low.id, "docks_numbers");
      const broke = await crew({ level: 1, cityId: low.id, earnings: 699_999, treasury: 100_000_000 });
      await expect(placeBid({ racketId: r.id, actorId: broke.boss, amount: 700_000 })).rejects.toThrow("bids never use the treasury");
      const arrears = await crew({ level: 1, cityId: low.id, earnings: 5_000_000 });
      await testPrisma.family.update({ where: { id: arrears.f.id }, data: { duesArrears: 1 } });
      await expect(placeBid({ racketId: r.id, actorId: arrears.boss, amount: 700_000 })).rejects.toThrow("Clear dues arrears first.");
      const jailed = await crew({ level: 1, cityId: low.id, earnings: 5_000_000 });
      await testPrisma.user.update({ where: { discordId: jailed.boss }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
      await expect(placeBid({ racketId: r.id, actorId: jailed.boss, amount: 700_000 })).rejects.toThrow("You can't bid while jailed.");
      const unplaced = await crew({ level: 1, earnings: 5_000_000 });
      await expect(placeBid({ racketId: r.id, actorId: unplaced.boss, amount: 700_000 })).rejects.toThrow("Your family has no city yet");
      const homeless = await crew({ level: 1, cityId: low.id, earnings: 5_000_000, channel: "" });
      await testPrisma.family.update({ where: { id: homeless.f.id }, data: { homeChannelId: "" } });
      await expect(placeBid({ racketId: r.id, actorId: homeless.boss, amount: 700_000 })).rejects.toThrow("Set a home channel first");
      const soldier = await crew({ level: 1, cityId: low.id, earnings: 5_000_000 });
      await expect(placeBid({ racketId: r.id, actorId: soldier.soldiers[0], amount: 700_000 })).rejects.toThrow("Only the Boss or Underboss can bid.");
      for (const x of [broke, arrears, jailed, unplaced, homeless, soldier]) {
        const f = await fam(x.f.id);
        expect(await testPrisma.familyLedger.count({ where: { familyId: f.id } })).toBe(0);
      }
    });
  });
});

describe("BETA turf: a live war through the real buttons", () => {
  async function liveWar(o: { racketKey?: string; street?: boolean } = {}) {
    const up = await city("GOLD", 1);
    const A = await crew({ cityId: up.id, tag: "ATK", channel: "ch-atk", wallet: 200_000 });
    const D = await crew({ cityId: up.id, tag: "DEF", channel: "ch-def", wallet: 200_000 });
    const key = o.racketKey ?? "docks_numbers";
    if (!o.street) await testPrisma.racket.update({ where: { cityId_key: { cityId: up.id, key } }, data: { ownerFamilyId: D.f.id } });
    const w = await seedWar({ racketKey: key, cityId: up.id, status: "ACTIVE", startsAt: new Date(Date.now() - 7 * M), topBid: 2_100_000,
      topBidderFamilyId: A.f.id, defenderFamilyId: o.street ? "" : D.f.id });
    return { up, A, D, w };
  }
  /** Presses Hit on `block`, then the right (or a wrong) approach button, exactly as S19 emits them. */
  async function pressHit(uid: string, warId: string, seed: string, startsAt: Date, block: WarBlockKey, right: boolean, guildId: string | null = "g1") {
    const hit = fakeButton(TURF_IDS.hit(warId, block), { userId: uid, guildId });
    await handleCrimeFamilyInteraction(hit as any);
    const ids = replies(hit).match(/turf:hx:[0-9a-f]{24}:\d/g);
    if (!ids) return replies(hit);
    const good = weakPoint(seed, block, slotOf(startsAt, new Date()));
    const ans = fakeButton(ids[right ? good : (good + 1) % 4], { userId: uid, guildId, ephemeralSource: true });
    await handleCrimeFamilyInteraction(ans as any);
    return replies(ans);
  }

  it("both sides hit from the board, a DM and another server; outsiders, recruits, the jailed and the hot are refused before any write", async () => {
    await withCfConfig(ON, async () => {
      const { A, D, w } = await liveWar();
      expect(await pressHit(A.boss, w.id, w.seed, w.startsAt, "docks", true)).toContain("Hit! +10 on Docks.");
      expect(await pressHit(A.ub, w.id, w.seed, w.startsAt, "docks", true, null)).toContain("Hit! +10 on Docks.");        // DM press
      expect(await pressHit(A.soldiers[0], w.id, w.seed, w.startsAt, "main", false, "far-away")).toContain("Missed. No points.");
      expect(await pressHit(D.boss, w.id, w.seed, w.startsAt, "docks", true, "another-guild")).toContain("Hit! +12 on Docks.");
      expect(await pressHit(A.boss, w.id, w.seed, w.startsAt, "docks", true)).toMatch(/Next hit <t:\d+:R>/);     // 600 s cooldown
      // a third family, a recruit who joined today, a jailed and a hot defender
      const third = await crew({ cityId: w.cityId });
      expect(await pressHit(third.boss, w.id, w.seed, w.startsAt, "alleys", true)).toContain("Not your war.");
      const recruit = await seedEligibleUser({ wallet: 200_000 });
      await testPrisma.familyMember.create({ data: { familyId: D.f.id, userId: recruit, role: "SOLDIER", roleSlot: recruit, seat: 9 } });
      await testPrisma.family.update({ where: { id: D.f.id }, data: { memberCount: { increment: 1 } } });
      expect(await pressHit(recruit, w.id, w.seed, w.startsAt, "alleys", true)).toContain("Not eligible");
      await testPrisma.user.update({ where: { discordId: D.ub }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
      expect(await pressHit(D.ub, w.id, w.seed, w.startsAt, "alleys", true)).toContain("Not eligible");
      await testPrisma.user.update({ where: { discordId: D.soldiers[0] }, data: { crimeHeat: 100 } });
      const scout = fakeButton(TURF_IDS.scout(w.id), { userId: D.soldiers[0], guildId: null });
      await handleCrimeFamilyInteraction(scout as any);
      expect(replies(scout)).toContain("Not eligible");
      const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
      expect(war).toMatchObject({ atkDocks: 20, atkMain: 0, defDocks: 30 + 12 });
      expect(await testPrisma.warContribution.count({ where: { warId: w.id } })).toBe(4);
      const wallets = await testPrisma.wallet.findMany({ where: { userId: { in: [...A.ids, ...D.ids, recruit, third.boss] } } });
      expect(wallets.reduce((s, x) => s + x.balance, 0)).toBe(6 * 200_000 + 200_000 + 1_000_000 - 4 * 25_000);
      expect(await turfInvariants()).toEqual([]);
    });
  });

  it("a war against the Street: ties go to the defender and the Street keeps a racket the attacker only equalled", async () => {
    await withCfConfig(ON, async () => {
      const { A, up, w } = await liveWar({ street: true, racketKey: "pawn_row" });
      await testPrisma.war.update({ where: { id: w.id }, data: { atkDocks: 30, atkMain: 31, atkAlleys: 30 } });   // Corner baseline 30
      const end = new Date(+w.endsAt + 1000);
      const { beginSettle, settleWar } = await import("../../../src/services/crimeFamily/warService");
      expect(await beginSettle(w.id, end)).toBe(true);
      const s = await settleWar(w.id, end);
      expect(s).toMatchObject({ outcome: "HELD", burned: 2_100_000, refunded: 0 });
      expect((await racket(up.id, "pawn_row")).ownerFamilyId).toBe("");
      expect((await fam(A.f.id)).warWins).toBe(0);
    });
  });
});
// ── A whole Gold season: census growth, rebalancing, bidding with snipes, a full war, income ──
describe("BETA turf: a season in Uptown", () => {
  it("grows 4 → 41 Gold families (Uptown #2 opens, 22/19), snipes a bid war, fights it hit by hit, settles, mints and neglects", async () => {
    await withCfConfig(ON, async () => {
      const valet = racketDef("valet_racket")!;
      const base = nextWarStart(valet, new Date(Date.now() + 8 * DAY));          // the war: a Wednesday 18:00
      const dayAt = (d: number) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + d, 0, 10));
      const C0 = dayAt(-5);
      const up1 = await city("GOLD", 1);
      const c = fakeClient();

      // four real Gold families; D already owns Valet Parking in Uptown #1
      const D = await crew({ level: 8, cityId: up1.id, tag: "DEF", channel: "ch-def", activeAt: new Date(+C0 - H) });
      const A = await crew({ level: 7, earnings: 30_000_000, tag: "ATK", channel: "ch-atk", activeAt: new Date(+C0 - H) });
      const S = await crew({ level: 7, earnings: 30_000_000, tag: "SNP", channel: "ch-snp", activeAt: new Date(+C0 - H) });
      const W = await crew({ level: 7, earnings: 5_000_000, tag: "WEK", channel: "ch-wek", activeAt: new Date(+C0 - H) });
      await testPrisma.racket.update({ where: { cityId_key: { cityId: up1.id, key: "valet_racket" } }, data: { ownerFamilyId: D.f.id, lastPayoutAt: C0 } });
      await bareFamilies(3, { level: 2, activeAt: new Date(+C0 - H) });
      await bareFamilies(2, { level: 5, activeAt: new Date(+C0 - H) });
      const baseline = await vaultBaseline();

      // day 0: everyone placed in their league's #1
      expect((await runTurfCensus(C0)).status).toBe("ran");
      for (const x of [D, A, S, W]) expect((await fam(x.f.id)).cityId).toBe(up1.id);
      expect(await citySizes("BRONZE")).toEqual([3]);
      expect(await citySizes("SILVER")).toEqual([2]);
      expect(await citySizes("GOLD")).toEqual([4]);

      // day 1: 36 more → 40, still one city
      await bareFamilies(36, { level: 9, activeAt: new Date(+dayAt(-4) - H) });
      await runTurfCensus(dayAt(-4));
      expect(await citySizes("GOLD")).toEqual([40]);

      // day 2: the 41st → Uptown #2 opens, the rebalance ends within ±2 of 20.5 and never moves the old four
      await bareFamilies(1, { level: 10, activeAt: new Date(+dayAt(-3) - H) });
      await runTurfCensus(dayAt(-3));
      expect(await citySizes("GOLD")).toEqual([22, 19]);
      for (const x of [D, A, S, W]) expect((await fam(x.f.id)).cityId).toBe(up1.id);
      expect(await turfInvariants(baseline)).toEqual([]);

      // Sunday 18:00: the valet window opens in every OPEN city (incl. the new Uptown #2)
      const w = warWindow(base);
      await tickWars(c.client, w.bidOpensAt);
      const up2 = await city("GOLD", 2);
      const war = await testPrisma.war.findFirstOrThrow({ where: { racketKey: "valet_racket", cityId: up1.id } });
      expect(await testPrisma.war.count({ where: { racketKey: "valet_racket", status: "BIDDING" } })).toBe(4);
      const valet1 = await racket(up1.id, "valet_racket"); const valet2 = await racket(up2.id, "valet_racket");

      // griefing: a stale map's racket in Uptown #2 is refused, nothing debited
      await expect(placeBid({ racketId: valet2.id, actorId: A.boss, amount: 2_100_000, now: new Date(+w.bidOpensAt + H) }))
        .rejects.toThrow("This racket is in Uptown #2. Your family plays in Uptown #1.");
      // the weak family opens at the floor; A outbids by exactly 10%; S snipes in the last second
      await expect(placeBid({ racketId: valet1.id, actorId: W.boss, amount: 2_099_999, now: new Date(+w.bidOpensAt + H) })).rejects.toThrow("floor of 2,100,000");
      await placeBid({ racketId: valet1.id, actorId: W.boss, amount: 2_100_000, now: new Date(+w.bidOpensAt + H) });
      await expect(placeBid({ racketId: valet1.id, actorId: A.ub, amount: 2_309_999, now: new Date(+w.bidOpensAt + 2 * H) })).rejects.toThrow("at least 2,310,000");
      await placeBid({ racketId: valet1.id, actorId: A.ub, amount: 2_310_000, now: new Date(+w.bidOpensAt + 2 * H) });
      expect((await fam(W.f.id)).earnings).toBe(5_000_000);
      await placeBid({ racketId: valet1.id, actorId: S.boss, amount: 2_541_000, now: new Date(+w.bidClosesAt - 1000) });
      await expect(placeBid({ racketId: valet1.id, actorId: A.boss, amount: 3_000_000, now: w.bidClosesAt })).rejects.toThrow("Bidding is not open");
      expect((await fam(A.f.id)).earnings).toBe(30_000_000);
      expect((await fam(S.f.id)).earnings).toBe(30_000_000 - 2_541_000);

      // the census during bidding never moves the owner or the top bidder
      await runTurfCensus(dayAt(-2));
      await runTurfCensus(dayAt(-1));
      expect((await fam(S.f.id)).cityId).toBe(up1.id);
      expect((await fam(D.f.id)).cityId).toBe(up1.id);
      expect(await turfInvariants(baseline)).toEqual([]);

      // close → ARMED (S attacks D); the war-soon DM reaches the 6 fighters once
      await tickWars(c.client, w.bidClosesAt);
      expect(await testPrisma.war.findUniqueOrThrow({ where: { id: war.id } })).toMatchObject({ status: "ARMED", attackerFamilyId: S.f.id, defenderFamilyId: D.f.id });
      await tickWars(c.client, new Date(+base - 14 * M));
      await tickWars(c.client, new Date(+base - 13 * M));
      for (const id of [...S.ids, ...D.ids]) expect(c.dm.get(id)).toBe(1);
      for (const id of [...A.ids, ...W.ids]) expect(c.dm.get(id)).toBeUndefined();
      await expect(levelUp(S.f.id, S.boss, 7)).rejects.toThrow();   // no XP anyway; never a league change mid-war

      // 18:00: ACTIVE, one board per home channel
      await tickWars(c.client, base);
      const live = await testPrisma.war.findUniqueOrThrow({ where: { id: war.id } });
      expect(live.status).toBe("ACTIVE");
      expect(c.calls.filter((x) => x.op === "send").map((x) => x.channelId).sort()).toEqual(["ch-def", "ch-snp"]);

      // the fight: S hits docks and main right; D hits main right; nobody on alleys
      const hit = async (uid: string, block: WarBlockKey, minute: number, right = true) => {
        const now = new Date(+base + minute * M + 5_000);
        const armed = await armHit({ warId: war.id, userId: uid, block, now });
        const good = weakPoint(live.seed, block, slotOf(base, now));
        return answerHit({ hitId: armed.hitId, userId: uid, choice: right ? good : (good + 1) % 4, now: new Date(+now + 3_000) });
      };
      const sc = await scoutWar({ warId: war.id, userId: S.soldiers[0], now: new Date(+base + 30_000) });
      expect(sc.approach).toBeTruthy();
      await expect(scoutWar({ warId: war.id, userId: S.soldiers[0], now: new Date(+base + 60_000) })).rejects.toThrow("Already scouted");
      for (const [m, i] of [[0, 0], [10, 1], [20, 2], [30, 3]] as const) {
        expect((await hit(S.ids[i % 3], "docks", m)).points).toBe(10);
        expect((await hit(S.ids[(i + 1) % 3], "main", m)).points).toBe(10);
      }
      expect((await hit(S.ids[2], "alleys", 40, false)).points).toBe(0);
      expect((await hit(D.ids[0], "main", 1)).points).toBe(12);
      expect((await hit(D.ids[1], "main", 11)).points).toBe(12);

      // mid-war griefing: a third family, a fresh recruit, a leaver, a kick, a disband, a league jump
      await expect(armHit({ warId: war.id, userId: A.boss, block: "docks", now: new Date(+base + 15 * M) })).rejects.toThrow("Not your war.");
      const fresh = await seedEligibleUser({ wallet: 1_000_000 });
      await testPrisma.familyMember.create({ data: { familyId: S.f.id, userId: fresh, role: "SOLDIER", roleSlot: fresh, seat: 9, joinedAt: new Date(+base + 14 * M) } });
      await testPrisma.family.update({ where: { id: S.f.id }, data: { memberCount: { increment: 1 } } });
      await expect(armHit({ warId: war.id, userId: fresh, block: "docks", now: new Date(+base + 15 * M) })).rejects.toThrow("Not eligible");
      await expect(leaveFamily(S.soldiers[0], new Date(+base + 15 * M))).rejects.toThrow("stay until it resolves");
      await expect(kickMember(D.boss, D.soldiers[0], new Date(+base + 15 * M))).rejects.toThrow("No kicks during an active turf war.");
      await expect(disbandFamily(D.boss, "DEF", new Date(+base + 15 * M))).rejects.toThrow("turf war");

      // scores go dark for the last 10 minutes
      expect((await getWarBoardView(war.id, new Date(+base + 49 * M))).blackout).toBe(false);
      const dark = await getWarBoardView(war.id, new Date(+base + 51 * M));
      expect(dark.blackout).toBe(true);
      const board = JSON.stringify(buildWarBoard(dark, "none"));
      expect(board).toContain("?? vs ??");
      expect(board).not.toMatch(/40 vs 30|40 vs 54/);

      // minute ticks to the end and the settlement: docks ATK 40-30, main DEF 40-54, alleys DEF 0-30 → held
      for (let m = 1; m <= 61; m++) await tickWars(c.client, new Date(+base + m * M));
      const done = await testPrisma.war.findUniqueOrThrow({ where: { id: war.id } });
      expect(done).toMatchObject({ status: "RESOLVED", winnerFamilyId: D.f.id, atkDocks: 40, atkMain: 40, atkAlleys: 0, defDocks: 30, defMain: 54, defAlleys: 30 });
      expect((await racket(up1.id, "valet_racket")).ownerFamilyId).toBe(D.f.id);
      for (const id of S.ids) expect((await testPrisma.user.findUniqueOrThrow({ where: { discordId: id } })).crimeHeat).toBe(15);
      expect((await testPrisma.user.findUniqueOrThrow({ where: { discordId: fresh } })).crimeHeat).toBe(0);
      expect((await fam(D.f.id)).xp).toBe(300 + 2 * 5);            // defence XP (S scored on 2 blocks) + 2 correct hits
      expect((await fam(S.f.id)).xp).toBe(8 * 5);
      expect((await fam(S.f.id)).earnings).toBe(30_000_000 - 2_541_000);   // burned, never refunded
      const hitWallets = (await testPrisma.wallet.findMany({ where: { userId: { in: [...S.ids, ...D.ids, fresh] } } })).map((x) => x.id);
      const spent = (await testPrisma.transaction.findMany({ where: { type: "turf_hit", walletId: { in: hitWallets } } })).reduce((s, t) => s + t.amount, 0);
      expect(spent).toBe(-11 * 25_000);
      expect(await turfInvariants(baseline)).toEqual([]);

      // income: D keeps minting 300,000/day (Gold Corner) while 3 members are eligible…
      const t = (d: number) => new Date(+C0 + d * DAY + 5 * M);
      for (const id of D.ids) await seedWarHits(id, D.f.id, 3, { createdAt: new Date(+base + H) });
      await tickRackets(c.client, t(6));
      const minted = await testPrisma.familyLedger.findMany({ where: { familyId: D.f.id, type: "racket_income" } });
      expect(minted.map((l) => l.amount)).toEqual([300_000 * 3]);  // 6 days since C0 bank at most 3 cycles
      // …and 3 neglected days hand it to the Street
      await testPrisma.warHit.deleteMany({ where: { userId: { in: D.ids } } });
      for (const d of [7, 8, 9]) await tickRackets(c.client, t(d));
      const r = await racket(up1.id, "valet_racket");
      expect(r).toMatchObject({ ownerFamilyId: "", neglectStrikes: 0 });
      expect(await turfInvariants(baseline)).toEqual([]);
    });
  }, 120_000);
});

describe("BETA turf: the league shrinks, the flag flips, every league pays its own rate", () => {
  it("81 → 30 active Gold families: Uptown #3 and #2 close after 14 surplus censuses (never while owned), everyone lands in #1", async () => {
    await withCfConfig(ON, async () => {
      const T = new Date("2026-12-01T00:10:00Z");
      const day = (d: number) => new Date(+T + d * DAY);
      const keep = await bareFamilies(30, { level: 8, activeAt: new Date(+T - H) });
      const drop = await bareFamilies(51, { level: 8, activeAt: new Date(+T - H) });
      await runTurfCensus(day(0));
      expect(await citySizes("GOLD")).toEqual([27, 27, 27]);
      const up3 = await city("GOLD", 3);
      // one of the families placed in #3 owns a racket there
      const owner = await testPrisma.family.findFirstOrThrow({ where: { cityId: up3.id } });
      await testPrisma.racket.update({ where: { cityId_key: { cityId: up3.id, key: "pawn_row" } }, data: { ownerFamilyId: owner.id } });
      // 51 families stop playing; the rest keep playing every day
      await testPrisma.warHit.deleteMany({ where: { familyId: { in: drop.map((x) => x.f.id) } } });
      for (let d = 1; d <= 16; d++) {
        await testPrisma.warHit.updateMany({ where: { familyId: { in: keep.map((x) => x.f.id) } }, data: { createdAt: new Date(+day(d) - H) } });
        expect((await runTurfCensus(day(d))).status).toBe("ran");
      }
      // #3 is owned: it never closes, and the rule only ever closes the highest-numbered OPEN city, so #2 stays too
      expect((await testPrisma.turfCity.findMany({ where: { league: "GOLD" }, orderBy: { number: "asc" } })).map((c) => c.status)).toEqual(["OPEN", "OPEN", "OPEN"]);
      expect(await turfInvariants()).toEqual([]);
      // the owner loses the racket: both surplus cities close at the next census and their active families are re-placed
      await testPrisma.racket.update({ where: { cityId_key: { cityId: up3.id, key: "pawn_row" } }, data: { ownerFamilyId: "" } });
      await testPrisma.warHit.updateMany({ where: { familyId: { in: keep.map((x) => x.f.id) } }, data: { createdAt: new Date(+day(17) - H) } });
      const up1 = await city("GOLD", 1);
      const displaced = await testPrisma.family.count({ where: { id: { in: keep.map((x) => x.f.id) }, cityId: { not: up1.id } } });
      const last = await runTurfCensus(day(17));
      expect((await testPrisma.turfCity.findMany({ where: { league: "GOLD" }, orderBy: { number: "asc" } })).map((c) => c.status)).toEqual(["OPEN", "CLOSED", "CLOSED"]);
      expect(await citySizes("GOLD")).toEqual([30]);
      // every active family that lost its city got exactly one "New city" notice batch
      const closedIds = (await testPrisma.turfCity.findMany({ where: { league: "GOLD", status: "CLOSED" } })).map((c) => c.id);
      expect(await testPrisma.family.count({ where: { cityId: { in: closedIds } } })).toBe(0);
      expect(displaced).toBeGreaterThan(0);
      expect(last.notices).toHaveLength(displaced);                 // one "New city" batch per re-placed family
      expect(await turfInvariants()).toEqual([]);
    });
  }, 120_000);

  it("turf off mid-season: bids refused on every route, a closing bid war refunds, a running war still settles, no census or income; back on resumes", async () => {
    const low = await city("BRONZE", 1);
    const a = await crew({ level: 2, cityId: low.id, earnings: 5_000_000, activeAt: new Date() });
    const b = await crew({ level: 2, cityId: low.id, earnings: 5_000_000, activeAt: new Date() });
    const base = await vaultBaseline();
    const bidding = await seedWar({ racketKey: "docks_numbers", cityId: low.id, status: "BIDDING", startsAt: new Date(Date.now() + 2 * H) });
    const r = await racket(low.id, "docks_numbers");
    await withCfConfig(ON, async () => { await placeBid({ racketId: r.id, actorId: a.boss, amount: 700_000 }); });
    const live = await seedWar({ racketKey: "pawn_row", cityId: low.id, status: "ACTIVE", startsAt: new Date(Date.now() - 61 * M), topBid: 700_000, topBidderFamilyId: b.f.id });
    await testPrisma.racket.update({ where: { cityId_key: { cityId: low.id, key: "valet_racket" } }, data: { ownerFamilyId: b.f.id, lastPayoutAt: new Date(Date.now() - 2 * DAY) } });
    const c = fakeClient();
    await withCfConfig({ enabled: true, turfEnabled: false }, async () => {
      const m = fakeModal(TURF_IDS.bidModal(r.id, b.boss), { amount: "1m" }, { userId: b.boss });
      await handleCrimeFamilyInteraction(m as any);
      expect(replies(m)).toContain("Turf wars are not open in this server yet.");
      const dm = fakeModal(TURF_IDS.bidModal(r.id, b.boss), { amount: "1m" }, { userId: b.boss, guildId: null });
      await handleCrimeFamilyInteraction(dm as any);
      expect(replies(dm)).toContain("Turf wars are not open in this server yet.");
      // the bid war passes its close while turf is off: cancelled, escrow home
      await testPrisma.war.update({ where: { id: bidding.id }, data: { bidClosesAt: new Date(Date.now() - 1000) } });
      await tickWars(c.client, new Date());
      expect(await testPrisma.war.findUniqueOrThrow({ where: { id: bidding.id } })).toMatchObject({ status: "CANCELLED" });
      expect((await fam(a.f.id)).earnings).toBe(5_000_000);
      // the war already running settles (T1)
      expect((await testPrisma.war.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("RESOLVED");
      // no income, no strikes, no census placement while off
      await tickRackets(c.client, new Date());
      expect((await racket(low.id, "valet_racket")).neglectStrikes).toBe(0);
      expect(await testPrisma.familyLedger.count({ where: { type: "racket_income" } })).toBe(0);
    });
    await withCfConfig(ON, async () => {
      await tickRackets(c.client, new Date());
      expect((await testPrisma.familyLedger.findFirstOrThrow({ where: { type: "racket_income" } })).amount).toBe(2 * 100_000);   // Bronze Corner, 2 cycles
    });
    expect(await turfInvariants(base)).toEqual([]);
  });

  it("racket income per league and class: Bronze 100k/200k/300k, Silver 200k/450k/850k, Gold 300k/650k/1.3M a cycle", async () => {
    await withCfConfig(ON, async () => {
      const c = fakeClient();
      const now = new Date();
      const want: Record<string, Record<string, number>> = {
        BRONZE: { docks_numbers: 100_000, harbor_customs: 200_000, casino_row: 300_000 },
        SILVER: { docks_numbers: 200_000, harbor_customs: 450_000, casino_row: 850_000 },
        GOLD: { docks_numbers: 300_000, harbor_customs: 650_000, casino_row: 1_300_000 },
      };
      const level: Record<string, number> = { BRONZE: 2, SILVER: 5, GOLD: 9 };
      for (const league of Object.keys(want)) {
        const cty = await city(league, 1);
        for (const key of Object.keys(want[league])) {
          const x = await crew({ level: level[league], cityId: cty.id, activeAt: now });
          await testPrisma.racket.update({ where: { cityId_key: { cityId: cty.id, key } }, data: { ownerFamilyId: x.f.id, lastPayoutAt: new Date(+now - DAY - M) } });
        }
      }
      await tickRackets(c.client, now);
      for (const league of Object.keys(want)) {
        const cty = await city(league, 1);
        for (const [key, amount] of Object.entries(want[league])) {
          const r = await racket(cty.id, key);
          const row = await testPrisma.familyLedger.findFirstOrThrow({ where: { familyId: r.ownerFamilyId, type: "racket_income" } });
          expect(row.amount, `${league} ${key}`).toBe(amount);
          expect((await fam(r.ownerFamilyId)).xp).toBe(20);
        }
      }
    });
  }, 60_000);
});

describe("BETA turf: races between the jobs and the players", () => {
  it("BUG-TURF-2: a soldier who presses Hit while leaving walks out of the family with an armed hit that still scores for it (edge 32 bypass)", async () => {
    await withCfConfig(ON, async () => {
      for (let n = 0; n < 4; n++) {
        await resetFamilies(); await seedTurf();
        const up = await city("GOLD", 1);
        const A = await crew({ cityId: up.id, wallet: 200_000, size: 4 });
        const w = await seedWar({ racketKey: "docks_numbers", cityId: up.id, status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: A.f.id });
        const who = A.soldiers[1];
        const [armed] = await Promise.allSettled([armHit({ warId: w.id, userId: who, block: "docks" }), leaveFamily(who)]);
        if (armed.status === "fulfilled") {
          // the ex-member answers right: +10 lands on the family's block although they are no longer in it
          const right = weakPoint(w.seed, "docks", slotOf(w.startsAt, new Date()));
          await answerHit({ hitId: armed.value.hitId, userId: who, choice: right }).catch(() => undefined);
        }
        const member = await testPrisma.familyMember.findUnique({ where: { userId: who } });
        const fought = await testPrisma.warContribution.count({ where: { warId: w.id, userId: who } });
        const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
        // invariant: whoever fought in a live war is still in the family; a non-member never scores
        expect(member !== null || fought === 0, `round ${n}: left with a contribution, atkDocks=${war.atkDocks}`).toBe(true);
      }
    });
  }, 120_000);

  it("the owner's league-changing level-up racing the tick that arms a war on its racket: never a Silver family defending a Bronze racket", async () => {
    await withCfConfig(ON, async () => {
      for (let n = 0; n < 6; n++) {
        await resetFamilies(); await seedTurf();
        const low = await city("BRONZE", 1);
        const D = await crew({ level: 3, cityId: low.id, earnings: 20_000_000 });
        await testPrisma.family.update({ where: { id: D.f.id }, data: { xp: 10_000 } });
        const A = await crew({ level: 2, cityId: low.id });
        await testPrisma.racket.update({ where: { cityId_key: { cityId: low.id, key: "docks_numbers" } }, data: { ownerFamilyId: D.f.id } });
        const w = await seedWar({ racketKey: "docks_numbers", cityId: low.id, status: "BIDDING", startsAt: new Date(Date.now() + 30 * M), topBid: 700_000, topBidderFamilyId: A.f.id });
        await testPrisma.war.update({ where: { id: w.id }, data: { bidClosesAt: new Date(Date.now() - 1000) } });
        const { closeBidding } = await import("../../../src/services/crimeFamily/warService");
        const ops = [() => closeBidding(w.id, new Date(), true), () => levelUp(D.f.id, D.boss, 3)];
        const res = await Promise.allSettled(n % 2 ? [ops[1](), ops[0]()] : [ops[0](), ops[1]()]);
        const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
        const f = await fam(D.f.id);
        expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(war.status).toBe("ARMED");
        if (f.level === 4) expect(war.defenderFamilyId).toBe("");
        else expect(war.defenderFamilyId).toBe(D.f.id);
        expect(await turfInvariants()).toEqual([]);
      }
    });
  }, 120_000);
});
