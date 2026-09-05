import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { generateWeeklyStatements, settleDueStatements } from "../../src/services/creditCardService";
import { CARD_SCORE_RULES, CARD_TIERS, calculateMinimumDue, getCycleKey } from "../../src/utils/economyConfig";

const id = "card-settle-1";
const tier = CARD_TIERS.STARTER;
const DAY = 24 * 3_600_000;

const baseCard = {
  userId: id,
  tier: tier.tier,
  status: "ACTIVE",
  creditLimit: tier.creditLimit,
  weeklyInterestPct: tier.weeklyInterestPct,
  weeklySpendCap: tier.weeklySpendCap,
  weeklyWithdrawCap: tier.weeklyWithdrawCap,
};

async function cleanCard() {
  const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
  if (!card) return;
  await testPrisma.cardTransaction.deleteMany({ where: { cardId: card.id } });
  await testPrisma.cardStatement.deleteMany({ where: { cardId: card.id } });
  await testPrisma.creditCard.delete({ where: { id: card.id } });
}

/** A card whose last statement is OPEN and past due, with `paid` already applied. */
async function seedOverdueStatement(opts: { balance: number; paid: number; missStreak?: number }) {
  const weekAgo = new Date(Date.now() - 8 * DAY);
  const card = await testPrisma.creditCard.create({
    data: {
      ...baseCard,
      currentBalance: opts.balance - opts.paid,
      statementBalance: opts.balance,
      missStreak: opts.missStreak ?? 0,
      nextStatementAt: new Date(Date.now() + 6 * DAY), // not due, so generation stays out of these tests
      currentCycleKey: getCycleKey(weekAgo),
    },
  });
  await testPrisma.cardStatement.create({
    data: {
      cardId: card.id,
      cycleKey: getCycleKey(weekAgo),
      statementAt: weekAgo,
      dueAt: new Date(Date.now() - 60_000),
      statementBalance: opts.balance,
      minimumDue: calculateMinimumDue(opts.balance, tier),
      amountPaid: opts.paid,
      status: "OPEN",
    },
  });
}

async function settleMine() {
  return (await settleDueStatements()).filter((s) => s.userId === id);
}

describe("settleDueStatements outcomes", () => {
  beforeEach(async () => {
    await cleanCard();
    await seedUser(id);
  });
  afterAll(async () => {
    await cleanCard();
    await resetUser(id);
  });

  it("PAID_FULL: full-payment score bonus, card ACTIVE, nothing remaining", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 500_000 });
    const results = await settleMine();
    expect(results).toHaveLength(1);
    const [o] = results;
    expect(o).toMatchObject({
      userId: id,
      status: "PAID_FULL",
      scoreDelta: CARD_SCORE_RULES.payFullStatement,
      interestCharged: 0,
      cardStatus: "ACTIVE",
      remainingBalance: 0,
    });
  });

  it("PAID_MINIMUM: minimum-payment bonus and the rest rolls forward", async () => {
    const min = calculateMinimumDue(500_000, tier);
    await seedOverdueStatement({ balance: 500_000, paid: min });
    const [o] = await settleMine();
    expect(o).toMatchObject({
      status: "PAID_MINIMUM",
      scoreDelta: CARD_SCORE_RULES.payMinimumOnTime,
      interestCharged: 0,
      cardStatus: "ACTIVE",
      remainingBalance: 500_000 - min,
    });
  });

  it("MISSED, first time: miss penalty, interest on the unpaid part, card DELINQUENT", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 0 });
    const [o] = await settleMine();
    expect(o).toMatchObject({
      status: "MISSED",
      scoreDelta: CARD_SCORE_RULES.missPayment,
      interestCharged: Math.floor(500_000 * tier.weeklyInterestPct / 100),
      cardStatus: "DELINQUENT",
      remainingBalance: 500_000,
    });
  });

  it("MISSED, third in a row: repeat penalty and the card LOCKS", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 0, missStreak: 2 });
    const [o] = await settleMine();
    expect(o).toMatchObject({ status: "MISSED", scoreDelta: CARD_SCORE_RULES.repeatMiss, cardStatus: "LOCKED" });
  });

  it("an already-settled statement is not reported again", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 500_000 });
    await settleMine();
    expect(await settleMine()).toEqual([]);
  });
});

describe("generateWeeklyStatements", () => {
  beforeEach(async () => {
    await cleanCard();
    await seedUser(id);
  });
  afterAll(async () => {
    await cleanCard();
    await resetUser(id);
  });

  it("returns the issued statement with balance, minimum and a future due date", async () => {
    await testPrisma.creditCard.create({
      data: { ...baseCard, currentBalance: 250_000, nextStatementAt: new Date(Date.now() - 60_000) },
    });
    const issued = (await generateWeeklyStatements()).filter((s) => s.userId === id);
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({
      tier: tier.tier,
      statementBalance: 250_000,
      minimumDue: calculateMinimumDue(250_000, tier),
    });
    expect(issued[0].dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("reports a zero statement for a card with no balance (the notifier decides whether to DM)", async () => {
    await testPrisma.creditCard.create({
      data: { ...baseCard, currentBalance: 0, nextStatementAt: new Date(Date.now() - 60_000) },
    });
    const issued = (await generateWeeklyStatements()).filter((s) => s.userId === id);
    expect(issued).toHaveLength(1);
    expect(issued[0].statementBalance).toBe(0);
    expect(issued[0].minimumDue).toBe(0);
  });
});
