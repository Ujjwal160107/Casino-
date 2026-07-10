import cron from "node-cron";
import { Client } from "discord.js";
import { processAllInvestments } from "./services/bankingService";
import { processWeeklyCardSettlement } from "./services/creditCardService";
import { removeTemporaryRoles } from "./services/effectService";
import { marketTick, initGlobalMarket } from "./services/stockService";
import { decayAllHeat, runRaidScan } from "./services/taxService";
import prisma from "./utils/prisma";

export function initScheduler(client: Client) {
  setInterval(async () => {
    try {
      await marketTick();
    } catch (err) {
      console.error("Failed to update stock market:", err);
    }
  }, 60 * 1000);

  initGlobalMarket()
    .then(() => marketTick())
    .catch((err) => console.error("Initial market seed/tick failed:", err));

  cron.schedule("* * * * *", async () => {
    console.log("Running banking jobs...");
    try {
      const processedCount = await processAllInvestments();
      console.log(`Processed ${processedCount} matured investments.`);

      await removeTemporaryRoles(client);
      await processVoteReminders(client).catch((err) => console.error("Vote Reminder error:", err));
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await decayAllHeat();
      await runRaidScan(client);
    } catch (err) {
      console.error("Tax raid scan failed:", err);
    }
  });

  cron.schedule("0 0 * * 1", async () => {
    console.log("Running weekly credit card settlement...");
    try {
      const result = await processWeeklyCardSettlement();
      console.log(`Processed card settlement. Statements generated: ${result.generatedStatements}, statements settled: ${result.settledStatements}.`);
    } catch (err) {
      console.error("Weekly credit card settlement failed:", err);
    }
  });

  // Expire old market listings every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    try {
      const { expireOldListings } = require("./services/marketService");
      const { expireOldHuntPartListings } = require("./services/huntPartService");
      const expired = await expireOldListings();
      const expiredParts = await expireOldHuntPartListings();
      if (expired > 0) console.log(`Expired ${expired} market listing(s). Items returned to sellers.`);
      if (expiredParts > 0) console.log(`Expired ${expiredParts} animal part listing(s). Parts returned to sellers.`);
    } catch (err) {
      console.error("Market listing expiry failed:", err);
    }
  });

  console.log("Banking scheduler initialized.");
}

async function processVoteReminders(client: Client) {
  const threshold = new Date(Date.now() - 12 * 60 * 60 * 1000);

  const potentialReminders = await prisma.user.findMany({
    where: {
      lastVote: { lte: threshold },
      voteReminder: true
    },
    take: 100
  });

  for (const user of potentialReminders) {
    if (user.lastVoteReminder && user.lastVote && user.lastVoteReminder > user.lastVote) {
      continue;
    }

    try {
      const discordUser = await client.users.fetch(user.discordId).catch(() => null);
      if (!discordUser) continue;

      await discordUser.send({
        content: `Vote Reminder!\nIt's been 12 hours since your last vote for Fortuna. You can now vote again to earn rewards!\n\nUse \`!vote\` in the server.`
      }).catch(() => null);

      await prisma.user.update({
        where: { discordId: user.discordId },
        data: { lastVoteReminder: new Date() }
      });
    } catch (err) {
      console.error(`Failed to verify/remind user ${user.discordId}`, err);
    }
  }
}
