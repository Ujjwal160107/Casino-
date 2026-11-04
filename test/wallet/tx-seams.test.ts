import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { addBalance, creditWalletInTx, debitWalletInTx, InsufficientFundsError } from "../../src/services/walletService";
import { computeNetWorth } from "../../src/services/netWorthService";
import { questBus } from "../../src/services/questEvents";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";
import { parsePositiveAmount, fmtFortunes } from "../../src/utils/format";
import { testPrisma, testRedis, seedUser, resetUser } from "../helpers";

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
