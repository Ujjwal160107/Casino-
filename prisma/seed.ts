/**
 * Seeds backend-owned global catalogs (shop, properties, degrees).
 * Per-guild incomeConfig / gameSession models were removed in Fortuna V2.
 *
 * Usage: npm run seed
 * One-time DB dedupe before unique indexes: npx ts-node src/scripts/migrateGlobalCatalog.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  seedGeneralShop,
  seedJobShop,
  seedHuntShop,
  seedUniShop,
  seedCockShop,
  seedCosmeticsShop,
} from "../src/services/shopService";
import { seedGlobalProperties } from "../src/services/propertyService";
import { checkAndSeedDegrees } from "../src/services/educationService";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting global catalog seed...");

  await Promise.all([
    seedGeneralShop(),
    seedJobShop(),
    seedHuntShop(),
    seedUniShop(),
    seedCockShop(),
    seedCosmeticsShop(),
    seedGlobalProperties(),
    checkAndSeedDegrees(),
  ]);

  const [shopCount, propertyCount, degreeCount] = await Promise.all([
    prisma.shopItem.count({ where: { guildId: "global" } }),
    prisma.property.count({ where: { guildId: "global" } }),
    prisma.degree.count({ where: { guildId: "global" } }),
  ]);

  console.log(`Shop items (global): ${shopCount}`);
  console.log(`Properties (global): ${propertyCount}`);
  console.log(`Degrees (global): ${degreeCount}`);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
