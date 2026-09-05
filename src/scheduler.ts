import cron from "node-cron";
import { Client } from "discord.js";
import { processAllInvestments } from "./services/bankingService";
import { processWeeklyCardSettlement } from "./services/creditCardService";
import { removeTemporaryRoles } from "./services/effectService";
import { marketTick, initGlobalMarket } from "./services/stockService";
import { decayAllHeat, runRaidScan } from "./services/taxService";
import { processDueReminders } from "./services/cooldownReminderService";
import { notifyCardWeekly } from "./services/dmNoticeService";
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
      const matured = await processAllInvestments();
      console.log(`Processed ${matured.length} matured investments.`);

      await removeTemporaryRoles(client);
      await processDueReminders(client).catch((err) => console.error("Cooldown reminder error:", err));
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await runRaidScan(client);
      await decayAllHeat();
    } catch (err) {
      console.error("Tax raid scan failed:", err);
    }
  });

  cron.schedule("0 0 * * 1", async () => {
    console.log("Running weekly credit card settlement...");
    try {
      const result = await processWeeklyCardSettlement();
      console.log(`Processed card settlement. Statements generated: ${result.issued.length}, statements settled: ${result.settled.length}.`);
      await notifyCardWeekly(client, result);
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

