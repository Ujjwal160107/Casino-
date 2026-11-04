import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { spendFromVault, creditEarnings, depositToVault, depositMaxFor, resolveDepositAmount, chargeDues, utcDayKey } from "../../src/services/crimeFamily/vaultService";
import { renameFamily } from "../../src/services/crimeFamily/familyService";
import { runFamilyTx, VaultShort } from "../../src/services/crimeFamily/tx";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("spendFromVault (7.1)", () => {
  it("draws earnings first, then treasury, and records the split", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), treasury: 1_000, earnings: 300 });
    expect(await runFamilyTx((tx) => spendFromVault(tx, f.id, 500, "level_fee", "x", {}))).toEqual({ fromTreasury: 200, fromEarnings: 300 });
    expect(await fam(f.id)).toMatchObject({ treasury: 800, earnings: 0 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "level_fee" } })).toMatchObject({ amount: -500, treasuryAfter: 800, earningsAfter: 0, meta: { fromTreasury: 200, fromEarnings: 300 } });
  });
  it("earningsOnly refuses even with a full treasury; overspend changes nothing", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), treasury: 9e6, earnings: 100 });
    await expect(runFamilyTx((tx) => spendFromVault(tx, f.id, 200, "bid_escrow", "x", {}, { earningsOnly: true }))).rejects.toBeInstanceOf(VaultShort);
    await expect(runFamilyTx((tx) => spendFromVault(tx, f.id, 9_000_101, "level_fee", "x", {}))).rejects.toBeInstanceOf(VaultShort);
    expect(await fam(f.id)).toMatchObject({ treasury: 9e6, earnings: 100 });
  });
});

describe("creditEarnings and arrears (7.4)", () => {
  it("credits earnings and XP, then clears arrears it can afford", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), level: 2, duesArrears: 2 });
    const r = await runFamilyTx((tx) => creditEarnings(tx, f.id, 500_000, "caper_cut", "system", {}, { xp: 90 }));
    expect(r).toEqual({ earningsAfter: 340_000, arrearsCleared: true });
    expect(await fam(f.id)).toMatchObject({ earnings: 340_000, xp: 90, duesArrears: 0 });
  });
});

describe("deposits (7.2)", () => {
  it("taxes 5% inline even under Tax Shield and locks the rest in treasury", async () => {
    const boss = await seedEligibleUser({ wallet: 2_000_000 });
    const f = await seedFamily({ bossId: boss });
    await testRedis().set(`tax_shield:${boss}`, JSON.stringify({ active: true }), "EX", 600);
    expect(await depositToVault(boss, 1_000_000)).toMatchObject({ tax: 50_000, net: 950_000 });
    expect(await wallet(boss)).toBe(1_000_000);
    expect(await fam(f.id)).toMatchObject({ treasury: 950_000, earnings: 0 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "deposit_tax" } })).toMatchObject({ amount: 0, meta: { burned: 50_000 } });
  });
  it("refuses under the minimum, a non-integer, a jailed member and a non-member", async () => {
    const boss = await seedEligibleUser({ wallet: 1_000_000 });
    await seedFamily({ bossId: boss });
    await expect(depositToVault(boss, 9_999)).rejects.toThrow("Minimum deposit is 10,000.");
    await expect(depositToVault(boss, 20_000.5)).rejects.toThrow("Deposit a whole number of fortunes.");
    await expect(depositToVault(boss, 0)).rejects.toThrow("Minimum deposit is 10,000.");
    const jailed = await seedEligibleUser({ wallet: 1_000_000, jailedUntil: new Date(Date.now() + 3600_000) });
    await seedFamily({ bossId: jailed });
    await expect(depositToVault(jailed, 50_000)).rejects.toThrow(/jail/i);
    await expect(depositToVault(await seedEligibleUser({ wallet: 1_000_000 }), 50_000)).rejects.toThrow("You are not in a crime family.");
    expect(await wallet(boss)).toBe(1_000_000);
  });
  it("depositMaxFor clamps 'all' to what is left of today's cap (P21)", async () => {
    const boss = await seedEligibleUser({ wallet: 40_000_000 });
    await seedFamily({ bossId: boss });
    const day = new Date("2026-11-04T10:00:00Z");
    expect(await depositMaxFor(boss, day)).toBe(25_000_000);
    expect(await resolveDepositAmount(boss, "ALL", day)).toBe(25_000_000);
    expect(await resolveDepositAmount(boss, "2.5k", day)).toBe(2_500);
    expect(await resolveDepositAmount(boss, "-5m", day)).toBeNull();
    await depositToVault(boss, 20_000_000, day);
    expect(await depositMaxFor(boss, day)).toBe(5_000_000);
    expect(await depositMaxFor(boss, new Date("2026-11-05T00:01:00Z"))).toBe(20_000_000);   // wallet now 20M
  });
  it("enforces the 25,000,000 daily cap and resets on the next UTC day", async () => {
    const boss = await seedEligibleUser({ wallet: 60_000_000 });
    const f = await seedFamily({ bossId: boss });
    const day = new Date("2026-11-04T10:00:00Z");
    await depositToVault(boss, 20_000_000, day);
    await expect(depositToVault(boss, 6_000_000, day)).rejects.toThrow("Daily deposit cap reached (5,000,000 left today).");
    await expect(depositToVault(boss, 6_000_000, new Date("2026-11-05T00:01:00Z"))).resolves.toMatchObject({ amount: 6_000_000 });
  });
  it("two deposits racing the cap: one lands, nothing is debited for the other", async () => {
    const boss = await seedEligibleUser({ wallet: 30_000_000 });
    await seedFamily({ bossId: boss });
    const rs = await Promise.allSettled([depositToVault(boss, 13_000_000), depositToVault(boss, 13_000_000)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await wallet(boss)).toBe(17_000_000);
  });
  it("a deposit racing a wallet drain never overdraws", async () => {
    const boss = await seedEligibleUser({ wallet: 1_000_000 });
    const f = await seedFamily({ bossId: boss });
    // depositToVault's membership read is getMembership → prisma.familyMember.findUnique({ where: { userId } }) on the global client.
    const delegate = prisma.familyMember as any;
    const original = delegate.findUnique;
    let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.userId === boss) { first = false; await testPrisma.wallet.update({ where: { userId: boss }, data: { balance: 0 } }); }
      return snapshot;
    };
    try { await expect(depositToVault(boss, 500_000)).rejects.toThrow("Insufficient funds."); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect(await wallet(boss)).toBe(0);
    expect(await fam(f.id)).toMatchObject({ treasury: 0 });
  });
});

describe("dues (7.4)", () => {
  it("charges once per UTC day across 24 runs and counts misses", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), level: 3, earnings: 150_000 });
    const day = new Date("2026-11-05T00:10:00Z");
    const runs = await Promise.allSettled(Array.from({ length: 24 }, (_, h) => chargeDues(f.id, new Date(+day + h * 3600_000 - 1))));
    const ok = runs.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof chargeDues>>> => r.status === "fulfilled").map((r) => r.value.status);
    expect(ok.filter((s) => s === "charged")).toHaveLength(1);
    expect(ok.every((s) => s === "charged" || s === "skipped")).toBe(true);
    for (const r of runs) if (r.status === "rejected") expect(r.reason.message).toBe("Vault busy, try again.");
    expect((await fam(f.id))!.earnings).toBe(30_000);
    expect(await chargeDues(f.id, new Date("2026-11-06T00:10:00Z"))).toEqual({ status: "missed", firstMiss: true });
    expect(await chargeDues(f.id, new Date("2026-11-07T00:10:00Z"))).toEqual({ status: "missed", firstMiss: false });
    expect(await fam(f.id)).toMatchObject({ duesArrears: 2, duesDayKey: "2026-11-07" });
  });
});

describe("renameFamily (6.2)", () => {
  it("is Boss-only, once per 30 days, and paid earnings-first", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 3_000_000 });
    await expect(renameFamily(boss, "New Name")).rejects.toThrow("You can rename once every 30 days.");
    await testPrisma.family.update({ where: { id: f.id }, data: { lastRenamedAt: daysAgo(31) } });
    expect(await renameFamily(boss, "New Name")).toMatchObject({ name: "New Name", nameKey: "new name", earnings: 1_000_000, tag: f.tag });
  });
  it("a taken name rolls back with no charge", async () => {
    const a = await seedFamily({ bossId: await seedEligibleUser(), name: "Taken Name", tag: "TKN" });
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 3_000_000, tag: "NEW" });
    await testPrisma.family.update({ where: { id: f.id }, data: { lastRenamedAt: daysAgo(31) } });
    await expect(renameFamily(boss, "taken name")).rejects.toThrow("Name taken.");
    expect((await fam(f.id))!.earnings).toBe(3_000_000);
    expect(a.name).toBe("Taken Name");
  });
});
