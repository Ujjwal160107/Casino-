import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { applyGarnishment, settleDueStatements } from "../../src/services/creditCardService";
import { CARD_TIERS, calculateMinimumDue, getCycleKey } from "../../src/utils/economyConfig";

const id = "card-garnish-1";
const tier = CARD_TIERS.STARTER;
const DAY = 24 * 3_600_000;

async function cleanCard() {
  const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
  if (!card) return;
  await testPrisma.cardTransaction.deleteMany({ where: { cardId: card.id } });
  await testPrisma.cardStatement.deleteMany({ where: { cardId: card.id } });
  await testPrisma.creditCard.delete({ where: { id: card.id } });
}

/** A DELINQUENT card whose OPEN statement is already past due, nothing paid on it. */
async function seedDelinquent(opts: { statementBalance: number; currentBalance?: number }) {
  const weekAgo = new Date(Date.now() - 8 * DAY);
  const card = await testPrisma.creditCard.create({
    data: {
      userId: id,
      tier: tier.tier,
      status: "DELINQUENT",
      missStreak: 1,
      creditLimit: tier.creditLimit,
      weeklyInterestPct: tier.weeklyInterestPct,
      weeklySpendCap: tier.weeklySpendCap,
      weeklyWithdrawCap: tier.weeklyWithdrawCap,
      currentBalance: opts.currentBalance ?? opts.statementBalance,
      statementBalance: opts.statementBalance,
      nextStatementAt: new Date(Date.now() + 6 * DAY),
      currentCycleKey: getCycleKey(weekAgo),
    },
  });
  const statement = await testPrisma.cardStatement.create({
    data: {
      cardId: card.id,
      cycleKey: getCycleKey(weekAgo),
      statementAt: weekAgo,
      dueAt: new Date(Date.now() - 60_000),
      statementBalance: opts.statementBalance,
      minimumDue: calculateMinimumDue(opts.statementBalance, tier),
      amountPaid: 0,
      status: "OPEN",
    },
  });
  return { card, statement };
}

async function settleMine() {
  return (await settleDueStatements()).filter((s) => s.userId === id);
}

describe("card garnishment", () => {
  beforeEach(async () => {
    await cleanCard();
    await seedUser(id);
  });
  afterAll(async () => {
    await cleanCard();
    await resetUser(id);
  });

  it("credits the open statement, so a fully garnished debt settles as paid with no interest", async () => {
    const { statement } = await seedDelinquent({ statementBalance: 1_000 });
    await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 4_000 } });

    const { garnished } = await applyGarnishment(id, 4_000);
    expect(garnished).toBe(1_000);

    const stmt = await testPrisma.cardStatement.findUniqueOrThrow({ where: { id: statement.id } });
    expect(stmt.amountPaid).toBe(1_000);

    const [o] = await settleMine();
    expect(o).toMatchObject({ status: "PAID_FULL", interestCharged: 0, remainingBalance: 0 });
  });

  it("never charges interest on more than the card still owes", async () => {
    // Debt already reduced outside the statement (e.g. a garnishment before
    // statements were credited): interest must follow the real balance.
    await seedDelinquent({ statementBalance: 500_000, currentBalance: 1_000 });
    const [o] = await settleMine();
    expect(o.status).toBe("MISSED");
    expect(o.interestCharged).toBe(Math.floor(1_000 * tier.weeklyInterestPct / 100));
  });
});
