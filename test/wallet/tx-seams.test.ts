import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { addBalance, creditWalletInTx, debitWalletInTx, InsufficientFundsError } from "../../src/services/walletService";
import { computeNetWorth } from "../../src/services/netWorthService";
import { questBus } from "../../src/services/questEvents";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";
import { parsePositiveAmount, fmtFortunes } from "../../src/utils/format";
import { testPrisma, testRedis, seedUser, resetUser } from "../helpers";
import { applyEconomyPenalty, applyEconomyPenaltyTx } from "../../src/services/penaltyService";
import { addCrimeHeatTx } from "../../src/services/taxService";
import { jailUserTx } from "../../src/services/jailService";

const A = "seam-a";
const bal = async () => (await testPrisma.wallet.findUnique({ where: { userId: A } }))!.balance;
beforeEach(async () => { await seedUser(A); });
afterAll(() => resetUser(A));

describe("wallet tx seams", () => {
  it("addBalance keeps its clamp and earn event", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: MAX_SAFE_BALANCE - 100 } });
    const emit = vi.spyOn(questBus, "emit");
    const r = await addBalance(A, "A", 500, "income", {}, true);
    expect(r).toMatchObject({ appliedAmount: 100, capped: true });
    expect(emit).toHaveBeenCalledWith("economy:earn", { discordId: A, amount: 100 });
    emit.mockRestore();
  });

  it("creditWalletInTx rolls back with its transaction", async () => {
    await expect(prisma.$transaction(async (tx) => {
      await creditWalletInTx(tx, A, "A", 1_000, "test", {}, true);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await bal()).toBe(0);
  });

  it("debitWalletInTx refuses an overdraft and writes nothing", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 500 } });
    await expect(prisma.$transaction((tx) => debitWalletInTx(tx, A, 600, "t", {}))).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await bal()).toBe(500);
  });

  it.each([-500, 0, Number.NaN, Number.POSITIVE_INFINITY])("debitWalletInTx and creditWalletInTx refuse amount %d and write nothing", async (amount) => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 1_000 } });
    await expect(prisma.$transaction((tx) => debitWalletInTx(tx, A, amount, "t", {}))).rejects.toThrow("Amount must be positive.");
    await expect(prisma.$transaction((tx) => creditWalletInTx(tx, A, "A", amount, "t", {}, true))).rejects.toThrow("Amount must be positive.");
    expect(await bal()).toBe(1_000);
    const w = await testPrisma.wallet.findUnique({ where: { userId: A } });
    expect(await testPrisma.transaction.count({ where: { walletId: w!.id, type: "t" } })).toBe(0);
  });

  it("two racing debits of 600 on 1,000 pay once", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 1_000 } });
    const run = () => prisma.$transaction((tx) => debitWalletInTx(tx, A, 600, "family_vault_deposit", { k: 1 }));
    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bal()).toBe(400);
    const w = await testPrisma.wallet.findUnique({ where: { userId: A } });
    const rows = await testPrisma.transaction.findMany({ where: { walletId: w!.id, type: "family_vault_deposit" } });
    expect(rows.map((r) => [r.amount, r.isEarned])).toEqual([[-600, false]]);
  });

  it("computeNetWorth ignores a stale networth cache", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 7_000 } });
    await testRedis().set(`networth:${A}`, JSON.stringify({ total: 9e12 }), "EX", 600);
    expect((await computeNetWorth(A)).total).toBe(7_000);
  });

  it.each([["5m", 1e9, 5_000_000], ["1.5b", 9e9, 1_500_000_000], ["2.5k", 1e9, 2_500], ["1,000,000", 1e9, 1_000_000], ["all", 42, 42], ["all", 42.7, 42], ["max", 42.7, 42], ["all", 0.5, null],
    ["-5m", 1e9, null], ["0", 1e9, null], ["abc", 1e9, null], ["1.5x", 1e9, null], ["all", 0, null]] as const)(
    "parsePositiveAmount(%s, %d) = %s", (raw, max, want) => expect(parsePositiveAmount(raw, max)).toBe(want));

  it("fmtFortunes never prints infinity", () => expect(fmtFortunes(3_000_000_000.7)).toBe("3,000,000,000"));
});

describe("settlement tx seams (14.4)", () => {
  const B = "seam-b";
  const money = async (wallet: number, bank: number) => {
    await testPrisma.wallet.update({ where: { userId: B }, data: { balance: wallet } });
    await testPrisma.bank.upsert({ where: { userId: B }, update: { balance: bank }, create: { userId: B, balance: bank } });
  };
  const user = () => testPrisma.user.findUnique({ where: { discordId: B } });
  // resetUser (test/helpers.ts:29-39) never deletes Audit or Bank rows (a Bank row blocks the User delete),
  // so each case clears them and starts from zero audits for B.
  const clear = async () => { await testPrisma.bank.deleteMany({ where: { userId: B } }); await testPrisma.audit.deleteMany({ where: { userId: B } }); await resetUser(B); };
  beforeEach(async () => { await clear(); await seedUser(B); });
  afterAll(clear);

  it("applyEconomyPenaltyTx allocates exactly like applyEconomyPenalty (wallet first, bank into debt)", async () => {
    await money(100_000, 50_000);
    const a = await prisma.$transaction((tx) => applyEconomyPenaltyTx(tx, B, "B", 300_000, "caper_fine", { caperId: "c" }, "g1"));
    expect(a).toMatchObject({ walletDebit: 100_000, bankDebit: 200_000, newWalletBalance: 0, newBankBalance: -150_000 });
    await money(100_000, 50_000);
    expect(await applyEconomyPenalty(B, "B", 300_000, "caper_fine", { caperId: "c" }, "g1")).toEqual(a);
    expect(await testPrisma.audit.count({ where: { userId: B, type: "caper_fine" } })).toBe(2);
  });

  it("applyEconomyPenaltyTx rolls back with its transaction", async () => {
    await money(100_000, 0);
    await expect(prisma.$transaction(async (tx) => { await applyEconomyPenaltyTx(tx, B, "B", 50_000, "caper_fine", {}); throw new Error("abort"); })).rejects.toThrow("abort");
    expect((await testPrisma.wallet.findUnique({ where: { userId: B } }))!.balance).toBe(100_000);
    expect(await testPrisma.audit.count({ where: { userId: B, type: "caper_fine" } })).toBe(0);
  });

  it("addCrimeHeatTx adds rounded heat inside the transaction and rolls back with it", async () => {
    await testPrisma.user.update({ where: { discordId: B }, data: { crimeHeat: 10 } });
    expect(await prisma.$transaction((tx) => addCrimeHeatTx(tx, B, 45))).toBe(55);
    await expect(prisma.$transaction(async (tx) => { await addCrimeHeatTx(tx, B, 20); throw new Error("abort"); })).rejects.toThrow("abort");
    expect((await user())!.crimeHeat).toBe(55);
  });

  it("jailUserTx never shortens a longer sentence and replaces an expired one", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const later = new Date(+now + 5_000_000);
    await testPrisma.user.update({ where: { discordId: B }, data: { isJailed: true, jailReleaseTime: later } });
    expect(await prisma.$transaction((tx) => jailUserTx(tx, B, 1_200, now))).toEqual(later);
    await testPrisma.user.update({ where: { discordId: B }, data: { isJailed: true, jailReleaseTime: new Date(+now - 1) } });
    expect(+(await prisma.$transaction((tx) => jailUserTx(tx, B, 1_200, now)))).toBe(+now + 1_200_000);
    expect(await user()).toMatchObject({ isJailed: true, jailReleaseTime: new Date(+now + 1_200_000) });
  });
});
