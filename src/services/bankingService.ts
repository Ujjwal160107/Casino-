import prisma, { runWithRetry } from "../utils/prisma";
import { PrismaClient, Investment } from "@prisma/client";
import { BANKING_CONFIG, MAX_SAFE_BALANCE } from "../utils/economyConfig";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateCreditLimits(creditScore: number) {
    const tiers = [...BANKING_CONFIG.defaultLoanTiers].sort((a, b) => b.minScore - a.minScore);
    const applicableTier = tiers.find((tier) => creditScore >= tier.minScore) || tiers[tiers.length - 1];

    return {
        maxLoan: applicableTier.maxLoan,
        maxDays: applicableTier.maxDays,
        tier: applicableTier
    };
}

function clampCreditScore(score: number) {
    return Math.min(Math.max(score, BANKING_CONFIG.minCreditScore), BANKING_CONFIG.maxCreditScore);
}

function calculateLoanRepayment(amount: number) {
    const interestAmount = Math.floor(amount * (BANKING_CONFIG.loanInterestRate / 100));
    return {
        interestRate: BANKING_CONFIG.loanInterestRate,
        interestAmount,
        totalRepayment: amount + interestAmount
    };
}

function calculateInvestmentPayout(investment: Pick<Investment, "amount" | "interestRate" | "type" | "startDate" | "maturityDate">) {
    const durationDays = Math.max(1, Math.ceil((investment.maturityDate.getTime() - investment.startDate.getTime()) / DAY_MS));
    const annualRate = investment.interestRate / 100;
    const interest = investment.type === "RD"
        ? Math.floor(investment.amount * annualRate * (durationDays / 365) * 0.5)
        : Math.floor(investment.amount * annualRate * (durationDays / 365));

    return {
        durationDays,
        interest,
        payout: investment.amount + interest
    };
}

export async function applyForLoan(discordId: string, amount: number) {
    if (amount <= 0) throw new Error("Loan amount must be positive.");

    return runWithRetry(async (tx: PrismaClient) => {
        return tx.$transaction(async (trx) => {
            const user = await trx.user.findUnique({
                where: { discordId },
                include: { bank: true, wallet: true }
            });
            if (!user) throw new Error("User not found.");
            if (user.isLoanBanned) throw new Error("You are banned from taking loans.");

            const activeLoansCount = await trx.loan.count({
                where: { userId: discordId, status: "ACTIVE" }
            });
            if (activeLoansCount >= BANKING_CONFIG.maxActiveLoans) {
                throw new Error(`You have reached the limit of ${BANKING_CONFIG.maxActiveLoans} active loan(s). Please repay one first.`);
            }

            const limits = calculateCreditLimits(user.creditScore);
            if (amount > limits.maxLoan) {
                throw new Error(`Loan denied. Your credit score (${user.creditScore}) limits you to a max loan of ${limits.maxLoan}.`);
            }

            const bank = user.bank ?? await trx.bank.create({ data: { userId: discordId, balance: 0 } });
            const wallet = user.wallet ?? await trx.wallet.create({ data: { userId: discordId, balance: 0 } });
            const availableSpace = Math.max(0, MAX_SAFE_BALANCE - bank.balance);
            const disbursedAmount = Math.min(amount, availableSpace);
            if (disbursedAmount <= 0) throw new Error("Bank balance is at the global safety cap.");

            const repayment = calculateLoanRepayment(disbursedAmount);
            const limitsForDisbursed = calculateCreditLimits(user.creditScore);
            const dueDate = new Date(Date.now() + limitsForDisbursed.maxDays * DAY_MS);

            const loan = await trx.loan.create({
                data: {
                    userId: discordId,
                    amount: disbursedAmount,
                    totalRepayment: repayment.totalRepayment,
                    interestRate: repayment.interestRate,
                    dueDate,
                    status: "ACTIVE"
                }
            });

            const updatedBank = await trx.bank.update({
                where: { id: bank.id },
                data: { balance: { increment: disbursedAmount } }
            });

            await trx.transaction.create({
                data: {
                    walletId: wallet.id,
                    amount: disbursedAmount,
                    type: "loan_disbursal",
                    meta: { loanId: loan.id, requestedAmount: amount, capped: disbursedAmount < amount },
                    isEarned: false
                }
            });

            return {
                loan,
                bank: updatedBank,
                amount: disbursedAmount,
                requestedAmount: amount,
                totalRepayment: repayment.totalRepayment,
                interestRate: repayment.interestRate,
                dueDate,
                capped: disbursedAmount < amount
            };
        });
    });
}

export async function repayLoan(discordId: string, amount: number) {
    if (amount <= 0) throw new Error("Repayment amount must be positive.");

    return runWithRetry(async (tx: PrismaClient) => {
        return tx.$transaction(async (trx) => {
            const user = await trx.user.findUnique({
                where: { discordId },
                include: { bank: true, wallet: true }
            });
            if (!user) throw new Error("User not found.");
            if (!user.bank) throw new Error("Bank account not found.");

            const loan = await trx.loan.findFirst({
                where: { userId: discordId, status: "ACTIVE" },
                orderBy: { createdAt: "asc" }
            });
            if (!loan) throw new Error("No active loan found.");

            const payAmount = Math.min(amount, loan.totalRepayment);
            if (user.bank.balance < payAmount) throw new Error("Insufficient bank balance.");

            const remaining = Math.max(0, loan.totalRepayment - payAmount);
            const newStatus = remaining === 0 ? "PAID" : "ACTIVE";
            const isLate = new Date() > loan.dueDate;
            const scoreDelta = newStatus === "PAID"
                ? (isLate ? -BANKING_CONFIG.creditScorePenalty : BANKING_CONFIG.creditScoreReward)
                : 0;

            const updatedBank = await trx.bank.update({
                where: { id: user.bank.id },
                data: { balance: { decrement: payAmount } }
            });

            const updatedLoan = await trx.loan.update({
                where: { id: loan.id },
                data: {
                    totalRepayment: remaining,
                    status: newStatus
                }
            });

            const updatedUser = scoreDelta === 0 ? user : await trx.user.update({
                where: { discordId },
                data: { creditScore: clampCreditScore(user.creditScore + scoreDelta) }
            });

            if (user.wallet) {
                await trx.transaction.create({
                    data: {
                        walletId: user.wallet.id,
                        amount: -payAmount,
                        type: "loan_repayment",
                        meta: { loanId: loan.id, remaining, status: newStatus, scoreDelta },
                        isEarned: false
                    }
                });
            }

            return {
                paid: payAmount,
                remaining,
                status: newStatus,
                scoreDelta,
                creditScore: updatedUser.creditScore,
                bank: updatedBank,
                loan: updatedLoan
            };
        });
    });
}

export async function createInvestment(discordId: string, type: "FD" | "RD", amount: number, durationDays: number) {
    if (amount <= 0) throw new Error("Amount must be positive.");
    if (durationDays <= 0) throw new Error("Duration must be at least 1 day.");

    return runWithRetry(async (tx: PrismaClient) => {
        return tx.$transaction(async (trx) => {
            const user = await trx.user.findUnique({
                where: { discordId },
                include: { bank: true }
            });
            if (!user) throw new Error("User not found.");
            if (!user.bank) throw new Error("Bank account not found.");
            if (user.bank.balance < amount) throw new Error("Insufficient bank balance.");

            const interestRate = type === "FD" ? BANKING_CONFIG.fdInterestRate : BANKING_CONFIG.rdInterestRate;
            const maturityDate = new Date(Date.now() + durationDays * DAY_MS);

            const updatedBank = await trx.bank.update({
                where: { id: user.bank.id },
                data: { balance: { decrement: amount } }
            });

            const investment = await trx.investment.create({
                data: {
                    userId: discordId,
                    type,
                    amount,
                    interestRate,
                    maturityDate,
                    status: "ACTIVE"
                }
            });

            return { investment, bank: updatedBank, type, amount, interestRate, maturityDate };
        });
    });
}

export async function checkMaturedInvestments(discordId: string) {
    const investments = await prisma.investment.findMany({
        where: {
            userId: discordId,
            status: "ACTIVE",
            maturityDate: { lte: new Date() }
        }
    });

    const results = [];
    for (const investment of investments) {
        results.push(await matureInvestment(investment.id));
    }
    return results.filter(Boolean);
}

async function matureInvestment(investmentId: string) {
    return runWithRetry(async (tx: PrismaClient) => {
        return tx.$transaction(async (trx) => {
            const investment = await trx.investment.findUnique({ where: { id: investmentId } });
            if (!investment || investment.status !== "ACTIVE" || investment.maturityDate > new Date()) return null;

            const bank = await trx.bank.upsert({
                where: { userId: investment.userId },
                update: {},
                create: { userId: investment.userId, balance: 0 }
            });

            const calculated = calculateInvestmentPayout(investment);
            const availableSpace = Math.max(0, MAX_SAFE_BALANCE - bank.balance);
            const payout = Math.min(calculated.payout, availableSpace);
            const interest = Math.max(0, payout - investment.amount);

            const updatedInvestment = await trx.investment.update({
                where: { id: investment.id },
                data: { status: "COMPLETED" }
            });

            const updatedBank = payout > 0
                ? await trx.bank.update({
                    where: { id: bank.id },
                    data: { balance: { increment: payout } }
                })
                : bank;

            return {
                id: investment.id,
                type: investment.type,
                principal: investment.amount,
                interest,
                payout,
                durationDays: calculated.durationDays,
                capped: payout < calculated.payout,
                investment: updatedInvestment,
                bank: updatedBank
            };
        });
    });
}

export async function processAllInvestments() {
    const investments = await prisma.investment.findMany({
        where: {
            status: "ACTIVE",
            maturityDate: { lte: new Date() }
        },
        select: { id: true }
    });

    let count = 0;
    for (const investment of investments) {
        const result = await matureInvestment(investment.id);
        if (result) count++;
    }
    return count;
}

export async function getFinancialSummary(discordId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId },
        include: { bank: true, wallet: true }
    });

    if (!user) {
        return {
            netWorth: 0,
            walletBalance: 0,
            bankBalance: 0,
            creditScore: 500,
            activeLoans: [],
            investments: [],
            isLoanBanned: false
        };
    }

    const [activeLoans, investments] = await Promise.all([
        prisma.loan.findMany({
            where: { userId: discordId, status: "ACTIVE" },
            orderBy: { createdAt: "asc" }
        }),
        prisma.investment.findMany({
            where: { userId: discordId, status: "ACTIVE" },
            orderBy: { maturityDate: "asc" }
        })
    ]);

    const investmentValue = investments.reduce((sum, investment) => sum + investment.amount, 0);
    const walletBalance = user.wallet?.balance || 0;
    const bankBalance = user.bank?.balance || 0;

    return {
        netWorth: bankBalance + walletBalance + investmentValue,
        walletBalance,
        bankBalance,
        creditScore: user.creditScore,
        activeLoans,
        investments,
        isLoanBanned: user.isLoanBanned
    };
}

export async function processOverdueLoans() {
    const overdueLoans = await prisma.loan.findMany({
        where: {
            status: "ACTIVE",
            dueDate: { lt: new Date() }
        },
        select: { id: true }
    });

    let count = 0;
    for (const loan of overdueLoans) {
        const result = await processOverdueLoan(loan.id);
        if (result) count++;
    }
    return count;
}

async function processOverdueLoan(loanId: string) {
    return runWithRetry(async (tx: PrismaClient) => {
        return tx.$transaction(async (trx) => {
            const loan = await trx.loan.findUnique({ where: { id: loanId } });
            if (!loan || loan.status !== "ACTIVE" || loan.dueDate >= new Date()) return null;

            const user = await trx.user.findUnique({
                where: { discordId: loan.userId },
                include: { bank: true, wallet: true }
            });
            if (!user) {
                await trx.loan.update({ where: { id: loan.id }, data: { status: "DEFAULTED" } });
                return { loanId: loan.id, status: "DEFAULTED", collected: 0, scoreDelta: 0 };
            }

            const bank = user.bank ?? await trx.bank.create({ data: { userId: loan.userId, balance: 0 } });
            const collected = Math.min(bank.balance, loan.totalRepayment);
            const remaining = Math.max(0, loan.totalRepayment - collected);
            const status = remaining === 0 ? "PAID" : "DEFAULTED";
            const scoreDelta = -BANKING_CONFIG.creditScorePenalty;

            if (collected > 0) {
                await trx.bank.update({
                    where: { id: bank.id },
                    data: { balance: { decrement: collected } }
                });
            }

            const updatedLoan = await trx.loan.update({
                where: { id: loan.id },
                data: {
                    totalRepayment: remaining,
                    status
                }
            });

            const updatedUser = await trx.user.update({
                where: { discordId: loan.userId },
                data: { creditScore: clampCreditScore(user.creditScore + scoreDelta) }
            });

            if (user.wallet && collected > 0) {
                await trx.transaction.create({
                    data: {
                        walletId: user.wallet.id,
                        amount: -collected,
                        type: "loan_overdue_collection",
                        meta: { loanId: loan.id, remaining, status, scoreDelta },
                        isEarned: false
                    }
                });
            }

            return {
                loanId: loan.id,
                status: updatedLoan.status,
                collected,
                remaining,
                scoreDelta,
                creditScore: updatedUser.creditScore
            };
        });
    });
}
