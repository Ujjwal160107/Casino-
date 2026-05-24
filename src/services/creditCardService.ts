import prisma, { runWithRetry } from "../utils/prisma";
import { PrismaClient } from "@prisma/client";
import {
  calculateMinimumDue,
  CARD_SCORE_RULES,
  CARD_TIER_ORDER,
  CardTierConfig,
  clampCardScore,
  getCardTierConfig,
  getCycleKey,
  getEligibleCardTier,
  MAX_SAFE_BALANCE
} from "../utils/economyConfig";
import { getUserCareerTier } from "./jobService";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function nextWeek(date = new Date()) {
  return new Date(date.getTime() + WEEK_MS);
}

function requireIntAmount(amount: number) {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Amount must be a positive number.");
  return value;
}

function cardDataFromTier(userId: string, tier: CardTierConfig) {
  const now = new Date();
  return {
    userId,
    tier: tier.tier,
    status: "ACTIVE",
    creditLimit: tier.creditLimit,
    currentBalance: 0,
    statementBalance: 0,
    minimumDue: 0,
    weeklyInterestPct: tier.weeklyInterestPct,
    weeklySpendCap: tier.weeklySpendCap,
    weeklyWithdrawCap: tier.weeklyWithdrawCap,
    spentThisCycle: 0,
    withdrawnThisCycle: 0,
    paidThisCycle: 0,
    dueSatisfiedThisCycle: false,
    missStreak: 0,
    nextStatementAt: nextWeek(now),
    currentCycleKey: getCycleKey(now)
  };
}

function cardTierUpdateData(tier: CardTierConfig) {
  return {
    tier: tier.tier,
    creditLimit: tier.creditLimit,
    weeklyInterestPct: tier.weeklyInterestPct,
    weeklySpendCap: tier.weeklySpendCap,
    weeklyWithdrawCap: tier.weeklyWithdrawCap
  };
}

async function getEligibleTierForUser(tx: any, discordId: string) {
  const user = await tx.user.findUnique({ where: { discordId } });
  if (!user) throw new Error("User not found.");
  const careerTier = getUserCareerTier(user);
  const tier = getEligibleCardTier(user, careerTier);
  if (!tier) throw new Error("You are not eligible for a credit card yet.");
  return { user, careerTier, tier };
}

export async function getCardSummary(discordId: string) {
  const [user, card] = await Promise.all([
    prisma.user.findUnique({ where: { discordId } }),
    prisma.creditCard.findUnique({
      where: { userId: discordId },
      include: {
        statements: { orderBy: { statementAt: "desc" }, take: 3 },
        transactions: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    })
  ]);

  const careerTier = user ? getUserCareerTier(user) : 0;
  const eligibleTier = user ? getEligibleCardTier(user, careerTier) : null;
  return { user, card, careerTier, eligibleTier };
}

export async function getCardEligibilitySummary(discordId: string) {
  const summary = await getCardSummary(discordId);
  const ownedTier = summary.card ? getCardTierConfig(summary.card.tier).tier : null;
  const tiers = CARD_TIER_ORDER.map((tierName) => {
    const tier = getCardTierConfig(tierName);
    const scoreMet = (summary.user?.creditScore ?? 0) >= tier.reqScore;
    const careerMet = summary.careerTier >= tier.reqCareerTier;
    const alreadyOwned = ownedTier === tier.tier;

    return {
      tier,
      scoreMet,
      careerMet,
      alreadyOwned,
      eligible: Boolean(summary.user) && scoreMet && careerMet,
      locked: !summary.user || !scoreMet || !careerMet
    };
  });

  return { ...summary, tiers };
}

export async function issueCard(discordId: string) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const existing = await trx.creditCard.findUnique({ where: { userId: discordId } });
      if (existing && ["ACTIVE", "DELINQUENT", "LOCKED"].includes(existing.status)) {
        throw new Error("You already have a credit card.");
      }

      const { tier } = await getEligibleTierForUser(trx, discordId);
      if (existing?.status === "CLOSED") {
        await trx.cardStatement.deleteMany({ where: { cardId: existing.id } });
        await trx.cardTransaction.deleteMany({ where: { cardId: existing.id } });
        return trx.creditCard.update({
          where: { id: existing.id },
          data: cardDataFromTier(discordId, tier)
        });
      }

      return trx.creditCard.create({ data: cardDataFromTier(discordId, tier) });
    });
  });
}

export async function upgradeCard(discordId: string) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const card = await trx.creditCard.findUnique({ where: { userId: discordId } });
      if (!card) throw new Error("You do not have a card yet.");
      if (card.status === "DELINQUENT") throw new Error("Delinquent cards cannot be upgraded.");
      if (card.status === "LOCKED") throw new Error("Locked cards cannot be upgraded.");
      if (card.status === "CLOSED") throw new Error("Closed cards cannot be upgraded.");

      if (card.currentBalance > 0) {
        const utilization = card.currentBalance / card.creditLimit;
        if (utilization > 0.5) {
          throw new Error(`Pay down your balance to below 50% utilization before upgrading. Current: ${Math.round(utilization * 100)}%`);
        }
      }

      const { tier } = await getEligibleTierForUser(trx, discordId);
      const current = getCardTierConfig(card.tier);
      if (tier.creditLimit <= current.creditLimit) {
        throw new Error(`You are not eligible for a higher tier than ${card.tier}.`);
      }

      return trx.creditCard.update({
        where: { id: card.id },
        data: cardTierUpdateData(tier)
      });
    });
  });
}

export async function applyForCardTier(discordId: string, requestedTierName: string) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const existing = await trx.creditCard.findUnique({ where: { userId: discordId } });
      if (existing?.status === "DELINQUENT") throw new Error("Delinquent cards cannot be upgraded.");
      if (existing?.status === "LOCKED") throw new Error("Locked cards cannot be changed.");

      if (existing && existing.currentBalance > 0) {
        const utilization = existing.currentBalance / existing.creditLimit;
        if (utilization > 0.5) {
          throw new Error(`Pay down your balance to below 50% utilization before changing tiers. Current: ${Math.round(utilization * 100)}%`);
        }
      }

      const requestedTier = getCardTierConfig(requestedTierName);
      const { user, careerTier } = await getEligibleTierForUser(trx, discordId);
      const canUseTier = user.creditScore >= requestedTier.reqScore && careerTier >= requestedTier.reqCareerTier;
      if (!canUseTier) throw new Error(`You do not meet the requirements for ${requestedTier.tier}.`);

      if (existing && ["ACTIVE"].includes(existing.status)) {
        const currentTier = getCardTierConfig(existing.tier);
        if (requestedTier.tier === currentTier.tier) throw new Error("You already own this card.");
        if (requestedTier.creditLimit <= currentTier.creditLimit) {
          throw new Error("You already have this tier covered by your current card.");
        }

        return trx.creditCard.update({
          where: { id: existing.id },
          data: cardTierUpdateData(requestedTier)
        });
      }

      if (existing?.status === "CLOSED") {
        await trx.cardStatement.deleteMany({ where: { cardId: existing.id } });
        await trx.cardTransaction.deleteMany({ where: { cardId: existing.id } });
        return trx.creditCard.update({
          where: { id: existing.id },
          data: cardDataFromTier(discordId, requestedTier)
        });
      }

      return trx.creditCard.create({ data: cardDataFromTier(discordId, requestedTier) });
    });
  });
}

export async function closeCard(discordId: string) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const card = await trx.creditCard.findUnique({ where: { userId: discordId } });
      if (!card) throw new Error("You do not have a card.");
      if (card.currentBalance > 0) throw new Error("You cannot close a card with a nonzero balance.");
      return trx.creditCard.update({ where: { id: card.id }, data: { status: "CLOSED" } });
    });
  });
}

export async function payCard(discordId: string, amount: number) {
  const paymentAmount = requireIntAmount(amount);

  const result = await runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const [card, wallet] = await Promise.all([
        trx.creditCard.findUnique({ where: { userId: discordId } }),
        trx.wallet.findUnique({ where: { userId: discordId } })
      ]);
      if (!card) throw new Error("You do not have a card.");
      if (!wallet) throw new Error("Wallet not found.");
      if (wallet.balance < paymentAmount) throw new Error("Insufficient wallet balance.");
      if (card.currentBalance <= 0) throw new Error("Your card has no balance to pay.");

      const appliedAmount = Math.min(paymentAmount, card.currentBalance);
      const openStatement = await trx.cardStatement.findFirst({
        where: { cardId: card.id, status: "OPEN" },
        orderBy: { statementAt: "asc" }
      });
      const statementPaid = openStatement ? Math.min(appliedAmount, Math.max(0, openStatement.statementBalance - openStatement.amountPaid)) : 0;

      await trx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: appliedAmount } }
      });

      const updatedCard = await trx.creditCard.update({
        where: { id: card.id },
        data: {
          currentBalance: { decrement: appliedAmount },
          paidThisCycle: { increment: appliedAmount },
          dueSatisfiedThisCycle: openStatement ? openStatement.amountPaid + statementPaid >= openStatement.minimumDue : card.dueSatisfiedThisCycle,
          lastPaymentAt: new Date(),
          lastPaymentAmount: appliedAmount
        }
      });

      if (openStatement && statementPaid > 0) {
        await trx.cardStatement.update({
          where: { id: openStatement.id },
          data: { amountPaid: { increment: statementPaid } }
        });
      }

      await trx.cardTransaction.create({
        data: {
          cardId: card.id,
          type: "PAYMENT",
          amount: appliedAmount,
          cycleKey: card.currentCycleKey,
          meta: { requestedAmount: paymentAmount, statementPaid }
        }
      });

      return { card: updatedCard, paid: appliedAmount, statementPaid };
    });
  });

  const { questBus } = require("./questEvents");
  questBus.emit("card:payment", { discordId });

  return result;
}

export async function withdrawFromCard(discordId: string, amount: number) {
  const withdrawAmount = requireIntAmount(amount);

  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const [card, wallet] = await Promise.all([
        trx.creditCard.findUnique({ where: { userId: discordId } }),
        trx.wallet.findUnique({ where: { userId: discordId } })
      ]);
      if (!card) throw new Error("You do not have a card.");
      if (!wallet) throw new Error("Wallet not found.");
      if (card.status !== "ACTIVE") throw new Error("Only active cards can be used for withdrawals.");
      if (card.currentBalance + withdrawAmount > card.creditLimit) throw new Error("This withdrawal would exceed your credit limit.");
      if (card.withdrawnThisCycle + withdrawAmount > card.weeklyWithdrawCap) throw new Error("This withdrawal would exceed your weekly card withdrawal cap.");
      if (wallet.balance + withdrawAmount > MAX_SAFE_BALANCE) throw new Error("Your wallet is at the global safety cap.");

      const updatedWallet = await trx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: withdrawAmount } }
      });

      const updatedCard = await trx.creditCard.update({
        where: { id: card.id },
        data: {
          currentBalance: { increment: withdrawAmount },
          withdrawnThisCycle: { increment: withdrawAmount }
        }
      });

      await trx.cardTransaction.create({
        data: {
          cardId: card.id,
          type: "WITHDRAW",
          amount: withdrawAmount,
          cycleKey: card.currentCycleKey,
          meta: { toWalletId: wallet.id }
        }
      });

      return { card: updatedCard, wallet: updatedWallet, amount: withdrawAmount };
    });
  });
}

export async function chargeCardPurchase(discordId: string, amount: number, meta: any = {}) {
  const purchaseAmount = requireIntAmount(amount);

  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      return chargeCardPurchaseTx(trx, discordId, purchaseAmount, meta);
    });
  });
}

export async function chargeCardPurchaseTx(trx: any, discordId: string, amount: number, meta: any = {}) {
  const purchaseAmount = requireIntAmount(amount);
  const card = await trx.creditCard.findUnique({ where: { userId: discordId } });
  if (!card) throw new Error("You do not have a card.");
  if (card.status !== "ACTIVE") throw new Error("Only active cards can be used for purchases.");
  if (card.currentBalance + purchaseAmount > card.creditLimit) throw new Error("This purchase would exceed your credit limit.");
  if (card.spentThisCycle + purchaseAmount > card.weeklySpendCap) throw new Error("This purchase would exceed your weekly card spend cap.");

  const updatedCard = await trx.creditCard.update({
    where: { id: card.id },
    data: {
      currentBalance: { increment: purchaseAmount },
      spentThisCycle: { increment: purchaseAmount }
    }
  });

  await trx.cardTransaction.create({
    data: {
      cardId: card.id,
      type: "PURCHASE",
      amount: purchaseAmount,
      cycleKey: card.currentCycleKey,
      meta
    }
  });

  return { card: updatedCard, amount: purchaseAmount };
}

export async function rehabilitateCard(discordId: string) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const card = await trx.creditCard.findUnique({ where: { userId: discordId } });
      if (!card) throw new Error("You do not have a card.");
      if (card.status !== "LOCKED") throw new Error("Your card is not locked. Only locked cards can be rehabilitated.");
      if (card.currentBalance > 0) throw new Error(`Pay off your full balance (**${card.currentBalance.toLocaleString()}** remaining) to unlock your card.`);

      return trx.creditCard.update({
        where: { id: card.id },
        data: { status: "ACTIVE", missStreak: 0 }
      });
    });
  });
}

export async function applyGarnishment(discordId: string, incomeAmount: number): Promise<{ garnished: number; netIncome: number }> {
  const card = await prisma.creditCard.findUnique({ where: { userId: discordId } });
  if (!card || !["DELINQUENT", "LOCKED"].includes(card.status) || card.currentBalance <= 0) {
    return { garnished: 0, netIncome: incomeAmount };
  }

  const GARNISH_RATE = 0.25;
  const garnishAmount = Math.min(
    Math.floor(incomeAmount * GARNISH_RATE),
    card.currentBalance
  );

  if (garnishAmount <= 0) return { garnished: 0, netIncome: incomeAmount };

  await prisma.creditCard.update({
    where: { id: card.id },
    data: { currentBalance: { decrement: garnishAmount } }
  });

  await prisma.cardTransaction.create({
    data: {
      cardId: card.id,
      type: "GARNISHMENT",
      amount: garnishAmount,
      cycleKey: card.currentCycleKey,
      meta: { source: "income_garnishment", originalIncome: incomeAmount }
    }
  });

  return { garnished: garnishAmount, netIncome: incomeAmount - garnishAmount };
}

export async function generateWeeklyStatements(now = new Date()) {
  const cards = await prisma.creditCard.findMany({
    where: {
      status: { in: ["ACTIVE", "DELINQUENT"] },
      OR: [{ nextStatementAt: null }, { nextStatementAt: { lte: now } }]
    }
  });

  let count = 0;
  for (const card of cards) {
    const created = await generateStatementForCard(card.id, now);
    if (created) count++;
  }
  return count;
}

async function generateStatementForCard(cardId: string, now: Date) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const card = await trx.creditCard.findUnique({ where: { id: cardId } });
      if (!card || card.status === "LOCKED" || card.status === "CLOSED") return false;

      const cycleKey = getCycleKey(now);
      const existing = await trx.cardStatement.findUnique({
        where: { cardId_cycleKey: { cardId: card.id, cycleKey } }
      });
      if (existing) return false;

      const tier = getCardTierConfig(card.tier);
      const statementBalance = card.currentBalance;
      const minimumDue = calculateMinimumDue(statementBalance, tier);
      const dueAt = nextWeek(now);

      await trx.cardStatement.create({
        data: {
          cardId: card.id,
          cycleKey,
          statementAt: now,
          dueAt,
          statementBalance,
          minimumDue,
          amountPaid: 0,
          status: "OPEN"
        }
      });

      await trx.cardTransaction.create({
        data: {
          cardId: card.id,
          type: "STATEMENT",
          amount: statementBalance,
          cycleKey,
          meta: { minimumDue, dueAt }
        }
      });

      await trx.creditCard.update({
        where: { id: card.id },
        data: {
          statementBalance,
          minimumDue,
          paidThisCycle: 0,
          dueSatisfiedThisCycle: minimumDue === 0,
          spentThisCycle: 0,
          withdrawnThisCycle: 0,
          lastStatementAt: now,
          nextStatementAt: nextWeek(now),
          dueAt,
          currentCycleKey: cycleKey
        }
      });

      return true;
    });
  });
}

export async function settleDueStatements(now = new Date()) {
  const statements = await prisma.cardStatement.findMany({
    where: {
      status: "OPEN",
      dueAt: { lte: now },
      scoreDeltaApplied: false
    },
    select: { id: true }
  });

  let count = 0;
  for (const statement of statements) {
    const settled = await settleStatement(statement.id);
    if (settled) count++;
  }
  return count;
}

async function settleStatement(statementId: string) {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const statement = await trx.cardStatement.findUnique({
        where: { id: statementId },
        include: { card: true }
      });
      if (!statement || statement.status !== "OPEN" || statement.scoreDeltaApplied) return false;

      const user = await trx.user.findUnique({ where: { discordId: statement.card.userId } });
      if (!user) return false;

      const paidMinimum = statement.amountPaid >= statement.minimumDue;
      const paidFull = statement.amountPaid >= statement.statementBalance;
      const tier = getCardTierConfig(statement.card.tier);

      let status = "MISSED";
      let scoreDelta: number = CARD_SCORE_RULES.missPayment;
      let interestCharged = 0;
      const lateFeeCharged = 0;
      let cardStatus = statement.card.status;
      let missStreak = statement.card.missStreak;

      if (paidFull) {
        status = "PAID_FULL";
        scoreDelta = CARD_SCORE_RULES.payFullStatement;
        missStreak = 0;
        cardStatus = "ACTIVE";
      } else if (paidMinimum) {
        status = "PAID_MINIMUM";
        scoreDelta = CARD_SCORE_RULES.payMinimumOnTime;
        missStreak = Math.max(0, missStreak - 1);
        cardStatus = "ACTIVE";
      } else {
        missStreak += 1;
        scoreDelta = missStreak > 1 ? CARD_SCORE_RULES.repeatMiss : CARD_SCORE_RULES.missPayment;
        cardStatus = missStreak >= 3 ? "LOCKED" : "DELINQUENT";
        const unpaid = Math.max(0, statement.statementBalance - statement.amountPaid);
        interestCharged = Math.floor(unpaid * (tier.weeklyInterestPct / 100));
      }

      await trx.cardStatement.update({
        where: { id: statement.id },
        data: {
          status,
          interestCharged,
          lateFeeCharged,
          scoreDeltaApplied: true
        }
      });

      const maxBalance = Math.floor(statement.card.creditLimit * 1.5);
      const headroom = Math.max(0, maxBalance - statement.card.currentBalance);
      const rawIncrement = interestCharged + lateFeeCharged;
      const balanceIncrement = Math.min(rawIncrement, headroom);

      await trx.creditCard.update({
        where: { id: statement.card.id },
        data: {
          currentBalance: { increment: balanceIncrement },
          status: cardStatus,
          missStreak,
          dueSatisfiedThisCycle: paidMinimum
        }
      });

      if (balanceIncrement > 0) {
        await trx.cardTransaction.create({
          data: {
            cardId: statement.card.id,
            type: "INTEREST",
            amount: balanceIncrement,
            cycleKey: statement.cycleKey,
            meta: { interestCharged, lateFeeCharged }
          }
        });
      }

      await trx.user.update({
        where: { discordId: user.discordId },
        data: { creditScore: clampCardScore(user.creditScore + scoreDelta) }
      });

      return true;
    });
  });
}

export async function processWeeklyCardSettlement(now = new Date()) {
  const generatedStatements = await generateWeeklyStatements(now);
  const settledStatements = await settleDueStatements(now);
  return { settledStatements, generatedStatements };
}
