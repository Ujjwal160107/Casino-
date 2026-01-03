"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCreditLimits = calculateCreditLimits;
exports.applyForLoan = applyForLoan;
exports.repayLoan = repayLoan;
exports.createInvestment = createInvestment;
exports.checkMaturedInvestments = checkMaturedInvestments;
exports.processAllInvestments = processAllInvestments;
exports.getFinancialSummary = getFinancialSummary;
exports.processOverdueLoans = processOverdueLoans;
const prisma_1 = __importDefault(require("../utils/prisma"));
const bankService_1 = require("./bankService");
const guildConfigService_1 = require("./guildConfigService");
const branding_1 = require("../config/branding");
function calculateCreditLimits(creditScore, config) {
    const defaultTiers = [
        { minScore: 0, maxLoan: 5000, maxDays: 3 },
        { minScore: 500, maxLoan: 25000, maxDays: 7 },
        { minScore: 800, maxLoan: 100000, maxDays: 14 }
    ];
    const tiers = config.creditConfig?.length ? config.creditConfig : defaultTiers;
    tiers.sort((a, b) => b.minScore - a.minScore);
    const applicableTier = tiers.find((t) => creditScore >= t.minScore) || tiers[tiers.length - 1];
    const maxLoan = config.loanMaxAmount || applicableTier.maxLoan;
    return {
        maxLoan,
        maxDays: applicableTier.maxDays,
        tier: applicableTier
    };
}
async function applyForLoan(discordId, guildId, amount) {
    if (amount <= 0)
        throw new Error("Loan amount must be positive.");
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        throw new Error("User not found.");
    const userId = user.id;
    await (0, bankService_1.ensureBankForUser)(userId);
    // Check Max Active Loans
    const activeLoansCount = await prisma_1.default.loan.count({
        where: { userId, status: "ACTIVE" }
    });
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const maxActiveLoans = config.maxActiveLoans || 1;
    if (activeLoansCount >= maxActiveLoans) {
        throw new Error(`You have reached the limit of ${maxActiveLoans} active loan(s). Please repay one first.`);
    }
    const limits = calculateCreditLimits(user.creditScore, config);
    if (amount > limits.maxLoan) {
        throw new Error(`Loan denied. Your credit score (${user.creditScore}) limits you to a max loan of ${limits.maxLoan}.`);
    }
    const interestRate = config.loanInterestRate;
    const interestAmount = Math.floor(amount * (interestRate / 100));
    const totalRepayment = amount + interestAmount;
    const dueDate = new Date(Date.now() + (limits.maxDays * 86400000));
    await prisma_1.default.$transaction([
        prisma_1.default.loan.create({
            data: {
                userId,
                amount,
                totalRepayment,
                interestRate,
                dueDate,
                status: "ACTIVE"
            }
        }),
        prisma_1.default.bank.update({
            where: { userId },
            data: { balance: { increment: amount } }
        }),
        prisma_1.default.transaction.create({
            data: {
                walletId: (await prisma_1.default.wallet.findUnique({ where: { userId } })).id,
                amount: amount,
                type: "loan_disbursal",
                meta: { type: "loan", amount }
            }
        })
    ]);
    return { amount, totalRepayment, dueDate, interestRate };
}
async function repayLoan(discordId, guildId, amount) {
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        throw new Error("User not found.");
    const userId = user.id;
    const loan = await prisma_1.default.loan.findFirst({
        where: { userId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" }
    });
    if (!loan)
        throw new Error("No active loan found.");
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const bank = await (0, bankService_1.ensureBankForUser)(discordId, guildId);
    if (bank.balance < amount) {
        throw new Error(`Insufficient bank balance. Please deposit money first using \`${config.prefix}deposit\`.`);
    }
    let newStatus = "ACTIVE";
    let remaining = loan.totalRepayment - amount;
    let payAmount = amount;
    if (remaining <= 0) {
        newStatus = "PAID";
        payAmount = loan.totalRepayment;
        remaining = 0;
    }
    const now = new Date();
    const isOverdue = now > loan.dueDate;
    let scoreChange = 0;
    if (newStatus === "PAID") {
        if (isOverdue) {
            scoreChange = -(config.creditScorePenalty || 20);
        }
        else {
            scoreChange = (config.creditScoreReward || 10);
        }
    }
    await prisma_1.default.$transaction([
        prisma_1.default.bank.update({
            where: { id: bank.id },
            data: { balance: { decrement: payAmount } }
        }),
        prisma_1.default.loan.update({
            where: { id: loan.id },
            data: {
                totalRepayment: remaining,
                status: newStatus
            }
        }),
        ...(scoreChange !== 0 ? [
            prisma_1.default.user.update({
                where: { id: userId },
                data: {
                    creditScore: {
                        set: Math.min(Math.max((user.creditScore + scoreChange), 50), (config.maxCreditScore || 2000))
                    }
                }
            })
        ] : [])
    ]);
    return { paid: payAmount, remaining, status: newStatus };
}
async function createInvestment(discordId, guildId, type, amount, durationDays) {
    if (amount <= 0)
        throw new Error("Amount must be positive.");
    const bank = await (0, bankService_1.ensureBankForUser)(discordId, guildId);
    if (bank.balance < amount)
        throw new Error("Insufficient bank balance.");
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        throw new Error("User not found.");
    const userId = user.id;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const interestRate = type === "FD" ? config.fdInterestRate : config.rdInterestRate;
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + durationDays);
    await prisma_1.default.$transaction([
        prisma_1.default.bank.update({
            where: { id: bank.id },
            data: { balance: { decrement: amount } }
        }),
        prisma_1.default.investment.create({
            data: {
                userId,
                type,
                amount,
                interestRate,
                maturityDate,
                status: "ACTIVE"
            }
        })
    ]);
    return { type, amount, interestRate, maturityDate };
}
async function checkMaturedInvestments(discordId, guildId) {
    const user = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user)
        return [];
    const userId = user.id;
    const investments = await prisma_1.default.investment.findMany({
        where: {
            userId,
            status: "ACTIVE",
            maturityDate: { lte: new Date() }
        }
    });
    const results = [];
    for (const inv of investments) {
        const interest = Math.floor(inv.amount * (inv.interestRate / 100));
        const payout = inv.amount + interest;
        await prisma_1.default.$transaction([
            prisma_1.default.investment.update({
                where: { id: inv.id },
                data: { status: "COMPLETED" }
            }),
            prisma_1.default.bank.update({
                where: { userId: inv.userId },
                data: { balance: { increment: payout } }
            })
        ]);
        results.push({ id: inv.id, payout, type: inv.type, interest });
    }
    return results;
}
async function processAllInvestments() {
    const investments = await prisma_1.default.investment.findMany({
        where: {
            status: "ACTIVE",
            maturityDate: { lte: new Date() }
        }
    });
    let count = 0;
    for (const inv of investments) {
        const interest = Math.floor(inv.amount * (inv.interestRate / 100));
        const payout = inv.amount + interest;
        await prisma_1.default.$transaction([
            prisma_1.default.investment.update({
                where: { id: inv.id },
                data: { status: "COMPLETED" }
            }),
            prisma_1.default.bank.update({
                where: { userId: inv.userId },
                data: { balance: { increment: payout } }
            })
        ]);
        count++;
    }
    return count;
}
async function getFinancialSummary(discordId, guildId) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } },
        include: { bank: true, wallet: true }
    });
    if (!user) {
        return {
            netWorth: 0,
            creditScore: 500,
            activeLoans: [],
            investments: [],
            isLoanBanned: false
        };
    }
    const activeLoans = await prisma_1.default.loan.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" }
    });
    const investments = await prisma_1.default.investment.findMany({ where: { userId: user.id, status: "ACTIVE" } });
    const investmentValue = investments.reduce((sum, inv) => sum + inv.amount, 0);
    return {
        netWorth: (user.bank?.balance || 0) + (user.wallet?.balance || 0) + investmentValue,
        creditScore: user.creditScore,
        activeLoans,
        investments,
        isLoanBanned: user.isLoanBanned
    };
}
async function processOverdueLoans(client) {
    const overdueLoans = await prisma_1.default.loan.findMany({
        where: {
            status: "ACTIVE",
            dueDate: { lt: new Date() }
        }
    });
    let count = 0;
    for (const loan of overdueLoans) {
        let user;
        try {
            user = await prisma_1.default.user.findUnique({ where: { id: loan.userId }, include: { bank: true, wallet: true } });
        }
        catch (e) {
            console.warn(`${branding_1.Mascot.Emotes.Alert} Corrupt user data for loan ${loan.id}. Deleting loan to prevent loop crash.`);
            await prisma_1.default.loan.delete({ where: { id: loan.id } }).catch(() => { });
            continue;
        }
        if (!user) {
            console.warn(`User not found for overdue loan ${loan.id}. Deleting loan & Skipping.`);
            await prisma_1.default.loan.delete({ where: { id: loan.id } }).catch(() => { });
            continue;
        }
        if (!user.guildId) {
            console.warn(`User ${user.id} has no guildId. Deleting loan & Skipping loan processing.`);
            await prisma_1.default.loan.delete({ where: { id: loan.id } }).catch(() => { });
            continue;
        }
        const config = await (0, guildConfigService_1.getGuildConfig)(user.guildId);
        const penalty = config.creditScorePenalty || 20;
        const minScore = 50;
        await prisma_1.default.bank.update({
            where: { userId: user.id },
            data: { balance: { decrement: loan.totalRepayment } }
        });
        const newStatus = "PAID";
        const newScore = Math.max(user.creditScore - penalty, minScore);
        await prisma_1.default.$transaction([
            prisma_1.default.loan.update({
                where: { id: loan.id },
                data: {
                    status: newStatus,
                    totalRepayment: 0
                }
            }),
            prisma_1.default.user.update({
                where: { id: user.id },
                data: { creditScore: newScore }
            })
        ]);
        count++;
        console.log(`💸 Enforced repayment for ${user.username} (${user.discordId}). Deducted: ${loan.totalRepayment}, New Score: ${newScore}`);
    }
    return count;
}
//# sourceMappingURL=bankingService.js.map