import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { BOT_DEVELOPER_ID } from "../../src/utils/developerAccess";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { depositToVault } from "../../src/services/crimeFamily/vaultService";
import { executePayday } from "../../src/services/crimeFamily/paydayService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { planCaper, cancelCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, resetUser, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution } from "../helpers";
import { caperCrew, G, CH } from "../crimeFamily/caperFixtures";
import { armHit } from "../../src/services/crimeFamily/warActions";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { collectRacket } from "../../src/services/crimeFamily/racketService";

// D34: testers get no Crime Families bypass. Every fee, tax, cap, interval
// and gate applies to an allowlisted developer exactly as to anyone else.

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const create = () => createFamily({ uid: BOT_DEVELOPER_ID, username: "dev", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" });

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("testers get no family bypass (D34)", () => {
  it("createFamily debits the full 10,000,000", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000 });
    await create();
    expect(await wallet(BOT_DEVELOPER_ID)).toBe(30_000_000);
  });

  it("depositToVault charges 5% and holds the daily cap", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000 });
    const f = await seedFamily({ bossId: BOT_DEVELOPER_ID });
    const day = new Date("2026-11-04T10:00:00Z");
    expect(await depositToVault(BOT_DEVELOPER_ID, 20_000_000, day)).toMatchObject({ tax: 1_000_000, net: 19_000_000 });
    await expect(depositToVault(BOT_DEVELOPER_ID, 5_000_001, day)).rejects.toThrow(/cap/i);
    expect(await wallet(BOT_DEVELOPER_ID)).toBe(20_000_000);
    expect(await testPrisma.family.findUnique({ where: { id: f.id } })).toMatchObject({ treasury: 19_000_000 });
  });

  it("executePayday refuses before 7 days", async () => {
    const rule = { key: "test", label: "test seats", need: 1, count: async () => 1 };
    ACTIVITY_RULES.push(rule);
    try {
      await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 0 });
      const soldier = await seedEligibleUser();
      const f = await seedFamily({
        bossId: BOT_DEVELOPER_ID, earnings: 3_000_000, lastPaydayAt: daysAgo(6),
        members: [{ userId: soldier, role: "SOLDIER", joinedAt: daysAgo(10) }],
      });
      expect(await executePayday(f.id, BOT_DEVELOPER_ID, { earnings: 3_000_000, count: 2 })).toMatchObject({ status: "changed", reason: "Payday is not due yet." });
      expect(await wallet(BOT_DEVELOPER_ID)).toBe(0);
    } finally {
      ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(rule), 1);
    }
  });

  it("a failing gate still fails", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000, shifts: 59 });
    await expect(create()).rejects.toThrow(/shifts/i);
    expect(await wallet(BOT_DEVELOPER_ID)).toBe(40_000_000);
  });

  it("no crime family service imports isTester", () => {
    const dir = path.join(__dirname, "../../src/services/crimeFamily");
    const offenders = fs.readdirSync(dir).filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("isTester"));
    expect(offenders).toEqual([]);
  });
});

describe("capers treat testers like everyone else", () => {
  const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
  const bal = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  const plan = (uid: string) => planCaper({ uid, tier: 1, guildId: G, channelId: CH });
  beforeEach(async () => { await resetFamilies(); await resetUser(BOT_DEVELOPER_ID); });

  it("the stake, the family cooldown and the 2-seat cap all apply to BOT_DEVELOPER_ID", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1], plannerId: BOT_DEVELOPER_ID });
    const dev = f.ids.MASTERMIND;
    expect(dev).toBe(BOT_DEVELOPER_ID);
    const before = await bal(dev);
    const c = await plan(dev);
    expect(await bal(dev)).toBe(before - 50_000);
    await cancelCaper(c.id, dev);                                          // sets nextCaperAt = now + 1,800 s
    await expect(plan(dev)).rejects.toThrow(/^Family crew heist cooldown: ready <t:\d+:R>\.$/);
    await testPrisma.family.update({ where: { id: f.family.id }, data: { nextCaperAt: new Date() } });
    for (const k of [1, 2]) await testPrisma.caperCrew.create({ data: { caperId: `65f00000000000000000000${k}`, familyId: f.family.id, userId: dev, role: "MASTERMIND", liveSlot: `65f00000000000000000000${k}`, stake: 50_000, started: true, startedAt: new Date(Date.now() - k * 3_600_000) } });
    await expect(plan(dev)).rejects.toThrow(/^You've used both crew heist seats in the last 24 hours\. A seat frees <t:\d+:R>\.$/);
  });

  it("no Crime Families service and no caper UI module reads isTester", () => {
    const src = path.join(__dirname, "../../src");
    const files = [
      ...fs.readdirSync(path.join(src, "services/crimeFamily")).map((f) => path.join(src, "services/crimeFamily", f)),
      ...fs.readdirSync(path.join(src, "ui/crimeFamily")).filter((f) => f.startsWith("caper")).map((f) => path.join(src, "ui/crimeFamily", f)),
    ];
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toContain("isTester");
  });
});

describe("turf gives the tester no shortcut (D34)", () => {
  const balance = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  async function testerAtWar() {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 1_000_000 });
    const f = await seedFamily({ bossId: await seedEligibleUser(), level: 1, homeGuildId: "g1", members: [{ userId: BOT_DEVELOPER_ID, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedRacket("docks_numbers");
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: f.id, defenderFamilyId: "" });
    return { f, w };
  }
  beforeAll(() => ensureUniqueIndexes(["Racket", "War", "WarContribution"]));
  beforeEach(async () => { await resetFamilies(); await resetUser(BOT_DEVELOPER_ID); });   // resetFamilies keeps users; each test re-seeds the tester

  it("a hit debits 25,000 and the 600 s cooldown applies", async () => {
    const { w } = await testerAtWar();
    const now = new Date();
    await armHit({ warId: w.id, userId: BOT_DEVELOPER_ID, block: "docks", now });
    expect(await balance(BOT_DEVELOPER_ID)).toBe(975_000);
    await expect(armHit({ warId: w.id, userId: BOT_DEVELOPER_ID, block: "main", now: new Date(+now + 599_000) })).rejects.toThrow(/^Next hit <t:\d+:R>\.$/);
    expect(await balance(BOT_DEVELOPER_ID)).toBe(975_000);
  });

  it("a seventh hit is refused with nothing debited", async () => {
    const { f, w } = await testerAtWar();
    await seedContribution({ warId: w.id, familyId: f.id, userId: BOT_DEVELOPER_ID, side: "ATK", hits: 6 });
    await expect(armHit({ warId: w.id, userId: BOT_DEVELOPER_ID, block: "docks" })).rejects.toThrow("You've used all 6 hits in this war.");
    expect(await balance(BOT_DEVELOPER_ID)).toBe(1_000_000);
  });

  it("a tester Boss gets no racket cycle early and no bid below the floor", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 1_000_000 });
    const f = await seedFamily({ bossId: BOT_DEVELOPER_ID, level: 4, earnings: 9_000_000 });   // L4: racketCap 2, so the held racket leaves room to bid
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 3600_000) });
    expect(await collectRacket(r.id, new Date(), 3)).toMatchObject({ status: "skipped", amount: 0 });
    await seedWar({ racketKey: "valet_racket", status: "BIDDING" });
    await expect(placeBid({ racketKey: "valet_racket", actorId: BOT_DEVELOPER_ID, amount: 2_099_999 })).rejects.toThrow("Bid at least the floor of 2,100,000.");
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.earnings).toBe(9_000_000);
  });
});
