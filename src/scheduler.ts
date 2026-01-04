import cron from "node-cron";
import prisma from "./utils/prisma";
import { CasinoDropService } from "./services/casinoDropService";
import { checkMaturedInvestments, processAllInvestments, processOverdueLoans } from "./services/bankingService";
import { removeTemporaryRoles } from "./services/effectService";
import { Client } from "discord.js";

import { updateMarket } from "./services/stockService";

export function initScheduler(client: Client) {
    // ... existing

    // Update Stock Market Loop (Checks each guild's refresh rate independently)
    setInterval(async () => {
        try {
            await updateMarket();
        } catch (err) {
            console.error("Failed to update stock market:", err);
        }
    }, 60 * 1000);

    // Initial update to ensure prices exist
    updateMarket().catch(e => console.error("Initial market update failed:", e));
    // Initial update to ensure prices exist
    updateMarket().catch(e => console.error("Initial market update failed:", e));
    cron.schedule("* * * * *", async () => {
        console.log("🕒 Running daily banking jobs...");
        try {
            const processedCount = await processAllInvestments();
            console.log(`✅ Processed ${processedCount} matured investments.`);

            const loanCount = await processOverdueLoans(client);
            if (loanCount > 0) {
                console.log(`✅ Processed ${loanCount} overdue loans.`);
            }

            await removeTemporaryRoles(client);

            // Casino Drops
            await CasinoDropService.processDrops(client).catch(e => console.error("Casino drop error:", e));
        } catch (err) {
            console.error("Scheduler error:", err);
        }
    });

    // Cleanup Job: Runs every hour
    cron.schedule("0 * * * *", async () => {
        console.log("🧹 Running guild data cleanup...");
        try {
            const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

            const guildsToDelete = await prisma.guildConfig.findMany({
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
        } catch (err) {
            console.error("Error in guild cleanup job:", err);
        }
    });
    console.log("⏳ Banking scheduler initialized.");
}