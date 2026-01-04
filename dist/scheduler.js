"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initScheduler = initScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("./utils/prisma"));
const bankingService_1 = require("./services/bankingService");
const effectService_1 = require("./services/effectService");
const stockService_1 = require("./services/stockService");
function initScheduler(client) {
    // ... existing
    // Update Stock Market Loop (Checks each guild's refresh rate independently)
    setInterval(async () => {
        try {
            await (0, stockService_1.updateMarket)();
        }
        catch (err) {
            console.error("Failed to update stock market:", err);
        }
    }, 60 * 1000);
    // Initial update to ensure prices exist
    (0, stockService_1.updateMarket)().catch(e => console.error("Initial market update failed:", e));
    // Initial update to ensure prices exist
    (0, stockService_1.updateMarket)().catch(e => console.error("Initial market update failed:", e));
    node_cron_1.default.schedule("* * * * *", async () => {
        console.log("🕒 Running daily banking jobs...");
        try {
            const processedCount = await (0, bankingService_1.processAllInvestments)();
            console.log(`✅ Processed ${processedCount} matured investments.`);
            const loanCount = await (0, bankingService_1.processOverdueLoans)(client);
            if (loanCount > 0) {
                console.log(`✅ Processed ${loanCount} overdue loans.`);
            }
            await (0, effectService_1.removeTemporaryRoles)(client);
        }
        catch (err) {
            console.error("Scheduler error:", err);
        }
    });
    // Cleanup Job: Runs every hour
    node_cron_1.default.schedule("0 * * * *", async () => {
        console.log("🧹 Running guild data cleanup...");
        try {
            const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
            const guildsToDelete = await prisma_1.default.guildConfig.findMany({
                where: {
                    deletedAt: {
                        lte: threshold
                    }
                }
            });
            if (guildsToDelete.length > 0) {
                console.log(`Found ${guildsToDelete.length} guilds pending permanent deletion.`);
                const { guildCleanupService } = require("./services/guildCleanupService");
                for (const guild of guildsToDelete) {
                    await guildCleanupService.permanentlyDeleteGuild(guild.guildId);
                }
            }
        }
        catch (err) {
            console.error("Error in guild cleanup job:", err);
        }
    });
    console.log("⏳ Banking scheduler initialized.");
}
//# sourceMappingURL=scheduler.js.map