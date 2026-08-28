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
import { PrismaClient, Prisma } from "@prisma/client";
import { FED_WINDOW_MS, ZOO_CAPACITY, ZOO_PROPERTY_DEFS } from "../utils/animalCatalog";
import { PropertyService } from "../services/propertyService";

const prisma = new PrismaClient();

/**
 * `fedUntil` was introduced in this same branch (b756703): no code before it
 * ever wrote the field, and MongoDB has no schema migrations — `prisma db
 * push` does not retroactively add the key to existing documents. Every
 * pre-deploy CaughtAnimal document therefore has fedUntil physically ABSENT
 * from its BSON, not explicitly set to null.
 *
 * Prisma's MongoDB connector filters `{ fedUntil: null }` as "explicit BSON
 * null only" — it does NOT match a document where the field was never
 * written, even though `findUnique` reads both back as `null`. This codebase
 * already hit and fixed the identical failure mode in
 * src/anticheat/claim.ts's `userDateUnchanged` (see its doc comment). The
 * `isSet: false` branch is what covers the absent-field case.
 *
 * Exported (not inlined in the query below) so the migration's own test
 * asserts against this exact filter, never a copy of it.
 */
export const LEGACY_FED_UNTIL_WHERE: Prisma.CaughtAnimalWhereInput = {
  OR: [{ fedUntil: null }, { fedUntil: { isSet: false } }],
};

export interface BackfillResult {
  /** Rows the updateMany actually changed this run. */
  matched: number;
  /** Total CaughtAnimal rows that exist, matched or not. */
  totalAnimals: number;
  /**
   * Rows still matching LEGACY_FED_UNTIL_WHERE after the write. Should always
   * be 0 — a nonzero value here (not `matched === 0`) is the signal that the
   * filter failed to reach legacy rows, as opposed to there being nothing
   * left to backfill.
   */
  stillUnfed: number;
}

/**
 * The integrity verdict on a backfill run, in one place so `main`'s exit code
 * and the test that pins it read the identical rule. `matched === 0` is NOT a
 * failure (a re-run legitimately matches nothing); `stillUnfed > 0` is.
 */
export function backfillOk(result: BackfillResult): boolean {
  return result.stillUnfed === 0;
}

/**
 * Give every legacy CaughtAnimal row one fed day. Idempotent: once every row
 * has an explicit fedUntil, LEGACY_FED_UNTIL_WHERE matches nothing and a
 * second run's `matched` is 0.
 */
export async function backfillFedUntil(client: PrismaClient, now: Date = new Date()): Promise<BackfillResult> {
  const fedUntil = new Date(now.getTime() + FED_WINDOW_MS);
  const { count: matched } = await client.caughtAnimal.updateMany({
    where: LEGACY_FED_UNTIL_WHERE,
    data: { fedUntil },
  });
  const totalAnimals = await client.caughtAnimal.count();
  const stillUnfed = await client.caughtAnimal.count({ where: LEGACY_FED_UNTIL_WHERE });
  return { matched, totalAnimals, stillUnfed };
}

async function main() {
  const result = await backfillFedUntil(prisma);
  const { matched, totalAnimals, stillUnfed } = result;
  console.log(`Backfilled fedUntil on ${matched} of ${totalAnimals} total animal(s).`);
  if (!backfillOk(result)) {
    // Exit non-zero, not just loudly: operators chain this as
    // `npx ts-node src/scripts/zooCareMigration.ts && pm2 restart`, and a
    // zero exit on a failed backfill deploys a bot that starves and deletes
    // every collection older than 96h.
    process.exitCode = 1;
    console.error(
      `WARNING: ${stillUnfed} animal(s) still lack a usable fedUntil after this run. ` +
        `"matched 0" does NOT mean "already backfilled" here — the filter is not reaching ` +
        `legacy rows. Investigate before deploying further; do not assume success.`
    );
    console.error("Aborting before the zoo price recompute — exiting 1.");
    return;
  }
  console.log("Every animal now has a usable fedUntil (explicit or backfilled). Safe to re-run.");

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

// Only run when this file is the process entrypoint (`npx ts-node
// src/scripts/zooCareMigration.ts`) — never on import, so the exports above
// can be asserted against directly from a test without triggering a real run.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("zooCareMigration failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
