/**
 * One-time migration for the zoo care economy.
 *
 * 1. Backfill CaughtAnimal.fedUntil so every existing animal starts with one
 *    fed day. Without this they would all read as fed-since-caughtAt and a
 *    long-held collection would die on first read.
 * 2. Recompute Property.price for the three zoos. seedGlobalProperties only
 *    writes basePrice in its update branch, and buyProperty charges the stored
 *    price, so a catalog price change never reaches existing rows on its own.
 *
 * Over-cap animals are NOT culled here — enforceHousing evicts them lazily on
 * the owner's next `!zoo`, and they starve out from inventory over three days.
 *
 * Idempotent: safe to run more than once.
 *
 * Usage: npx ts-node src/scripts/zooCareMigration.ts
 */
import { PrismaClient } from "@prisma/client";
import { FED_WINDOW_MS, ZOO_CAPACITY, ZOO_PROPERTY_DEFS } from "../utils/animalCatalog";
import { PropertyService } from "../services/propertyService";

const prisma = new PrismaClient();

async function main() {
  const fedUntil = new Date(Date.now() + FED_WINDOW_MS);
  const backfilled = await prisma.caughtAnimal.updateMany({
    where: { fedUntil: null },
    data: { fedUntil },
  });
  console.log(`Backfilled fedUntil on ${backfilled.count} animal(s); everyone has one fed day.`);

  for (const def of ZOO_PROPERTY_DEFS) {
    if (!(def.key in ZOO_CAPACITY)) continue;
    const property = await prisma.property.findUnique({ where: { key: def.key } });
    if (!property) {
      console.log(`${def.key}: no Property row yet, seeding will create it at the new price.`);
      continue;
    }
    const price = PropertyService.calculateDynamicPrice(def.price, property.totalSold);
    await prisma.property.update({
      where: { id: property.id },
      data: { basePrice: def.price, price },
    });
    console.log(`${def.key}: basePrice ${property.basePrice} -> ${def.price}, price ${property.price} -> ${price}`);
  }

  console.log("\nDone. No animals culled — over-cap zoos are trimmed lazily on the owner's next !zoo.");
}

main()
  .catch((err) => {
    console.error("zooCareMigration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
