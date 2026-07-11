/**
 * Reset daily / weekly / monthly claim cooldowns so every player can claim again.
 *
 * Cooldowns are stored in two places by src/services/cooldownService.ts:
 *   1. Redis  — keys shaped `<discordId>_<command>` (primary store, TTL-based)
 *   2. Prisma — ActiveEffect rows with effectType `cooldown:<command>` (fallback)
 * This clears both for the `daily`, `weekly`, and `monthly` commands only.
 * Nothing else (balances, jobs, other cooldowns, etc.) is touched.
 *
 * Run it on the VPS, in the bot's directory, with the SAME env the bot uses
 * (REDIS_URL + DATABASE_URL):
 *
 *   node scripts/reset-timely-rewards.js --dry-run   # preview counts, change nothing
 *   node scripts/reset-timely-rewards.js             # actually clear them
 *
 * Uses only production dependencies (ioredis, @prisma/client) — no build/ts-node.
 */

// Load .env if the project uses one; harmless no-op if env comes from the
// process manager (pm2/systemd) or dotenv isn't installed.
try {
  require("dotenv").config();
} catch (_) {
  /* env already provided by the environment */
}

const Redis = require("ioredis");
const { PrismaClient } = require("@prisma/client");

const COMMANDS = ["daily", "weekly", "monthly"];
const DRY_RUN = process.argv.includes("--dry-run");
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

async function clearRedisCooldowns() {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  let grandTotal = 0;

  for (const command of COMMANDS) {
    // Cooldown keys are `${discordId}_${command}` — discordIds are numeric,
    // so `*_${command}` matches exactly this reward's cooldowns and nothing else.
    const pattern = `*_${command}`;
    const keys = [];
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0");

    if (keys.length && !DRY_RUN) {
      for (let i = 0; i < keys.length; i += 500) {
        await redis.del(...keys.slice(i, i + 500));
      }
    }
    console.log(`  Redis  ${command.padEnd(7)} ${DRY_RUN ? "would clear" : "cleared"} ${keys.length} cooldown key(s)`);
    grandTotal += keys.length;
  }

  await redis.quit();
  return grandTotal;
}

async function clearDbCooldowns() {
  const prisma = new PrismaClient();
  const where = { effectType: { in: COMMANDS.map((c) => `cooldown:${c}`) } };

  const count = await prisma.activeEffect.count({ where });
  if (count && !DRY_RUN) {
    await prisma.activeEffect.deleteMany({ where });
  }
  console.log(`  DB     ActiveEffect fallback ${DRY_RUN ? "would clear" : "cleared"} ${count} row(s)`);

  await prisma.$disconnect();
  return count;
}

(async () => {
  console.log(
    DRY_RUN
      ? "DRY RUN — previewing only, nothing will be changed.\n"
      : "Resetting daily / weekly / monthly cooldowns...\n"
  );

  const redisCount = await clearRedisCooldowns();
  const dbCount = await clearDbCooldowns();

  console.log(
    `\nDone. ${DRY_RUN ? "Would clear" : "Cleared"} ${redisCount} Redis key(s) and ${dbCount} DB row(s).`
  );
  if (!DRY_RUN) {
    console.log("Everyone can now claim their daily, weekly, and monthly rewards again.");
  }
  process.exit(0);
})().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
