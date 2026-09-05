import prisma, { runWithRetry } from "../utils/prisma";
import { CreditCard, PrismaClient } from "@prisma/client";
import {
  calculateMinimumDue,
  CARD_SCORE_RULES,
  CARD_TIER_ORDER,
  CardTierConfig,
  CardTierName,
  cardTierMeets,
  clampCardScore,
  getCardTierConfig,
  getCycleKey,
  getEligibleCardTier,
  MAX_SAFE_BALANCE
} from "../utils/economyConfig";
import { getUserCareerTier } from "./jobService";
import { fmtCurrency } from "../utils/format";

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
  const nextStatement = nextWeek(now);
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
    nextStatementAt: nextStatement,
    dueAt: nextStatement,
    currentCycleKey: getCycleKey(now),
  };
}

export function getCardDisplaySnapshot(card: CreditCard) {
  const tier = getCardTierConfig(card.tier);
  const cycleEndsAt = card.dueAt ?? card.nextStatementAt;
  return {
    amountOwedNow: card.currentBalance,
    utilizationPct: card.creditLimit > 0 ? card.currentBalance / card.creditLimit : 0,
    projectedMinimumDue:
      card.currentBalance > 0 ? calculateMinimumDue(card.currentBalance, tier) : 0,
    cycleEndsAt,
  };
}

export function getCardPayMinimumAmount(
  card: CreditCard,
  openStatement?: { minimumDue: number; amountPaid: number; status: string } | null,
) {
  if (openStatement?.status === "OPEN") {
    return Math.max(0, openStatement.minimumDue - openStatement.amountPaid);
  }
  return getCardDisplaySnapshot(card).projectedMinimumDue;
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
  const openStatement = card
    ? await prisma.cardStatement.findFirst({
        where: { cardId: card.id, status: "OPEN" },
        orderBy: { statementAt: "desc" },
      })
    : null;
  return { user, card, careerTier, eligibleTier, openStatement };
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
      if (wallet.balance < paymentAmount) throw new Error("Insufficient wallet balance. Card payments use your wallet — use withdraw to move money from your bank first.");
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
      if (card.withdrawnThisCycle + withdrawAmount > card.weeklyWithdrawCap) {
        const remaining = Math.max(0, card.weeklyWithdrawCap - card.withdrawnThisCycle);
        throw new Error(
          `This withdrawal would exceed your weekly withdraw cap. Remaining this cycle: **${fmtCurrency(remaining)}**.`,
        );
      }
      if (wallet.balance + withdrawAmount > MAX_SAFE_BALANCE) throw new Error("Your wallet is at the maximum balance limit.");

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

export async function chargeCardPurchaseTx(
  trx: any,
  discordId: string,
  amount: number,
  meta: any = {},
  opts: { minTier?: CardTierName } = {},
) {
  const purchaseAmount = requireIntAmount(amount);
  const card = await trx.creditCard.findUnique({ where: { userId: discordId } });
  if (!card) throw new Error("You do not have a card.");
  if (card.status !== "ACTIVE") throw new Error("Only active cards can be used for purchases.");
  if (opts.minTier && !cardTierMeets(card.tier, opts.minTier)) {
    throw new Error(`This item needs a **${opts.minTier}** Fortuna Card or higher. Your card: **${card.tier}**.`);
  }
  if (card.currentBalance + purchaseAmount > card.creditLimit) throw new Error("This purchase would exceed your credit limit.");
  if (card.spentThisCycle + purchaseAmount > card.weeklySpendCap) {
    const remaining = Math.max(0, card.weeklySpendCap - card.spentThisCycle);
    throw new Error(
      `This purchase would exceed your weekly spend cap. Remaining this cycle: **${fmtCurrency(remaining)}** (${fmtCurrency(card.spentThisCycle)} / ${fmtCurrency(card.weeklySpendCap)} used).`,
    );
  }

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

export type StatementIssued = {
  userId: string;
  tier: string;
  statementBalance: number;
  minimumDue: number;
  dueAt: Date;
};

export type StatementOutcome = "PAID_FULL" | "PAID_MINIMUM" | "MISSED";

export type StatementSettled = {
  userId: string;
  status: StatementOutcome;
  scoreDelta: number;
  interestCharged: number;
  cardStatus: string;
  remainingBalance: number;
};

export async function generateWeeklyStatements(now = new Date()): Promise<StatementIssued[]> {
  const cards = await prisma.creditCard.findMany({
    where: {
      status: { in: ["ACTIVE", "DELINQUENT"] },
      OR: [{ nextStatementAt: null }, { nextStatementAt: { lte: now } }]
    }
  });

  const issued: StatementIssued[] = [];
  for (const card of cards) {
    const result = await generateStatementForCard(card.id, now);
    if (result) issued.push(result);
  }
  return issued;
}

async function generateStatementForCard(cardId: string, now: Date): Promise<StatementIssued | null> {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const card = await trx.creditCard.findUnique({ where: { id: cardId } });
      if (!card || card.status === "LOCKED" || card.status === "CLOSED") return null;

      const cycleKey = getCycleKey(now);
      const existing = await trx.cardStatement.findUnique({
        where: { cardId_cycleKey: { cardId: card.id, cycleKey } }
      });
      if (existing) return null;

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

      return { userId: card.userId, tier: card.tier, statementBalance, minimumDue, dueAt };
    });
  });
}

export async function settleDueStatements(now = new Date()): Promise<StatementSettled[]> {
  const statements = await prisma.cardStatement.findMany({
    where: {
      status: "OPEN",
      dueAt: { lte: now },
      scoreDeltaApplied: false
    },
    select: { id: true }
  });

  const settled: StatementSettled[] = [];
  for (const statement of statements) {
    const result = await settleStatement(statement.id);
    if (result) settled.push(result);
  }
  return settled;
}

async function settleStatement(statementId: string): Promise<StatementSettled | null> {
  return runWithRetry(async (tx: PrismaClient) => {
    return tx.$transaction(async (trx) => {
      const statement = await trx.cardStatement.findUnique({
        where: { id: statementId },
        include: { card: true }
      });
      if (!statement || statement.status !== "OPEN" || statement.scoreDeltaApplied) return null;

      const user = await trx.user.findUnique({ where: { discordId: statement.card.userId } });
      if (!user) return null;

      const paidMinimum = statement.amountPaid >= statement.minimumDue;
      const paidFull = statement.amountPaid >= statement.statementBalance;
      const tier = getCardTierConfig(statement.card.tier);

      let status: StatementOutcome = "MISSED";
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

      return {
        userId: user.discordId,
        status,
        scoreDelta,
        interestCharged,
        cardStatus,
        remainingBalance: Math.max(0, statement.statementBalance - statement.amountPaid),
      };
    });
  });
}

export async function processWeeklyCardSettlement(now = new Date()) {
  const issued = await generateWeeklyStatements(now);
  const settled = await settleDueStatements(now);
  return { issued, settled };
}
