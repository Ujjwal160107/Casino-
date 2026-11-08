// Crime Families beta, MONEY area: every path that moves fortunes between
// wallets, the two vault buckets, escrows and burns, driven through the real
// services and the real crew:/cpr: routing, with a strict balance sheet
// (money.helpers.ts) checked around each scenario.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { handleCrimeFamilyInteraction } from "../../../src/handlers/crimeFamilyRouter";
import { CREW_IDS } from "../../../src/ui/crimeFamily/ids";
import { CRIME_FAMILY_CONFIG, MAX_SAFE_BALANCE } from "../../../src/utils/economyConfig";
import { depositToVault, resolveDepositAmount, chargeDues, creditEarnings, spendFromVault, arrearsOwed } from "../../../src/services/crimeFamily/vaultService";
import { executePayday, payPaydayShares, previewPayday, resumeUnpaidShares } from "../../../src/services/crimeFamily/paydayService";
import { levelUp } from "../../../src/services/crimeFamily/progression";
import { disbandFamily, previewDisband } from "../../../src/services/crimeFamily/disbandService";
import { acceptInvite, inviteMember, kickMember, leaveFamily } from "../../../src/services/crimeFamily/membershipService";
import { ACTIVITY_RULES } from "../../../src/services/crimeFamily/extensions";
import { runFamilyTx } from "../../../src/services/crimeFamily/tx";
import { fakeButton, fakeModal, fakeSelect, said } from "../fakeInteraction";
import { caperCrew, fakeCaperClient, scriptedRng, seedRunning, G, CH } from "../caperFixtures";
import { planCaper, joinCaper, leaveCaper, startCaper } from "../../../src/services/crimeFamily/caperLobbyService";
import { resolveCaper } from "../../../src/services/crimeFamily/caperSettleService";
import { parseAnswers } from "../../../src/services/crimeFamily/intelRing";
import { CPR_IDS } from "../../../src/ui/crimeFamily/ids";
import { collectRacket } from "../../../src/services/crimeFamily/racketService";
import { placeBid } from "../../../src/services/crimeFamily/bidService";
import { closeBidding, settleWar } from "../../../src/services/crimeFamily/warService";
import { autoPayday, chargeFamilyDues } from "../../../src/services/crimeFamily/scheduler";
import { fakeClient } from "../fakeClient";
import { seedRacket, seedWar, turfCity } from "../../helpers";
import { testPrisma, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig } from "../../helpers";
import {
  player, track, resetTracked, sheet, expectConserved, conserved, expectLedgerChain, walletOf, familyOf, ledgerRows,
} from "./money.helpers";

// Credit failure injection for the two-phase payday (only this file's module graph).
const fail = vi.hoisted(() => ({ calls: 0, on: new Set<number>(), all: false }));
vi.mock("../../../src/services/walletService", async (orig) => {
  const real = await orig<typeof import("../../../src/services/walletService")>();
  return {
    ...real,
    creditWalletInTx: vi.fn(async (...a: Parameters<typeof real.creditWalletInTx>) => {
      if (a[4] === "family_payday") {
        fail.calls += 1;
        if (fail.all || fail.on.has(fail.calls)) throw new Error(`injected payday credit failure ${fail.calls}`);
      }
      return real.creditWalletInTx(...a);
    }),
  };
});
const resetFail = () => { fail.calls = 0; fail.on.clear(); fail.all = false; };

// Payday activity: members in `active` count as active (2 seats) without running capers.
const active = new Set<string>();
const rule = { key: "beta_money", label: "beta seats", need: 2, count: async (uid: string) => (active.has(uid) ? 2 : 0) };

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "PaydayShare", "Caper", "CaperCrew"]));
beforeEach(async () => {
  await resetFamilies();
  resetTracked();
  resetFail();
  active.clear();
  ACTIVITY_RULES.push(rule);
});
afterEach(() => {
  const i = ACTIVITY_RULES.indexOf(rule);
  if (i >= 0) ACTIVITY_RULES.splice(i, 1);
  resetFail();
});

const press = async (customId: string, userId: string, o: { ephemeralSource?: boolean } = {}) => {
  const i = fakeButton(customId, { userId, ephemeralSource: o.ephemeralSource ?? true });
  await handleCrimeFamilyInteraction(i as any);
  return i;
};
const submit = async (kind: "deposit" | "rename" | "disband", userId: string, fields: Record<string, string>) => {
  const i = fakeModal(CREW_IDS.modal(kind, userId), fields, { userId });
  await handleCrimeFamilyInteraction(i as any);
  return i;
};

/** A due family: Boss + `n` active Soldiers with 10 days of tenure; every member payday-eligible. */
async function payFamily(earnings: number, n = 2, o: { treasury?: number; level?: number; tag?: string; wallet?: number } = {}) {
  const bossId = await player({ wallet: o.wallet ?? 0 });
  const soldiers: string[] = [];
  for (let k = 0; k < n; k++) soldiers.push(await player({ wallet: o.wallet ?? 0 }));
  for (const u of [bossId, ...soldiers]) active.add(u);
  const family = await seedFamily({
    bossId, earnings, treasury: o.treasury ?? 0, level: o.level ?? 1, lastPaydayAt: daysAgo(8), ...(o.tag ? { tag: o.tag } : {}),
    members: soldiers.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
  });
  return { family, bossId, soldiers, all: [bossId, ...soldiers] };
}

// ── Deposits ─────────────────────────────────────────────────────────────────

describe("deposits: amount parsing through the Deposit modal", () => {
  const cases: [string, number | null, RegExp | null][] = [
    ["-5", null, /Enter a positive amount/],
    ["0", null, /Enter a positive amount/],
    ["1e20", null, /Enter a positive amount/],
    ["NaN", null, /Enter a positive amount/],
    ["Infinity", null, /Enter a positive amount/],
    ["0x10", null, /Enter a positive amount/],
    ["", null, /Enter a positive amount/],
    ["5,000,000", 5_000_000, null],
    ["5k", null, /Minimum deposit is 10,000/],
    ["10k", 10_000, null],
    ["1.5m", 1_500_000, null],
    ["  2m  ", 2_000_000, null],
    ["99999999999999999999", null, /Daily deposit cap reached \(25,000,000 left today\)/],
    [String(MAX_SAFE_BALANCE + 1), null, /Daily deposit cap reached/],
    ["25000001", null, /Daily deposit cap reached/],
  ];
  it.each(cases)("deposit %j → %s", async (raw, expected, refusal) => {
    const boss = await player({ wallet: 30_000_000 });
    const f = await seedFamily({ bossId: boss });
    const before = await sheet();
    const i = await submit("deposit", boss, { amount: raw });
    expectConserved(before, await sheet());
    const fam = (await familyOf(f.id))!;
    if (expected === null) {
      expect(said(i)).toMatch(refusal!);
      expect(await walletOf(boss)).toBe(30_000_000);
      expect(fam.treasury).toBe(0);
      expect(await ledgerRows(f.id)).toHaveLength(0);
      expect((await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).depositedToday).toBe(0);
    } else {
      const tax = Math.floor(expected * 0.05);
      expect(said(i)).toContain(`(${tax.toLocaleString("en-US")} tax burned)`);
      expect(await walletOf(boss)).toBe(30_000_000 - expected);
      expect(fam.treasury).toBe(expected - tax);
      await expectLedgerChain(f.id, { treasury: 0, earnings: 0 });
    }
  });

  it("a fractional amount is floored, never rounded up past the wallet", async () => {
    const boss = await player({ wallet: 10_000 });
    const f = await seedFamily({ bossId: boss });
    await submit("deposit", boss, { amount: "10000.99" });
    expect(await walletOf(boss)).toBe(0);
    expect((await familyOf(f.id))!.treasury).toBe(9_500);
  });

  it("BUG-MONEY-1: '8.03m' deposits 8,030,000 (parseSmartAmount's float multiply takes 8,029,999)", async () => {
    const boss = await player({ wallet: 20_000_000 });
    await seedFamily({ bossId: boss });
    expect(await resolveDepositAmount(boss, "8.03m", new Date())).toBe(8_030_000);
    expect(await resolveDepositAmount(boss, "2.01m", new Date())).toBe(2_010_000);
    const i = await submit("deposit", boss, { amount: "8.03m" });
    expect(said(i)).toContain("Deposited 7,628,500");
    expect(await walletOf(boss)).toBe(20_000_000 - 8_030_000);
  });

  it("a wallet of exactly the amount deposits and empties; one fortune short is refused with nothing written", async () => {
    const boss = await player({ wallet: 1_000_000 });
    const f = await seedFamily({ bossId: boss });
    const short = await submit("deposit", boss, { amount: "1000001" });
    expect(said(short)).toContain("Insufficient funds.");
    expect(await ledgerRows(f.id)).toHaveLength(0);
    expect(await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).toMatchObject({ depositedToday: 0, deposited: 0, depositDayKey: "" });
    await conserved(() => submit("deposit", boss, { amount: "1m" }));
    expect(await walletOf(boss)).toBe(0);
    expect((await familyOf(f.id))!.treasury).toBe(950_000);
    expect(await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).toMatchObject({ depositedToday: 1_000_000, deposited: 1_000_000 });
  });

  it("'all' takes the whole part of a fractional wallet, and 'all' with nothing left today is the cap refusal", async () => {
    const boss = await player({ wallet: 0 });
    const f = await seedFamily({ bossId: boss });
    await testPrisma.wallet.update({ where: { userId: boss }, data: { balance: 30_000_000.75 } });
    await submit("deposit", boss, { amount: "all" });
    expect(await walletOf(boss)).toBeCloseTo(5_000_000.75, 5);
    expect((await familyOf(f.id))!.treasury).toBe(23_750_000);
    const again = await submit("deposit", boss, { amount: "max" });
    expect(said(again)).toContain("Daily deposit cap reached (0 left today).");
  });

  it("odd amounts burn floor(5%) and every ledger row matches the vault", async () => {
    const boss = await player({ wallet: 5_000_000 });
    const f = await seedFamily({ bossId: boss });
    await conserved(async () => {
      for (const amt of [10_019, 10_001, 333_333, 19_999]) await depositToVault(boss, amt);
    });
    const taxes = [500, 500, 16_666, 999];
    const rows = await ledgerRows(f.id, "deposit_tax");
    expect(rows.map((r) => (r.meta as any).burned)).toEqual(taxes);
    expect((await familyOf(f.id))!.treasury).toBe(10_019 + 10_001 + 333_333 + 19_999 - taxes.reduce((a, b) => a + b, 0));
    await expectLedgerChain(f.id, { treasury: 0, earnings: 0 });
  });

  it("two Deposit modal submits at once with a wallet for one: one lands, the other charges nothing", async () => {
    const boss = await player({ wallet: 3_000_000 });
    const f = await seedFamily({ bossId: boss });
    const before = await sheet();
    const [a, b] = await Promise.all([submit("deposit", boss, { amount: "2m" }), submit("deposit", boss, { amount: "2m" })]);
    expectConserved(before, await sheet());
    expect([said(a), said(b)].filter((s) => s.includes("Deposited 1,900,000"))).toHaveLength(1);
    expect(await walletOf(boss)).toBe(1_000_000);
    expect((await familyOf(f.id))!.treasury).toBe(1_900_000);
    expect(await ledgerRows(f.id, "deposit")).toHaveLength(1);
  });

  it("five members deposit, dues charge and an earnings credit land at once: conserved, one row per move", async () => {
    const boss = await player({ wallet: 2_000_000 });
    const ms = [await player({ wallet: 2_000_000 }), await player({ wallet: 2_000_000 }), await player({ wallet: 2_000_000 }), await player({ wallet: 2_000_000 })];
    const f = await seedFamily({ bossId: boss, level: 3, earnings: 50_000, members: ms.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
    const before = await sheet();
    const rs = await Promise.allSettled([
      ...[boss, ...ms].map((u) => depositToVault(u, 1_000_000)),
      chargeDues(f.id, new Date()),
      runFamilyTx((tx) => creditEarnings(tx, f.id, 77_777, "racket_income", "system", {}, { xp: 20 })),
    ]);
    expectConserved(before, await sheet());
    const failed = rs.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const r of failed) expect(String(r.reason?.message)).toMatch(/Vault busy/);
    const fam = (await familyOf(f.id))!;
    const deposits = await ledgerRows(f.id, "deposit");
    const dues = await ledgerRows(f.id, "dues");
    expect(fam.treasury + fam.earnings).toBe(50_000 + deposits.length * 950_000 + (await ledgerRows(f.id, "racket_income")).length * 77_777 - dues.length * 120_000);
  });

  it("a deposit racing the depositor's leave: either the deposit lands (and stays) or nothing is charged", async () => {
    for (let k = 0; k < 3; k++) {
      await resetFamilies();
      const boss = await player();
      const m = await player({ wallet: 1_000_000 });
      const f = await seedFamily({ bossId: boss, members: [{ userId: m, role: "SOLDIER", joinedAt: daysAgo(10) }] });
      const before = await sheet();
      const [dep, left] = await Promise.allSettled([depositToVault(m, 500_000), leaveFamily(m)]);
      expectConserved(before, await sheet());
      const fam = (await familyOf(f.id))!;
      if (dep.status === "fulfilled") expect(fam.treasury).toBe(475_000);
      else expect(await walletOf(m)).toBe(1_000_000);
      expect(left.status).toBe("fulfilled");
      expect(await testPrisma.familyMember.count({ where: { familyId: f.id } })).toBe(1);
    }
  });

  it("leaving right after a deposit refunds nothing and the money stays locked in the treasury", async () => {
    const boss = await player();
    const m = await player({ wallet: 1_000_000 });
    const f = await seedFamily({ bossId: boss, members: [{ userId: m, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await conserved(async () => { await depositToVault(m, 1_000_000); await leaveFamily(m); });
    expect(await walletOf(m)).toBe(0);
    expect((await familyOf(f.id))!.treasury).toBe(950_000);
  });

  it("a jailed member's Deposit modal is refused and charges nothing", async () => {
    const boss = await player({ wallet: 1_000_000, jailedUntil: new Date(Date.now() + 3_600_000) });
    const f = await seedFamily({ bossId: boss });
    const i = await submit("deposit", boss, { amount: "100k" });
    expect(said(i)).toMatch(/jail/i);
    expect(await walletOf(boss)).toBe(1_000_000);
    expect((await familyOf(f.id))!.treasury).toBe(0);
  });
});

// ── Payday ───────────────────────────────────────────────────────────────────

const later = () => new Date(Date.now() + 61_000);   // past paydayShareResumeSeconds

describe("payday: the two-phase PaydayShare", () => {
  it("a Confirm double press through the router pays once; the ledger and wallets match to the fortune", async () => {
    const { family, bossId, all } = await payFamily(1_000_001, 2);
    const id = CREW_IDS.paydayOk(1_000_001, 3, bossId);
    const before = await sheet();
    const [a, b] = await Promise.all([press(id, bossId), press(id, bossId)]);
    expectConserved(before, await sheet());
    expect([said(a), said(b)].filter((s) => s.includes("Paid 3 members"))).toHaveLength(1);
    for (const u of all) expect(await walletOf(u)).toBe(316_667);   // gross 333,333 − tax 16,666
    expect((await familyOf(family.id))!.earnings).toBe(2);
    expect(await testPrisma.paydayShare.count({ where: { familyId: family.id } })).toBe(3);
    await expectLedgerChain(family.id, { treasury: 0, earnings: 1_000_001 });
  });

  it("a manual press racing the automatic payday pays one payday", async () => {
    const { family, bossId, all } = await payFamily(3_000_000, 2);
    await testPrisma.family.update({ where: { id: family.id }, data: { lastPaydayAt: daysAgo(9) } });
    const before = await sheet();
    const rs = await Promise.allSettled([
      executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 }),
      executePayday(family.id, "system", null),
      executePayday(family.id, "system", null),
    ]);
    expectConserved(before, await sheet());
    expect(rs.filter((r) => r.status === "fulfilled" && r.value.status === "paid")).toHaveLength(1);
    for (const u of all) expect(await walletOf(u)).toBe(950_000);
    expect(await ledgerRows(family.id, "payday")).toHaveLength(1);
  });

  it("a payday racing a deposit: the deposit lands in the treasury and the payday still pays the previewed earnings", async () => {
    const { family, bossId, soldiers } = await payFamily(3_000_000, 2, { wallet: 5_000_000 });
    const before = await sheet();
    const [pay, dep] = await Promise.all([
      executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 }),
      depositToVault(soldiers[0], 2_000_000),
    ]);
    expectConserved(before, await sheet());
    expect(pay.status).toBe("paid");
    expect(dep.net).toBe(1_900_000);
    expect(await familyOf(family.id)).toMatchObject({ treasury: 1_900_000, earnings: 0 });
    expect(await walletOf(soldiers[0])).toBe(5_000_000 - 2_000_000 + 950_000);
    await expectLedgerChain(family.id, { treasury: 0, earnings: 3_000_000 });
  });

  it("a crash between reserve and credit holds the money in shares; the resume job pays each once, racing a manual payer", async () => {
    const { family, bossId, all } = await payFamily(3_000_000, 2);
    const before = await sheet();
    fail.all = true;
    const r = await executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 });
    expect(r).toMatchObject({ status: "paid", paid: [] });
    expectConserved(before, await sheet());                       // 2,850,000 sits in unpaid shares, 150,000 burned
    for (const u of all) expect(await walletOf(u)).toBe(0);
    resetFail();
    const runKey = (r as any).runKey as string;
    const [x, y, z] = await Promise.all([resumeUnpaidShares(later()), payPaydayShares(runKey), resumeUnpaidShares(later())]);
    expect(x.length + y.length + z.length).toBe(3);
    expectConserved(before, await sheet());
    for (const u of all) expect(await walletOf(u)).toBe(950_000);
    expect(await resumeUnpaidShares(later())).toEqual([]);
  });

  it("a member who leaves between reserve and credit is paid once; a member who joins mid-payday is not", async () => {
    const { family, bossId, soldiers } = await payFamily(3_000_000, 2);
    const late = await player({ wallet: 2_000_000 });
    await withCfConfig({ enabled: true }, () => inviteMember({ inviterId: bossId, inviteeId: late, guildId: "g1", channelId: "c1" }));
    const before = await sheet();
    fail.all = true;
    const r = await executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 });
    resetFail();
    await leaveFamily(soldiers[0]);
    const inv = await testPrisma.familyInvite.findFirst({ where: { inviteeId: late, status: "PENDING" } });
    if (inv) await acceptInvite(inv.id, late);
    await payPaydayShares((r as any).runKey);
    expectConserved(before, await sheet());
    expect(await walletOf(soldiers[0])).toBe(950_000);
    expect(await walletOf(late)).toBe(2_000_000);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: late } })).toMatchObject({ familyId: family.id });
    expect(await testPrisma.paydayShare.count({ where: { runKey: (r as any).runKey } })).toBe(3);
  });

  it("an ineligible member is named and not paid; the remainder of an uneven split stays in earnings", async () => {
    const { family, bossId, all } = await payFamily(2_000_000, 2);
    const newbie = await player();
    await testPrisma.familyMember.create({ data: { familyId: family.id, userId: newbie, role: "SOLDIER", roleSlot: newbie, seat: 9, joinedAt: daysAgo(2) } });
    await testPrisma.family.update({ where: { id: family.id }, data: { memberCount: 4 } });
    active.add(newbie);
    const p = await previewPayday(family.id);
    expect(p).toMatchObject({ count: 3, split: { gross: 666_666, tax: 33_333, net: 633_333 } });
    expect(p.ineligible.map((x) => x.userId)).toEqual([newbie]);
    await conserved(() => executePayday(family.id, bossId, { earnings: 2_000_000, count: 3 }));
    for (const u of all) expect(await walletOf(u)).toBe(633_333);
    expect(await walletOf(newbie)).toBe(0);
    expect((await familyOf(family.id))!.earnings).toBe(2);
  });

  it("the gross cap holds and the excess stays in earnings", async () => {
    const { family, bossId, all } = await payFamily(10_000_000, 2);
    await conserved(() => executePayday(family.id, bossId, { earnings: 10_000_000, count: 3 }));
    for (const u of all) expect(await walletOf(u)).toBe(950_000);
    expect((await familyOf(family.id))!.earnings).toBe(7_000_000);
  });

  it("a share that clamps at MAX_SAFE_BALANCE returns exactly the unpaid net to earnings (applied + returned + tax = gross)", async () => {
    const { family, bossId, soldiers } = await payFamily(3_000_000, 2);
    await testPrisma.wallet.update({ where: { userId: soldiers[1] }, data: { balance: MAX_SAFE_BALANCE - 1_234 } });
    const before = await sheet();
    const r = await executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 });
    expectConserved(before, await sheet());
    const clamped = (r as any).paid.find((p: any) => p.userId === soldiers[1]);
    expect(clamped.credit).toMatchObject({ appliedAmount: 1_234, capped: true });
    expect(await walletOf(soldiers[1])).toBe(MAX_SAFE_BALANCE);
    expect((await familyOf(family.id))!.earnings).toBe(950_000 - 1_234);
    expect(await ledgerRows(family.id, "payday_clamp_return")).toHaveLength(1);
    await expectLedgerChain(family.id, { treasury: 0, earnings: 3_000_000 });
  });

  it("card garnishment takes 25% of a payday share toward a delinquent card, and the sheet still balances", async () => {
    const { family, bossId, soldiers } = await payFamily(3_000_000, 2);
    await testPrisma.creditCard.update({ where: { userId: soldiers[0] }, data: { status: "DELINQUENT", currentBalance: 1_000_000 } });
    const before = await sheet();
    const r = await executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 });
    expectConserved(before, await sheet());
    expect((r as any).paid.find((p: any) => p.userId === soldiers[0]).credit.garnished).toBe(237_500);
    expect(await walletOf(soldiers[0])).toBe(950_000 - 237_500);
    expect((await testPrisma.creditCard.findUniqueOrThrow({ where: { userId: soldiers[0] } })).currentBalance).toBe(762_500);
    expect(await walletOf(soldiers[1])).toBe(950_000);
  });

  it.each([
    ["negative earnings", "-3000000", "3"],
    ["inflated earnings", "30000000", "3"], ["inflated count", "3000000", "30"], ["zero count", "3000000", "0"],
    ["fractional count", "3000000", "2.5"],
  ])("a forged Confirm id (%s) pays nobody and moves nothing", async (_label, e, n) => {
    const { family, bossId, all } = await payFamily(3_000_000, 2);
    const before = await sheet();
    const i = await press(`crew:pay:ok:${e}:${n}:${bossId}`, bossId);
    expectConserved(before, await sheet());
    expect(said(i)).not.toContain("Paid 3 members");
    for (const u of all) expect(await walletOf(u)).toBe(0);
    expect((await familyOf(family.id))!.earnings).toBe(3_000_000);
    expect(await testPrisma.paydayShare.count({})).toBe(0);
  });

  it("a Soldier pressing a forged Confirm, or the Boss pressing a Soldier's, pays nobody", async () => {
    const { family, bossId, soldiers } = await payFamily(3_000_000, 2);
    const soldierOwn = await press(CREW_IDS.paydayOk(3_000_000, 3, soldiers[0]), soldiers[0]);
    expect(said(soldierOwn)).toContain("Only the Boss or Underboss can run payday.");
    const stolen = await press(CREW_IDS.paydayOk(3_000_000, 3, soldiers[0]), bossId);
    expect(said(stolen)).toMatch(/not yours/);
    expect((await familyOf(family.id))!.earnings).toBe(3_000_000);
  });

  it("an alt paid by one family cannot be paid by a second family in the same week (tenure restarts on join)", async () => {
    const a = await payFamily(3_000_000, 2, { tag: "AAA", wallet: 5_000_000 });
    const alt = a.soldiers[1];
    await executePayday(a.family.id, a.bossId, { earnings: 3_000_000, count: 3 });
    await leaveFamily(alt);
    await testPrisma.familyExit.updateMany({ where: { userId: alt }, data: { leftAt: daysAgo(4) } });   // past the hop cooldown
    const b = await payFamily(3_000_000, 2, { tag: "BBB" });
    const inv = await withCfConfig({ enabled: true }, () => inviteMember({ inviterId: b.bossId, inviteeId: alt, guildId: "g1", channelId: "c1" }));
    await acceptInvite(inv.id, alt);
    const p = await previewPayday(b.family.id);
    expect(p.eligible).not.toContain(alt);
    expect(p.ineligible.find((x) => x.userId === alt)?.need).toMatch(/7 days in the family/);
    await executePayday(b.family.id, b.bossId, { earnings: 3_000_000, count: 3 });
    expect(await walletOf(alt)).toBe(5_000_000 + 950_000);
  });

  it("BUG-MONEY-2: a forged Confirm id with NaN or Infinity earnings is refused as stale, not a Prisma validation crash", async () => {
    const { family, bossId } = await payFamily(3_000_000, 2);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const e of ["NaN", "Infinity"]) {
        const i = await press(`crew:pay:ok:${e}:3:${bossId}`, bossId);
        expect(said(i)).not.toContain("Something went wrong.");
      }
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
    expect((await familyOf(family.id))!.earnings).toBe(3_000_000);
  });
});

// ── Dues and arrears ─────────────────────────────────────────────────────────

describe("dues and arrears", () => {
  it("dues come from earnings first, then the treasury; a short vault is one day of arrears and moves nothing", async () => {
    const f = await seedFamily({ bossId: await player(), level: 2, earnings: 30_000, treasury: 60_000 });
    await conserved(async () => {
      expect(await chargeDues(f.id, new Date("2026-11-10T00:10:00Z"))).toMatchObject({ status: "charged" });
      expect(await familyOf(f.id)).toMatchObject({ earnings: 0, treasury: 10_000 });
      expect(await chargeDues(f.id, new Date("2026-11-11T00:10:00Z"))).toEqual({ status: "missed", firstMiss: true });
      expect(await chargeDues(f.id, new Date("2026-11-11T23:59:00Z"))).toMatchObject({ status: "skipped" });
      expect(await chargeDues(f.id, new Date("2026-11-12T00:10:00Z"))).toEqual({ status: "missed", firstMiss: false });
    });
    expect(await familyOf(f.id)).toMatchObject({ earnings: 0, treasury: 10_000, duesArrears: 2 });
    expect((await ledgerRows(f.id, "dues")).map((r) => r.meta)).toEqual([expect.objectContaining({ fromEarnings: 30_000, fromTreasury: 50_000 })]);
    await expectLedgerChain(f.id, { treasury: 60_000, earnings: 30_000 });
  });

  it("a deposit too small for the arrears pays nothing toward them; a big enough one pays exactly days × dues × level", async () => {
    const boss = await player({ wallet: 2_000_000 });
    const f = await seedFamily({ bossId: boss, level: 3, duesArrears: 4 });
    expect(arrearsOwed({ duesArrears: 4, level: 3 })).toBe(480_000);
    await conserved(async () => {
      await depositToVault(boss, 500_000);                     // net 475,000 < 480,000
      expect(await familyOf(f.id)).toMatchObject({ treasury: 475_000, duesArrears: 4 });
      await depositToVault(boss, 10_000);                      // net 9,500 → 484,500 ≥ 480,000
    });
    expect(await familyOf(f.id)).toMatchObject({ treasury: 4_500, duesArrears: 0 });
    expect(await ledgerRows(f.id, "dues")).toHaveLength(1);
    await expectLedgerChain(f.id, { treasury: 0, earnings: 0 });
  });

  it("two deposits that could each clear the arrears clear them once", async () => {
    const a = await player({ wallet: 1_000_000 });
    const b = await player({ wallet: 1_000_000 });
    const f = await seedFamily({ bossId: a, level: 1, duesArrears: 5, members: [{ userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await conserved(() => Promise.all([depositToVault(a, 500_000), depositToVault(b, 500_000)]));
    expect(await familyOf(f.id)).toMatchObject({ treasury: 950_000 - 200_000, duesArrears: 0 });
    expect(await ledgerRows(f.id, "dues")).toHaveLength(1);
  });

  it("arrears block the level-up press and leave the fee unspent; payday still runs (D30)", async () => {
    const { family, bossId, all } = await payFamily(3_000_000, 2, { treasury: 9_000_000 });
    // 100 days of arrears is more than the vault holds, so no credit clears them.
    await testPrisma.family.update({ where: { id: family.id }, data: { xp: 5_000, duesArrears: 400 } });
    const i = await press(CREW_IDS.levelOk(1, bossId), bossId);
    expect(said(i)).toContain("Clear dues arrears first.");
    expect(await familyOf(family.id)).toMatchObject({ level: 1, treasury: 9_000_000, earnings: 3_000_000 });
    await conserved(() => executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 }));
    for (const u of all) expect(await walletOf(u)).toBe(950_000);
  });

  it("a dues charge racing two deposits on the same day: conserved and the chain holds", async () => {
    const a = await player({ wallet: 1_000_000 });
    const b = await player({ wallet: 1_000_000 });
    const f = await seedFamily({ bossId: a, level: 5, members: [{ userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    const before = await sheet();
    await Promise.allSettled([depositToVault(a, 100_000), chargeDues(f.id, new Date()), depositToVault(b, 150_000)]);
    expectConserved(before, await sheet());
    await expectLedgerChain(f.id, { treasury: 0, earnings: 0 });
    const fam = (await familyOf(f.id))!;
    expect(fam.duesArrears === 0 || fam.duesArrears === 1).toBe(true);
  });
});

// ── Level-ups ────────────────────────────────────────────────────────────────

describe("level-ups", () => {
  it("the S8 Confirm burns the fee earnings-first, needs the XP and moves level and vault in one row", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, xp: 1_000, earnings: 500_000, treasury: 3_000_000 });
    await conserved(() => press(CREW_IDS.levelOk(1, boss), boss));
    expect(await familyOf(f.id)).toMatchObject({ level: 2, earnings: 0, treasury: 1_500_000, xp: 1_000 });
    expect((await ledgerRows(f.id, "level_fee"))[0]).toMatchObject({ amount: -2_000_000, meta: expect.objectContaining({ fromEarnings: 500_000, fromTreasury: 1_500_000, to: 2 }) });
    await expectLedgerChain(f.id, { treasury: 3_000_000, earnings: 500_000 });
    const short = await press(CREW_IDS.levelOk(2, boss), boss);
    expect(said(short)).toContain("Needs 3,000 XP (have 1,000).");
    expect((await familyOf(f.id))!.level).toBe(2);
  });

  it("a vault that cannot cover the fee refuses and rolls the level back", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, xp: 60_000, earnings: 1_000_000, treasury: 999_999 });
    const i = await conserved(() => press(CREW_IDS.levelOk(1, boss), boss));
    expect(said(i)).toContain("The vault is short: needs 2,000,000, has 1,999,999.");
    expect(await familyOf(f.id)).toMatchObject({ level: 1, earnings: 1_000_000, treasury: 999_999 });
    expect(await ledgerRows(f.id)).toHaveLength(0);
  });

  it("BUG-MONEY-4: S6/S8 offer an enabled Level up and promise the fee 'from the treasury' when the vault cannot cover it", async () => {
    const boss = await player();
    await seedFamily({ bossId: boss, xp: 60_000, earnings: 0, treasury: 0 });
    const s8 = await press(CREW_IDS.vault("level", boss), boss);
    const payload = JSON.stringify(s8.editReply.mock.calls.at(-1)?.[0]);
    // The screen says "burned: 0 from earnings, 2,000,000 from the treasury" with an empty treasury and an enabled Confirm.
    expect(payload).not.toContain("2,000,000 from the treasury");
    const confirm = JSON.parse(payload).components[0].components.find((c: any) => c.type === 1).components[0];
    expect(confirm.disabled).toBe(true);
  });

  it("three Confirm presses at once (Boss twice, Underboss once) burn one fee", async () => {
    const boss = await player();
    const ub = await player();
    const f = await seedFamily({ bossId: boss, xp: 60_000, earnings: 10_000_000, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(30) }] });
    const before = await sheet();
    const rs = await Promise.all([press(CREW_IDS.levelOk(1, boss), boss), press(CREW_IDS.levelOk(1, boss), boss), press(CREW_IDS.levelOk(1, ub), ub)]);
    expectConserved(before, await sheet());
    expect(rs.filter((i) => said(i).includes("now level 2"))).toHaveLength(1);
    expect(await familyOf(f.id)).toMatchObject({ level: 2, earnings: 8_000_000 });
    expect(await ledgerRows(f.id, "level_fee")).toHaveLength(1);
  });

  it("a stale S8 for the next level after a level-up charges the next fee only once more (sequential)", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, xp: 60_000, earnings: 20_000_000 });
    await conserved(async () => {
      await levelUp(f.id, boss, 1);
      await expect(levelUp(f.id, boss, 1)).rejects.toThrow("Level changed.");
      await levelUp(f.id, boss, 2);
    });
    expect(await familyOf(f.id)).toMatchObject({ level: 3, earnings: 14_000_000 });
    await expectLedgerChain(f.id, { treasury: 0, earnings: 20_000_000 });
  });

  it("a level-up racing a payday over the same earnings: never both from the same money", async () => {
    const { family, bossId, all } = await payFamily(3_000_000, 2);
    await testPrisma.family.update({ where: { id: family.id }, data: { xp: 1_000 } });
    const before = await sheet();
    const [lv, pay] = await Promise.allSettled([levelUp(family.id, bossId, 1), executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 })]);
    expectConserved(before, await sheet());
    const fam = (await familyOf(family.id))!;
    const paid = pay.status === "fulfilled" && pay.value.status === "paid";
    const levelled = lv.status === "fulfilled";
    expect(paid && levelled).toBe(false);   // 3,000,000 pays a 3,000,000 payday or a 2,000,000 fee, not both
    expect(fam.earnings).toBe(levelled ? 1_000_000 : 0);
    for (const u of all) expect(await walletOf(u)).toBe(paid ? 950_000 : 0);
  });

  it("BUG-MONEY-3: a forged level Confirm with a non-integer level is refused, not an 'Unknown family level' crash", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, xp: 60_000, earnings: 10_000_000 });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const lvl of ["NaN", "1.5", "-3"]) {
        const i = await press(`crew:lvl:ok:${lvl}:${boss}`, boss);
        expect(said(i)).not.toContain("Something went wrong.");
      }
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
    expect(await familyOf(f.id)).toMatchObject({ level: 1, earnings: 10_000_000 });
  });

  it("the full ladder L1 → L10 burns exactly 172,000,000", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, xp: 60_000, earnings: 172_000_000 });
    await conserved(async () => { for (let l = 1; l < 10; l++) await levelUp(f.id, boss, l); });
    expect(await familyOf(f.id)).toMatchObject({ level: 10, earnings: 0, treasury: 0 });
    await expect(levelUp(f.id, boss, 10)).rejects.toThrow("Max level.");
  });
});

// ── Rename ───────────────────────────────────────────────────────────────────

describe("rename", () => {
  it("the Rename modal burns 2,000,000 earnings-first once per 30 days; a short vault keeps the old name and cooldown", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, name: "Old Name", earnings: 1_500_000, treasury: 499_999, data: { lastRenamedAt: daysAgo(31) } });
    const short = await conserved(() => submit("rename", boss, { name: "New Name" }));
    expect(said(short)).toContain("The vault is short");
    expect(await familyOf(f.id)).toMatchObject({ name: "Old Name", earnings: 1_500_000, treasury: 499_999 });
    expect(+(await familyOf(f.id))!.lastRenamedAt).toBeLessThan(Date.now() - 30 * 86_400_000);
    await testPrisma.family.update({ where: { id: f.id }, data: { treasury: 500_000 } });
    await conserved(() => submit("rename", boss, { name: "New Name" }));
    expect(await familyOf(f.id)).toMatchObject({ name: "New Name", earnings: 0, treasury: 0 });
    const again = await submit("rename", boss, { name: "Third Name" });
    expect(said(again)).toContain("You can rename once every 30 days.");
  });

  it("two rename submits at once burn one fee", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, earnings: 10_000_000, data: { lastRenamedAt: daysAgo(31) } });
    const before = await sheet();
    await Promise.all([submit("rename", boss, { name: "Name One" }), submit("rename", boss, { name: "Name Two" })]);
    expectConserved(before, await sheet());
    expect((await familyOf(f.id))!.earnings).toBe(8_000_000);
    expect(await ledgerRows(f.id, "rename_fee")).toHaveLength(1);
  });

  it("a Soldier's rename modal is refused and charges nothing", async () => {
    const boss = await player();
    const s = await player();
    const f = await seedFamily({ bossId: boss, earnings: 10_000_000, data: { lastRenamedAt: daysAgo(31) }, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    const i = await submit("rename", s, { name: "Hijacked" });
    expect(said(i)).toMatch(/permission/i);
    expect((await familyOf(f.id))!.earnings).toBe(10_000_000);
  });
});

// ── Disband ──────────────────────────────────────────────────────────────────

describe("disband money", () => {
  it("the Disband modal pays the capped final payday, burns the rest, and the S22 preview matched it", async () => {
    const { family, bossId, all } = await payFamily(5_000_001, 2, { treasury: 7_777_777, tag: "DSB" });
    const preview = await previewDisband(family.id);
    expect(preview).toMatchObject({ burnTreasury: 7_777_777, burnEarnings: 2_000_001, finalPayday: { count: 3, split: { gross: 1_000_000, net: 950_000 } } });
    const before = await sheet();
    const i = await submit("disband", bossId, { tag: "dsb" });
    expectConserved(before, await sheet());
    expect(said(i)).toContain("has disbanded");
    for (const u of all) expect(await walletOf(u)).toBe(950_000);
    expect((await ledgerRows(family.id, "disband_burn"))[0]).toMatchObject({ amount: -(7_777_777 + 2_000_001) });
    await expectLedgerChain(family.id, { treasury: 7_777_777, earnings: 5_000_001 });
  });

  it("a final payday below the 500,000 minimum still pays (D61) and the ledger closes at zero", async () => {
    const { family, bossId, all } = await payFamily(300_000, 2, { tag: "SML" });
    await conserved(() => disbandFamily(bossId, "SML"));
    for (const u of all) expect(await walletOf(u)).toBe(95_000);
    expect(await familyOf(family.id)).toBeNull();
    await expectLedgerChain(family.id, { treasury: 0, earnings: 300_000 });
  });

  it("a disband racing a manual payday: one of them pays, never both, and nothing leaks", async () => {
    for (let k = 0; k < 3; k++) {
      await resetFamilies();
      const { family, bossId, all } = await payFamily(3_000_000, 2, { tag: `R${k}`, treasury: 1_000_000 });
      const before = await sheet();
      const rs = await Promise.allSettled([executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 }), disbandFamily(bossId, `R${k}`)]);
      expectConserved(before, await sheet());
      expect(rs[1].status).toBe("fulfilled");
      for (const u of all) expect(await walletOf(u)).toBe(950_000);   // the manual payday or the final payday, exactly once
      expect(await testPrisma.paydayShare.count({ where: { familyId: family.id } })).toBe(3);
    }
  });

  it("disbanding while an earlier payday's shares are still unpaid: the shares still pay once after the family is gone", async () => {
    const { family, bossId, all } = await payFamily(3_000_000, 2, { tag: "UNP" });
    fail.all = true;
    await executePayday(family.id, bossId, { earnings: 3_000_000, count: 3 });
    resetFail();
    const before = await sheet();
    await disbandFamily(bossId, "UNP");
    await resumeUnpaidShares(later());
    expectConserved(before, await sheet());
    for (const u of all) expect(await walletOf(u)).toBe(950_000);
  });
});

// ── Crew heists: stakes, cuts, fines and the vault cut ───────────────────────

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;

describe("crew heist money", () => {
  it("a whole T1 run through the cpr: routes (join, leave, rejoin, start, four locks, settle) conserves money whatever the draw", async () => {
    for (let run = 0; run < 3; run++) {
      await resetFamilies();
      resetTracked();
      const { family, ids } = await caperCrew({ tier: 1, roles: [...T1], wallet: 3_000_000 });
      track(...Object.values(ids), family.bossId);
      const startVault = { treasury: family.treasury, earnings: family.earnings };
      const fake = fakeCaperClient();
      const before = await sheet();
      await withCfConfig({ enabled: true }, async () => {
        const caper = await planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
        const sel = (uid: string, role: string) => fakeSelect(CPR_IDS.join(caper.id), [role], { userId: uid, client: fake.client });
        for (const role of ["LOOKOUT", "SAFECRACKER"] as const) await handleCrimeFamilyInteraction(sel(ids[role], role) as any);
        const leave = fakeButton(CPR_IDS.leave(caper.id), { userId: ids.SAFECRACKER, client: fake.client });
        await handleCrimeFamilyInteraction(leave as any);
        expectConserved(before, await sheet());
        expect(await walletOf(ids.SAFECRACKER)).toBe(3_000_000);
        await handleCrimeFamilyInteraction(sel(ids.SAFECRACKER, "SAFECRACKER") as any);
        await handleCrimeFamilyInteraction(sel(ids.DRIVER, "DRIVER") as any);   // the fourth seat fills and auto-starts
        let live = (await testPrisma.caper.findUniqueOrThrow({ where: { id: caper.id } }));
        if (live.status === "LOBBY") {
          await handleCrimeFamilyInteraction(fakeButton(CPR_IDS.start(caper.id), { userId: ids.MASTERMIND, client: fake.client }) as any);
          live = await testPrisma.caper.findUniqueOrThrow({ where: { id: caper.id } });
        }
        expect(live.status).toBe("RUNNING");
        expectConserved(before, await sheet());                                   // 4 × 50,000 burned at Start
        const answers = parseAnswers(live.answers)!;
        for (const role of T1) {
          const pick = run === 2 && role !== "MASTERMIND" ? (answers.seats[role]!.correct + 1) % 4 : answers.seats[role]!.correct;
          await handleCrimeFamilyInteraction(fakeButton(CPR_IDS.openBrief(caper.id, ids[role]), { userId: ids[role], client: fake.client }) as any);
          await handleCrimeFamilyInteraction(fakeButton(CPR_IDS.act(caper.id, pick), { userId: ids[role], client: fake.client }) as any);
        }
        const done = await testPrisma.caper.findUniqueOrThrow({ where: { id: caper.id } });
        expect(done.status).toBe("RESOLVED");
        if (run === 2) expect(done.outcome).toBe("BUST");
      });
      expectConserved(before, await sheet());
      await expectLedgerChain(family.id, startVault);
      const crew = await testPrisma.caperCrew.findMany({ where: { familyId: family.id } });
      expect(crew.every((c) => c.settled && c.started && !c.refunded)).toBe(true);
    }
  });

  it("a stake is never both refunded and burned: leave pressed against Start, 5 times", async () => {
    for (let k = 0; k < 5; k++) {
      await resetFamilies();
      resetTracked();
      const { family, ids } = await caperCrew({ tier: 1, roles: [...T1], wallet: 3_000_000 });
      track(...Object.values(ids));
      await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: daysAgo(1) } });
      const caper = await planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
      for (const role of ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const) await joinCaper({ caperId: caper.id, uid: ids[role], role });
      const before = await sheet();
      await Promise.allSettled([leaveCaper(caper.id, ids.DRIVER), startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })]);
      expectConserved(before, await sheet());
      const seat = await testPrisma.caperCrew.findFirst({ where: { caperId: caper.id, userId: ids.DRIVER } });
      expect(await walletOf(ids.DRIVER)).toBe(seat ? 2_950_000 : 3_000_000);
    }
  });

  it("a member kicked from a lobby gets the stake back; kicking the planner cancels and refunds every seat once", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO", wallet: 3_000_000 });
    track(...Object.values(ids), family.bossId);
    const caper = await planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: caper.id, uid: ids.LOOKOUT, role: "LOOKOUT" });
    await joinCaper({ caperId: caper.id, uid: ids.SAFECRACKER, role: "SAFECRACKER" });
    const before = await sheet();
    await kickMember(family.bossId, ids.LOOKOUT);
    await Promise.allSettled([kickMember(family.bossId, ids.MASTERMIND), leaveCaper(caper.id, ids.SAFECRACKER)]);
    expectConserved(before, await sheet());
    for (const role of ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const) expect(await walletOf(ids[role])).toBe(3_000_000);
    expect(await testPrisma.transaction.count({ where: { type: "caper_stake_refund", wallet: { userId: { in: Object.values(ids) } } } })).toBe(3);
  });

  it("a caper cut is garnished toward a delinquent card; a stake refund never is (D60)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], wallet: 100_000 });
    track(...Object.values(ids));
    await testPrisma.creditCard.update({ where: { userId: ids.LOOKOUT }, data: { status: "DELINQUENT", currentBalance: 5_000_000 } });
    const before = await sheet();
    await resolveCaper(caper.id, new Date(+caper.goEndsAt + 1_000), scriptedRng([9_999]));   // CLEAN: pool 1,050,000, cut 280,000
    expectConserved(before, await sheet());
    expect(await walletOf(ids.LOOKOUT)).toBe(100_000 + 280_000 - 70_000);
    expect(await walletOf(ids.SAFECRACKER)).toBe(100_000 + 280_000);

    const lobby = await caperCrew({ tier: 1, roles: [...T1], wallet: 3_000_000 });
    track(...Object.values(lobby.ids));
    const c2 = await planCaper({ uid: lobby.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: c2.id, uid: lobby.ids.LOOKOUT, role: "LOOKOUT" });
    await testPrisma.creditCard.update({ where: { userId: lobby.ids.LOOKOUT }, data: { status: "DELINQUENT", currentBalance: 5_000_000 } });
    await leaveCaper(c2.id, lobby.ids.LOOKOUT);
    expect(await walletOf(lobby.ids.LOOKOUT)).toBe(3_000_000);
    expect((await testPrisma.creditCard.findUniqueOrThrow({ where: { userId: lobby.ids.LOOKOUT } })).currentBalance).toBe(5_000_000);
  });

  it("BUG-MONEY-5: a lobby stake refunded to a wallet near MAX_SAFE_BALANCE is not silently destroyed", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1], wallet: 3_000_000 });
    track(...Object.values(ids));
    const caper = await planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await joinCaper({ caperId: caper.id, uid: ids.LOOKOUT, role: "LOOKOUT" });
    // The Lookout's wallet fills up (any other income) while the stake sits in the lobby.
    await testPrisma.wallet.update({ where: { userId: ids.LOOKOUT }, data: { balance: MAX_SAFE_BALANCE - 10 } });
    const before = await sheet();
    await leaveCaper(caper.id, ids.LOOKOUT);
    // 49,990 of the 50,000 stake vanished: no wallet, no vault, no ledger or audit row records it.
    expectConserved(before, await sheet());
    expect(family.id).toBeTruthy();
  });
});

// ── Rackets ──────────────────────────────────────────────────────────────────

describe("racket income", () => {
  it("racket cycles mint into earnings with XP, pay arrears first, and the ledger chain holds", async () => {
    const boss = await player();
    const f = await seedFamily({ bossId: boss, level: 2, duesArrears: 2, earnings: 10_000 });
    const r = await seedRacket("docks_numbers", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 50 * 3_600_000) });
    const before = await sheet();
    const res = await collectRacket(r.id, new Date(), 3);
    expectConserved(before, await sheet());
    expect(res).toMatchObject({ status: "minted", cycles: 2, amount: 2 * r.incomePerCycle });
    expect(await familyOf(f.id)).toMatchObject({ earnings: 10_000 + 2 * r.incomePerCycle - 160_000, duesArrears: 0, xp: 40 });
    await expectLedgerChain(f.id, { treasury: 0, earnings: 10_000 });
    const twice = await Promise.all([collectRacket(r.id, new Date(), 3), collectRacket(r.id, new Date(), 3)]);
    expect(twice.every((t) => t.status === "skipped")).toBe(true);
  });
});

// ── Bids ─────────────────────────────────────────────────────────────────────

async function bidFamily(earnings: number, o: { treasury?: number; tag?: string; arrears?: number } = {}) {
  const boss = await player();
  const ub = await player();
  const f = await seedFamily({ bossId: boss, earnings, treasury: o.treasury ?? 0, duesArrears: o.arrears ?? 0, ...(o.tag ? { tag: o.tag } : {}),
    data: { cityId: (await turfCity()).id }, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }] });
  return { f, boss, ub };
}

describe("bid escrow", () => {
  it("two alt families ping-ponging outbids mint nothing: every escrow is refunded in full to earnings", async () => {
    const a = await bidFamily(20_000_000, { tag: "PNG" });
    const b = await bidFamily(20_000_000, { tag: "PONG" });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const racketId = w.racketId;
    const before = await sheet();
    let amount = 2_100_000;
    for (let k = 0; k < 6; k++) {
      await placeBid({ racketId, actorId: k % 2 === 0 ? a.boss : b.boss, amount });
      amount = Math.ceil(amount * 1.1);
    }
    expectConserved(before, await sheet());
    const top = (await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } }));
    expect(top.topBidderFamilyId).toBe(b.f.id);
    expect((await familyOf(a.f.id))!.earnings).toBe(20_000_000);
    expect((await familyOf(b.f.id))!.earnings).toBe(20_000_000 - top.topBid);
    await expectLedgerChain(a.f.id, { treasury: 0, earnings: 20_000_000 });
    await expectLedgerChain(b.f.id, { treasury: 0, earnings: 20_000_000 });
  });

  it("an escrow is burned once at settlement, refunded once on a downtime cancel, and the refund pays arrears", async () => {
    const a = await bidFamily(5_000_000, { tag: "WAR" });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await placeBid({ racketId: w.racketId, actorId: a.boss, amount: 2_100_000 });
    const before = await sheet();
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "SETTLING", attackerFamilyId: a.f.id, maxTickGapSeconds: 9_999 } });
    await testPrisma.family.update({ where: { id: a.f.id }, data: { duesArrears: 3 } });
    const [s1, s2] = await Promise.all([settleWar(w.id, new Date()), settleWar(w.id, new Date())]);
    expect([s1, s2].filter(Boolean)).toHaveLength(1);
    expectConserved(before, await sheet());
    expect(await familyOf(a.f.id)).toMatchObject({ earnings: 5_000_000 - 120_000, duesArrears: 0 });

    const w2 = await seedWar({ racketKey: "laundromat_front", status: "BIDDING" });
    await placeBid({ racketId: w2.racketId, actorId: a.boss, amount: 2_100_000 });
    const mid = await sheet();
    await testPrisma.war.update({ where: { id: w2.id }, data: { status: "SETTLING", attackerFamilyId: a.f.id, maxTickGapSeconds: 0 } });
    await Promise.all([settleWar(w2.id, new Date()), settleWar(w2.id, new Date())]);
    expectConserved(mid, await sheet());
    expect(await ledgerRows(a.f.id, "war_bid_burn")).toHaveLength(1);
    expect((await familyOf(a.f.id))!.earnings).toBe(5_000_000 - 120_000 - 2_100_000);
  });

  it("a disbanding top bidder's escrow returns to earnings and is paid out or burned with the vault, never lost", async () => {
    const a = await bidFamily(3_000_000, { tag: "DIS" });
    active.add(a.boss); active.add(a.ub);
    await testPrisma.family.update({ where: { id: a.f.id }, data: { lastPaydayAt: daysAgo(8) } });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await placeBid({ racketId: w.racketId, actorId: a.boss, amount: 2_100_000 });
    const preview = await previewDisband(a.f.id);
    expect(preview).toMatchObject({ burnEarnings: 1_000_000, finalPayday: { count: 2, split: { gross: 1_000_000 } } });
    const before = await sheet();
    await disbandFamily(a.boss, "DIS");
    expectConserved(before, await sheet());
    expect(await walletOf(a.boss)).toBe(950_000);
    expect((await ledgerRows(a.f.id, "disband_burn"))[0].amount).toBe(-1_000_000);
    expect(await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ topBid: 0, topBidderFamilyId: "" });
  });
});

// ── Service-level fuzz, jobs and design notes ────────────────────────────────

describe("service guards and the hourly jobs", () => {
  it.each([[NaN], [Infinity], [-Infinity], [-5], [0], [1.5], [9_999], [Number.MAX_SAFE_INTEGER], [MAX_SAFE_BALANCE + 2]])(
    "depositToVault(%s) from any caller refuses and writes nothing", async (amount) => {
      const boss = await player({ wallet: 50_000_000 });
      const f = await seedFamily({ bossId: boss });
      await conserved(() => expect(depositToVault(boss, amount)).rejects.toThrow(/whole number|Minimum deposit|Daily deposit cap/));
      expect(await walletOf(boss)).toBe(50_000_000);
      expect(await ledgerRows(f.id)).toHaveLength(0);
    });

  it("spendFromVault refuses to overdraw either bucket, whatever the amount", async () => {
    const f = await seedFamily({ bossId: await player(), treasury: 100, earnings: 100 });
    for (const amount of [201, 1e18, Infinity]) {
      await expect(runFamilyTx((tx) => spendFromVault(tx, f.id, amount, "level_fee", "x", {}))).rejects.toThrow(/vault is short/);
    }
    expect(await familyOf(f.id)).toMatchObject({ treasury: 100, earnings: 100 });
  });

  it("the hourly dues job charges each family once per UTC day across repeated and overlapping runs", async () => {
    const fs = [];
    for (let k = 0; k < 4; k++) fs.push(await seedFamily({ bossId: await player(), level: k + 1, earnings: 1_000_000 }));
    const { client } = fakeClient();
    const now = new Date("2026-11-20T00:10:00Z");
    const before = await sheet();
    await Promise.all([chargeFamilyDues(client, now), chargeFamilyDues(client, now), chargeFamilyDues(client, new Date(+now + 3_600_000))]);
    expectConserved(before, await sheet());
    for (const [k, f] of fs.entries()) expect((await familyOf(f.id))!.earnings).toBe(1_000_000 - 40_000 * (k + 1));
  });

  it("the hourly auto payday pays a due family once (grace day passed) and skips one nobody qualifies in", async () => {
    const due = await payFamily(3_000_000, 2, { tag: "AUT" });
    await testPrisma.family.update({ where: { id: due.family.id }, data: { lastPaydayAt: daysAgo(9) } });
    const idle = await payFamily(3_000_000, 2, { tag: "IDL" });
    await testPrisma.family.update({ where: { id: idle.family.id }, data: { lastPaydayAt: daysAgo(9) } });
    for (const u of idle.all) active.delete(u);
    const fake = fakeClient();
    const before = await sheet();
    await Promise.all([autoPayday(fake.client, new Date()), autoPayday(fake.client, new Date())]);
    expectConserved(before, await sheet());
    for (const u of due.all) expect(await walletOf(u)).toBe(950_000);
    for (const u of idle.all) expect(await walletOf(u)).toBe(0);
    expect((await familyOf(idle.family.id))!.earnings).toBe(3_000_000);
    expect(await ledgerRows(due.family.id, "payday")).toHaveLength(1);
  });

  it("design note: arrears larger than the vault are never collected, while payday keeps paying the earnings out (D30 allows it)", async () => {
    // A family that never levels can carry arrears forever: every credit retries the whole debt, which never fits,
    // and payday drains the earnings below it again each week. Dues stop being a sink for such a family.
    const { family, bossId, all } = await payFamily(0, 2);
    await testPrisma.family.update({ where: { id: family.id }, data: { duesArrears: 25 } });   // 1,000,000 owed at level 1
    await runFamilyTx((tx) => creditEarnings(tx, family.id, 900_000, "caper_cut", "system", {}, { xp: 60 }));
    expect(await familyOf(family.id)).toMatchObject({ earnings: 900_000, duesArrears: 25 });
    await executePayday(family.id, bossId, { earnings: 900_000, count: 3 });
    for (const u of all) expect(await walletOf(u)).toBe(285_000);
    expect(await ledgerRows(family.id, "dues")).toHaveLength(0);
    expect(CRIME_FAMILY_CONFIG.duesPerLevel).toBe(40_000);
  });
});

describe("founding fee and stakes under double presses", () => {
  it("a double Create confirm press founds one family and burns one 10,000,000 fee", async () => {
    const founder = await player({ wallet: 25_000_000 });
    const before = await sheet();
    await withCfConfig({ enabled: true }, async () => {
      const id = CREW_IDS.createOk("DBL", "Double Press", founder);
      await Promise.all([press(id, founder), press(id, founder), press(id, founder)]);
    });
    expectConserved(before, await sheet());
    expect(await testPrisma.family.count({ where: { tagKey: "DBL" } })).toBe(1);
    expect(await walletOf(founder)).toBe(15_000_000);
  });

  it("two founders racing for the same tag: the loser is charged nothing", async () => {
    const a = await player({ wallet: 15_000_000 });
    const b = await player({ wallet: 15_000_000 });
    const before = await sheet();
    await withCfConfig({ enabled: true }, async () => {
      await Promise.all([press(CREW_IDS.createOk("RCE", "Race One", a), a), press(CREW_IDS.createOk("RCE", "Race Two", b), b)]);
    });
    expectConserved(before, await sheet());
    expect(await testPrisma.family.count({ where: { tagKey: "RCE" } })).toBe(1);
    expect([await walletOf(a), await walletOf(b)].sort()).toEqual([15_000_000, 5_000_000]);
  });

  it("a founder whose wallet is one fortune short of the fee (net worth in the bank) is refused; exactly the fee founds", async () => {
    const founder = await player({ wallet: 9_999_999 });
    await testPrisma.bank.upsert({ where: { userId: founder }, create: { userId: founder, balance: 10_000_000 }, update: { balance: 10_000_000 } });
    const before = await sheet();
    const i = await withCfConfig({ enabled: true }, () => press(CREW_IDS.createOk("PRE", "Almost Rich", founder), founder));
    expectConserved(before, await sheet());
    expect(said(i)).toContain("Insufficient funds.");
    expect(await walletOf(founder)).toBe(9_999_999);
    expect(await testPrisma.family.count({ where: { tagKey: "PRE" } })).toBe(0);
    await testPrisma.wallet.update({ where: { userId: founder }, data: { balance: 10_000_000 } });
    const ok = await conserved(() => withCfConfig({ enabled: true }, () => press(CREW_IDS.createOk("PRE", "Almost Rich", founder), founder)));
    expect(said(ok)).not.toContain("Insufficient");
    expect(await walletOf(founder)).toBe(0);
    expect(await testPrisma.family.count({ where: { tagKey: "PRE" } })).toBe(1);
  });

  it("a double plan press opens one lobby and takes one stake", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1], wallet: 3_000_000 });
    track(...Object.values(ids));
    const before = await sheet();
    const rs = await Promise.allSettled([1, 2, 3].map(() => planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH })));
    expectConserved(before, await sheet());
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await walletOf(ids.MASTERMIND)).toBe(2_950_000);
  });

  it("a join with exactly the stake left in the wallet takes it; one fortune short is refused and rolls the seat back", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1], wallet: 3_000_000 });
    track(...Object.values(ids));
    const caper = await planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    // Net worth (the 2,000,000 seat gate) comes from the bank, so the wallet can sit right at the stake.
    for (const [uid, w] of [[ids.LOOKOUT, 50_000], [ids.SAFECRACKER, 49_999]] as const) {
      await testPrisma.wallet.update({ where: { userId: uid }, data: { balance: w } });
      await testPrisma.bank.upsert({ where: { userId: uid }, create: { userId: uid, balance: 3_000_000 }, update: { balance: 3_000_000 } });
    }
    const before = await sheet();
    await joinCaper({ caperId: caper.id, uid: ids.LOOKOUT, role: "LOOKOUT" });
    await expect(joinCaper({ caperId: caper.id, uid: ids.SAFECRACKER, role: "SAFECRACKER" })).rejects.toThrow("Insufficient funds.");
    expectConserved(before, await sheet());
    expect(await walletOf(ids.LOOKOUT)).toBe(0);
    expect(await walletOf(ids.SAFECRACKER)).toBe(49_999);
    expect(await testPrisma.caperCrew.count({ where: { caperId: caper.id } })).toBe(2);
  });
});

describe("bid escrow at the close", () => {
  it("bidding closing with turf off refunds the top escrow once, even against a second closer and a late outbid", async () => {
    const a = await bidFamily(5_000_000, { tag: "CLA" });
    const b = await bidFamily(5_000_000, { tag: "CLB" });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await placeBid({ racketId: w.racketId, actorId: a.boss, amount: 2_100_000 });
    const closeAt = new Date(+w.bidClosesAt + 1_000);
    const before = await sheet();
    const rs = await Promise.allSettled([
      closeBidding(w.id, closeAt, false),
      closeBidding(w.id, closeAt, false),
      placeBid({ racketId: w.racketId, actorId: b.boss, amount: 2_310_000, now: closeAt }),
    ]);
    expectConserved(before, await sheet());
    expect(rs[2].status).toBe("rejected");                                    // bidding is closed at closeAt
    expect(await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await familyOf(a.f.id)).toMatchObject({ earnings: 5_000_000 });
    expect(await familyOf(b.f.id)).toMatchObject({ earnings: 5_000_000 });
    expect(await ledgerRows(a.f.id, "bid_refund")).toHaveLength(1);
  });

  it("an outbid racing the close (bid placed just before bidClosesAt): exactly one escrow survives to the armed war", async () => {
    const a = await bidFamily(5_000_000, { tag: "ARA" });
    const b = await bidFamily(5_000_000, { tag: "ARB" });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await placeBid({ racketId: w.racketId, actorId: a.boss, amount: 2_100_000 });
    const before = await sheet();
    await Promise.allSettled([
      placeBid({ racketId: w.racketId, actorId: b.boss, amount: 2_310_000, now: new Date(+w.bidClosesAt - 1) }),
      closeBidding(w.id, new Date(+w.bidClosesAt + 1), true),
    ]);
    expectConserved(before, await sheet());
    const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
    expect(war.status).toBe("ARMED");
    const ea = (await familyOf(a.f.id))!.earnings;
    const eb = (await familyOf(b.f.id))!.earnings;
    expect(ea + eb + war.topBid).toBe(10_000_000);
    expect(war.attackerFamilyId).toBe(war.topBidderFamilyId);
  });
});
