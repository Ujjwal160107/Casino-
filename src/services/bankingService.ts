import prisma, { runWithRetry } from "../utils/prisma";
import { PrismaClient, Investment } from "@prisma/client";
import { BANKING_CONFIG, MAX_SAFE_BALANCE } from "../utils/economyConfig";

const DAY_MS = 24 * 60 * 60 * 1000;

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
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    interestEarned: calculated.interest,
                    payout,
                }
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

export type MaturedInvestment = NonNullable<Awaited<ReturnType<typeof matureInvestment>>>;

export async function processAllInvestments(): Promise<MaturedInvestment[]> {
    const investments = await prisma.investment.findMany({
        where: {
            status: "ACTIVE",
            maturityDate: { lte: new Date() }
        },
        select: { id: true }
    });

    const matured: MaturedInvestment[] = [];
    for (const investment of investments) {
        const result = await matureInvestment(investment.id);
        if (result) matured.push(result);
    }
    return matured;
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
            investments: []
        };
    }

    const investments = await prisma.investment.findMany({
        where: { userId: discordId, status: "ACTIVE" },
        orderBy: { maturityDate: "asc" }
    });

    const investmentValue = investments.reduce((sum, investment) => sum + investment.amount, 0);
    const walletBalance = user.wallet?.balance || 0;
    const bankBalance = user.bank?.balance || 0;

    return {
        netWorth: bankBalance + walletBalance + investmentValue,
        walletBalance,
        bankBalance,
        creditScore: user.creditScore,
        investments
    };
}