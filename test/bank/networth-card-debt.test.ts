import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser, flushTestKeys } from "../helpers";
import { getNetWorth } from "../../src/services/netWorthService";
import { getFinancialSummary } from "../../src/services/bankingService";
import { CARD_TIERS } from "../../src/utils/economyConfig";

// Card withdrawals land in the wallet, so ignoring the card balance let a
// player inflate net worth (and the net leaderboard) by their credit limit.
// The profile already subtracts it; both net-worth figures must agree.

const id = "networth-card-debt-1";
const tier = CARD_TIERS.STARTER;

async function cleanCard() {
  await testPrisma.creditCard.deleteMany({ where: { userId: id } });
}

describe("net worth subtracts credit-card debt", () => {
  beforeEach(async () => {
    await cleanCard();
    await seedUser(id);
    await flushTestKeys(`networth:${id}`);
    await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 10_000 } });
    await testPrisma.creditCard.create({
      data: {
        userId: id,
        tier: tier.tier,
        status: "ACTIVE",
        creditLimit: tier.creditLimit,
        weeklyInterestPct: tier.weeklyInterestPct,
        weeklySpendCap: tier.weeklySpendCap,
        weeklyWithdrawCap: tier.weeklyWithdrawCap,
        currentBalance: 4_000,
      },
    });
  });
  afterAll(async () => {
    await cleanCard();
    await resetUser(id);
  });

  it("getNetWorth (leaderboard)", async () => {
    const nw = await getNetWorth(id);
    expect(nw.total).toBe(6_000);
  });

  it("getFinancialSummary (bank overview)", async () => {
    const summary = await getFinancialSummary(id);
    expect(summary.netWorth).toBe(6_000);
  });
});
