
import { prisma } from "@/lib/prisma";
import { invalidateGuildConfig } from "./cache";

export async function performFactoryReset(guildId: string) {
    console.log(`[Dashboard] Starting factory reset for guild ${guildId}...`);

    try {
        // 1. Delete Users and related user data
        const users = await prisma.user.findMany({
            where: { guildId },
            select: { id: true }
        });
        const userIds = users.map(u => u.id);

        if (userIds.length > 0) {
            const wallets = await prisma.wallet.findMany({
                where: { userId: { in: userIds } },
                select: { id: true }
            });
            const walletIds = wallets.map(w => w.id);
            if (walletIds.length > 0) {
                await prisma.transaction.deleteMany({ where: { walletId: { in: walletIds } } });
            }

            await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.bank.deleteMany({ where: { userId: { in: userIds } } });

            await prisma.bet.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.inventory.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.loan.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.investment.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.activeEffect.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.userEducation.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.userDegree.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.ownedProperty.deleteMany({ where: { userId: { in: userIds } } });

            const portfolios = await prisma.portfolio.findMany({ where: { userId: { in: userIds } } });
            const portfolioIds = portfolios.map(p => p.id);
            await prisma.stockHolding.deleteMany({ where: { portfolioId: { in: portfolioIds } } });
            await prisma.portfolio.deleteMany({ where: { userId: { in: userIds } } });

            await prisma.dailyQuest.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.workLog.deleteMany({ where: { userId: { in: userIds } } });

            await prisma.marketListing.deleteMany({ where: { sellerId: { in: userIds } } });
            await prisma.roleIncomeClaim.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.marriage.deleteMany({
                where: {
                    OR: [
                        { spouse1Id: { in: userIds } },
                        { spouse2Id: { in: userIds } }
                    ]
                }
            });

            await prisma.user.deleteMany({ where: { guildId } });
        }

        // 2. Delete Guild specific data
        await prisma.shopItem.deleteMany({ where: { guildId } });
        await prisma.job.deleteMany({ where: { guildId } });
        await prisma.roleIncome.deleteMany({ where: { guildId } });
        await prisma.incomeConfig.deleteMany({ where: { guildId } });
        await prisma.property.deleteMany({ where: { guildId } });
        await prisma.stock.deleteMany({ where: { guildId } });
        await prisma.degree.deleteMany({ where: { guildId } });
        await prisma.casinoDropConfig.deleteMany({ where: { guildId } });
        await prisma.commandPermission.deleteMany({ where: { guildId } });
        await prisma.audit.deleteMany({ where: { guildId } });

        // 3. Delete Guild Config
        await prisma.guildConfig.delete({ where: { guildId } });

        // 4. Invalidate Cache
        await invalidateGuildConfig(guildId);

        console.log(`[Dashboard] Factory reset complete for guild ${guildId}.`);
        return { success: true };
    } catch (error: any) {
        console.error(`[Dashboard] Failed to factory reset guild ${guildId}:`, error);
        return { success: false, error: error.message };
    }
}
