"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.guildCleanupService = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
exports.guildCleanupService = {
    /**
     * Mark a guild as deleted (soft delete).
     * This starts the countdown for permanent deletion.
     */
    async softDeleteGuild(guildId) {
        try {
            await prisma_1.default.guildConfig.update({
                where: { guildId },
                data: { deletedAt: new Date() }
            });
            console.log(`[GuildCleanup] Guild ${guildId} soft deleted.`);
        }
        catch (error) {
            console.error(`[GuildCleanup] Failed to soft delete guild ${guildId}:`, error);
        }
    },
    /**
     * Restore a guild (cancel deletion).
     * Called when the bot rejoins the server within the grace period.
     */
    async restoreGuild(guildId) {
        try {
            await prisma_1.default.guildConfig.update({
                where: { guildId },
                data: { deletedAt: null }
            });
            console.log(`[GuildCleanup] Guild ${guildId} restored.`);
        }
        catch (error) {
            // Ignore if guild config doesn't exist
            // console.error(`[GuildCleanup] Failed to restore guild ${guildId}:`, error);
        }
    },
    /**
     * Permanently delete all data associated with a guild.
     */
    async permanentlyDeleteGuild(guildId) {
        console.log(`[GuildCleanup] Starting permanent deletion for guild ${guildId}...`);
        try {
            // 1. Delete Users and related user data
            // We need to find all users in this guild first
            const users = await prisma_1.default.user.findMany({
                where: { guildId },
                select: { id: true }
            });
            const userIds = users.map(u => u.id);
            if (userIds.length > 0) {
                // Delete related data for these users
                // Fix: Transactions must be deleted before Wallets due to relation
                const wallets = await prisma_1.default.wallet.findMany({
                    where: { userId: { in: userIds } },
                    select: { id: true }
                });
                const walletIds = wallets.map(w => w.id);
                if (walletIds.length > 0) {
                    await prisma_1.default.transaction.deleteMany({ where: { walletId: { in: walletIds } } });
                }
                await prisma_1.default.wallet.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.bank.deleteMany({ where: { userId: { in: userIds } } });
                // Transactions handling is tricky if we don't have direct guildId relation, 
                // but since we delete wallet, we might want to delete transactions too.
                // However, transaction has walletId. We can delete by walletId match? 
                // Currently Transaction only links to Wallet. 
                // If we delete Wallet, transactions might remain orphaned unless we clean them.
                // Assuming we want to clean everything.
                // Since Wallet is deleted, we can't easily find transactions unless we fetch them first.
                // But for now, let's focus on main user data.
                await prisma_1.default.bet.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.inventory.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.loan.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.investment.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.activeEffect.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.userEducation.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.userDegree.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.ownedProperty.deleteMany({ where: { userId: { in: userIds } } });
                // Portfolio?
                const portfolios = await prisma_1.default.portfolio.findMany({ where: { userId: { in: userIds } } });
                const portfolioIds = portfolios.map(p => p.id);
                await prisma_1.default.stockHolding.deleteMany({ where: { portfolioId: { in: portfolioIds } } });
                await prisma_1.default.portfolio.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.dailyQuest.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.workLog.deleteMany({ where: { userId: { in: userIds } } });
                // Additional Cleanup to prevent foreign key errors
                await prisma_1.default.marketListing.deleteMany({ where: { sellerId: { in: userIds } } });
                await prisma_1.default.roleIncomeClaim.deleteMany({ where: { userId: { in: userIds } } });
                await prisma_1.default.marriage.deleteMany({
                    where: {
                        OR: [
                            { spouse1Id: { in: userIds } },
                            { spouse2Id: { in: userIds } }
                        ]
                    }
                });
                // Finally delete users
                await prisma_1.default.user.deleteMany({ where: { guildId } });
            }
            // 2. Delete Guild specific data
            await prisma_1.default.shopItem.deleteMany({ where: { guildId } });
            await prisma_1.default.job.deleteMany({ where: { guildId } });
            await prisma_1.default.roleIncome.deleteMany({ where: { guildId } });
            await prisma_1.default.incomeConfig.deleteMany({ where: { guildId } });
            await prisma_1.default.property.deleteMany({ where: { guildId } });
            await prisma_1.default.stock.deleteMany({ where: { guildId } }); // If stocks are guild specific
            await prisma_1.default.degree.deleteMany({ where: { guildId } });
            await prisma_1.default.casinoDropConfig.deleteMany({ where: { guildId } });
            await prisma_1.default.commandPermission.deleteMany({ where: { guildId } });
            // 3. Delete Guild Config
            await prisma_1.default.guildConfig.delete({ where: { guildId } });
            console.log(`[GuildCleanup] Permanently deleted guild ${guildId}.`);
        }
        catch (error) {
            console.error(`[GuildCleanup] Failed to permanently delete guild ${guildId}:`, error);
        }
    }
};
//# sourceMappingURL=guildCleanupService.js.map