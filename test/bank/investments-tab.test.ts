import { describe, it, expect } from "vitest";
import { buildBankInvestmentsContainer } from "../../src/commands/economy/bank";
import type { InvestmentReturns } from "../../src/services/bankingService";

// Builder-only test: no DB. Verifies the Recent Returns block is one packed
// TextDisplay (the 40-component cap) and that the numbers render.

const summary = { netWorth: 0, walletBalance: 0, bankBalance: 0, creditScore: 500, investments: [] } as any;
const AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

function completed(over: Partial<{ amount: number; interestEarned: number; payout: number }> = {}) {
  const amount = over.amount ?? 100_000;
  const interestEarned = over.interestEarned ?? 1000;
  const now = new Date();
  return {
    id: "inv", userId: "u", type: "FD", amount, interestRate: 10,
    startDate: now, maturityDate: now, status: "COMPLETED",
    completedAt: now, interestEarned, payout: over.payout ?? amount + interestEarned, updatedAt: now,
  } as InvestmentReturns["recent"][number];
}

function render(returns: InvestmentReturns) {
  const json = buildBankInvestmentsContainer("Yash", AVATAR, summary, "u", returns).toJSON() as any;
  return { json, text: JSON.stringify(json) };
}

describe("buildBankInvestmentsContainer", () => {
  it("shows lifetime interest and one line per recent return in a single text block", () => {
    const { json, text } = render({
      recent: [completed(), completed({ amount: 50_000, interestEarned: 54 })],
      lifetimeInterest: 1054,
    });
    expect(text).toContain("Recorded interest earned:");
    expect(text).toContain("1,054");
    expect(text).toContain("### Recent returns");
    expect(text).toContain("101,000");
    expect(text).toContain("(+1,000)");
    expect(text).toContain("50,054");
    expect(text).toContain("since payout tracking began");
    // header section, separator, "No active investments", separator, recent returns, nav row
    expect(json.components).toHaveLength(6);
  });

  it("flags a bank-cap shortfall on the line", () => {
    const { text } = render({ recent: [completed({ payout: 100_500 })], lifetimeInterest: 1000 });
    expect(text).toContain("bank full, −500");
  });

  it("says so when there is no history yet", () => {
    const { text } = render({ recent: [], lifetimeInterest: 0 });
    expect(text).toContain("No recorded returns yet.");
  });
});
