import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { getInvestmentReturns, processAllInvestments } from "../../src/services/bankingService";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";

// Matured FDs/RDs used to flip to COMPLETED and credit the bank with no record
// of what they paid. These tests pin the payout fields that the maturity DM and
// the bank history read.

const id = "bank-invest-returns";
const DAY_MS = 24 * 60 * 60 * 1000;

async function resetAll() {
  await testPrisma.investment.deleteMany({ where: { userId: id } });
  await testPrisma.bank.deleteMany({ where: { userId: id } });
  await resetUser(id);
}

async function seedBank(balance: number) {
  await seedUser(id);
  await testPrisma.bank.create({ data: { userId: id, balance } });
}

// maturityDate = now − maturedDaysAgo; startDate = maturityDate − lockedDays.
// A negative maturedDaysAgo puts maturity in the future.
function seedInvestment(
  over: Partial<{ type: string; amount: number; lockedDays: number; maturedDaysAgo: number }> = {},
) {
  const lockedDays = over.lockedDays ?? 10;
  const maturedDaysAgo = over.maturedDaysAgo ?? 1;
  const maturityDate = new Date(Date.now() - maturedDaysAgo * DAY_MS);
  return testPrisma.investment.create({
    data: {
      userId: id,
      type: over.type ?? "FD",
      amount: over.amount ?? 365_000,
      interestRate: 10,
      startDate: new Date(maturityDate.getTime() - lockedDays * DAY_MS),
      maturityDate,
      status: "ACTIVE",
    },
  });
}

beforeEach(resetAll);

describe("matureInvestment records what the deposit paid", () => {
  it("writes completedAt, interestEarned and payout, and credits the bank", async () => {
    await seedBank(0);
    // 365,000 at 10% APR for 10 days = 1,000 interest exactly.
    const inv = await seedInvestment();

    const matured = await processAllInvestments();
    const mine = matured.find((m) => m.id === inv.id);
    expect(mine?.payout).toBe(366_000);
    expect(mine?.investment.userId).toBe(id);

    const row = await testPrisma.investment.findUnique({ where: { id: inv.id } });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.interestEarned).toBe(1000);
    expect(row?.payout).toBe(366_000);
    expect(row?.completedAt).toBeInstanceOf(Date);

    const bank = await testPrisma.bank.findUnique({ where: { userId: id } });
    expect(bank?.balance).toBe(366_000);
  });

  it("keeps the pre-cap interest when the bank cap truncates the payout", async () => {
    await seedBank(MAX_SAFE_BALANCE);
    const inv = await seedInvestment();

    await processAllInvestments();

    const row = await testPrisma.investment.findUnique({ where: { id: inv.id } });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.interestEarned).toBe(1000);
    expect(row?.payout).toBe(0);
  });

  it("leaves a deposit that has not matured alone", async () => {
    await seedBank(0);
    const inv = await seedInvestment({ maturedDaysAgo: -5 });

    await processAllInvestments();

    const row = await testPrisma.investment.findUnique({ where: { id: inv.id } });
    expect(row?.status).toBe("ACTIVE");
    expect(row?.completedAt).toBeNull();
  });
});

describe("getInvestmentReturns", () => {
  function completedRow(over: { daysAgo: number; amount: number; interestEarned: number; type?: string }) {
    return testPrisma.investment.create({
      data: {
        userId: id,
        type: over.type ?? "FD",
        amount: over.amount,
        interestRate: 10,
        startDate: new Date(),
        maturityDate: new Date(),
        status: "COMPLETED",
        completedAt: new Date(Date.now() - over.daysAgo * DAY_MS),
        interestEarned: over.interestEarned,
        payout: over.amount + over.interestEarned,
      },
    });
  }

  it("returns the newest matured deposits first, skips legacy rows, and sums lifetime interest", async () => {
    await seedBank(0);
    // Legacy: completed before payout recording existed. No completedAt, no payout.
    await testPrisma.investment.create({
      data: {
        userId: id, type: "FD", amount: 1, interestRate: 10,
        startDate: new Date(), maturityDate: new Date(), status: "COMPLETED",
      },
    });
    for (let i = 0; i < 6; i++) {
      await completedRow({ daysAgo: i, amount: 1000 * (i + 1), interestEarned: 10 * (i + 1) });
    }

    const returns = await getInvestmentReturns(id);

    expect(returns.recent).toHaveLength(5);
    expect(returns.recent[0].amount).toBe(1000);
    expect(returns.recent[4].amount).toBe(5000);
    expect(returns.recent.every((r) => r.completedAt instanceof Date)).toBe(true);
    // 10 + 20 + … + 60: every recorded return counts, not just the five shown.
    expect(returns.lifetimeInterest).toBe(210);

    // With room for every row, the legacy one must still be absent: the isSet
    // filter excludes it, not the sort order.
    const all = await getInvestmentReturns(id, 10);
    expect(all.recent).toHaveLength(6);
    expect(all.recent.some((r) => r.amount === 1)).toBe(false);
  });

  it("is empty for a player with no recorded returns", async () => {
    await seedBank(0);
    const returns = await getInvestmentReturns(id);
    expect(returns.recent).toEqual([]);
    expect(returns.lifetimeInterest).toBe(0);
  });
});
