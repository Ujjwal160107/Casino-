import prisma from "../utils/prisma";
import { redisService } from "./redisService";

export const guildCleanupService = {
    /**
     * Mark a guild as deleted (soft delete).
     * This starts the countdown for permanent deletion.
     */
    async softDeleteGuild(guildId: string) {
        try {
            await prisma.guildConfig.update({
                where: { guildId },
                data: { deletedAt: new Date() }
            });
            console.log(`[GuildCleanup] Guild ${guildId} soft deleted.`);
        } catch (error) {
            console.error(`[GuildCleanup] Failed to soft delete guild ${guildId}:`, error);
        }
    },

    /**
     * Restore a guild (cancel deletion).
     * Called when the bot rejoins the server within the grace period.
     */
    async restoreGuild(guildId: string) {
        try {
            await prisma.guildConfig.update({
                where: { guildId },
                data: { deletedAt: null }
            });
            console.log(`[GuildCleanup] Guild ${guildId} restored.`);
        } catch (error) {
            // Ignore if guild config doesn't exist
            // console.error(`[GuildCleanup] Failed to restore guild ${guildId}:`, error);
        }
    },

    /**
     * Permanently delete all data associated with a guild.
     */
    async permanentlyDeleteGuild(guildId: string) {
        console.log(`[GuildCleanup] Starting permanent deletion for guild ${guildId}...`);

        try {
            // 1. Delete Users and related user data
            // We need to find all users in this guild first
            const users = await prisma.user.findMany({
                where: { guildId },
                select: { id: true }
            });
            const userIds = users.map(u => u.id);

            if (userIds.length > 0) {
                // Delete related data for these users

                // Fix: Transactions must be deleted before Wallets due to relation
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
                // Portfolio?
                const portfolios = await prisma.portfolio.findMany({ where: { userId: { in: userIds } } });
                const portfolioIds = portfolios.map(p => p.id);
                await prisma.stockHolding.deleteMany({ where: { portfolioId: { in: portfolioIds } } });
                await prisma.portfolio.deleteMany({ where: { userId: { in: userIds } } });

                await prisma.dailyQuest.deleteMany({ where: { userId: { in: userIds } } });
                await prisma.workLog.deleteMany({ where: { userId: { in: userIds } } });

                // Additional Cleanup to prevent foreign key errors
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

                // Finally delete users
                await prisma.user.deleteMany({ where: { guildId } });
            }

            // 2. Delete Guild specific data
            await prisma.shopItem.deleteMany({ where: { guildId } });
            await prisma.job.deleteMany({ where: { guildId } });
            await prisma.roleIncome.deleteMany({ where: { guildId } });
            await prisma.incomeConfig.deleteMany({ where: { guildId } });
            await prisma.property.deleteMany({ where: { guildId } });
            await prisma.stock.deleteMany({ where: { guildId } }); // If stocks are guild specific
            await prisma.degree.deleteMany({ where: { guildId } });
            await prisma.casinoDropConfig.deleteMany({ where: { guildId } });
            await prisma.commandPermission.deleteMany({ where: { guildId } });
            await prisma.audit.deleteMany({ where: { guildId } });

            // 3. Delete Guild Config
            await prisma.guildConfig.delete({ where: { guildId } });

            // 4. Invalidate Cache
            await redisService.del(`guild_config:${guildId}`);

            console.log(`[GuildCleanup] Permanently deleted guild ${guildId}.`);
        } catch (error) {
            console.error(`[GuildCleanup] Failed to permanently delete guild ${guildId}:`, error);
        }
    }
};
