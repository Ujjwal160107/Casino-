import cron from "node-cron";
import prisma from "./utils/prisma";
import { CasinoDropService } from "./services/casinoDropService";
import { checkMaturedInvestments, processAllInvestments, processOverdueLoans } from "./services/bankingService";
import { removeTemporaryRoles } from "./services/effectService";
import { Client } from "discord.js";

import { updateMarket } from "./services/stockService";
import { processAutomaticRoleIncomes } from "./services/roleIncomeService";

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

            // Automatic Role Income
            await processAutomaticRoleIncomes(client).catch(e => console.error("Auto Role Income error:", e));

            // Vote Reminders
            await processVoteReminders(client).catch(e => console.error("Vote Reminder error:", e));
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

async function processVoteReminders(client: Client) {
    // Find users who voted more than 12 hours ago, have reminders on, and haven't been reminded since their last vote
    const threshold = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago

    // Query Strategy:
    // lastVote <= threshold (Voted over 12h ago)
    // voteReminder == true
    // AND (lastVoteReminder == null OR lastVoteReminder < lastVote) 
    // Wait, if I remind them, I update lastVoteReminder to NOW.
    // So lastVoteReminder > lastVote means "Already reminded for this vote cycle".
    // So we confirm lastVoteReminder < lastVote OR null.

    // Note: Prisma comparison of fields isn't directly supported in 'where' query easily without raw query or logic.
    // We have to filter manually or use raw query.
    // Let's fetch based on time and filter manually.
    const potentialReminders = await prisma.user.findMany({
        where: {
            lastVote: { lte: threshold },
            voteReminder: true
        },
        take: 100
    });

    for (const user of potentialReminders) {
        // Double check reminder status
        if (user.lastVoteReminder && user.lastVote && user.lastVoteReminder > user.lastVote) {
            continue; // Already reminded
        }

        try {
            // Attempt to DM
            const discordUser = await client.users.fetch(user.discordId).catch(() => null);
            if (discordUser) {
                await discordUser.send({
                    content: `🔔 **Vote Reminder!**\nIt's been 12 hours since your last vote for **Fortuna**. You can now vote again to earn rewards!\n\nUse \`!vote\` in the server.`
                }).catch(() => null); // Ignore if DMs blocked

                // Update DB
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastVoteReminder: new Date() }
                });
                console.log(`[Scheduler] Sent vote reminder to ${user.username}`);
            }
        } catch (err) {
            console.error(`Failed to verify/remind user ${user.id}`, err);
        }
    }
}