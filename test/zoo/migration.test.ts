import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient, ObjectId, Collection, Document } from "mongodb";
import { testPrisma, resetUser } from "../helpers";
import { LEGACY_FED_UNTIL_WHERE, backfillFedUntil } from "../../src/scripts/zooCareMigration";

// Regression test for a Critical review finding on the zoo care migration:
// fedUntil was introduced in this same branch, and MongoDB has no schema
// migrations, so every CaughtAnimal document written before this deploy has
// fedUntil physically ABSENT from its BSON — not explicitly set to null.
// Prisma's Mongo connector filters `{ fedUntil: null }` as "explicit BSON
// null only"; it does NOT match a document where the field was never
// written, even though `findUnique` reads both back as `null` (the exact
// failure mode already documented in src/anticheat/claim.ts's
// userDateUnchanged). A naive backfill using `{ fedUntil: null }` would match
// zero legacy rows and print a false "success".
//
// We insert the legacy row via the native Mongo driver, bypassing Prisma's
// `create`, so the document has no fedUntil key at all — the only way to
// reliably reproduce "physically absent" rather than "explicitly null".

const id = "zoo-migration-legacy-1";

let client: MongoClient;
let collection: Collection<Document>;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_DATABASE_URL!);
  await client.connect();
  collection = client.db().collection("CaughtAnimal");
});

afterAll(async () => {
  await resetUser(id);
  await client.close();
});

async function insertLegacyAnimal(): Promise<string> {
  const _id = new ObjectId();
  await collection.insertOne({
    _id,
    discordId: id,
    animalKey: "rabbit",
    partsAvailable: [],
    inZoo: true,
    caughtAt: new Date(Date.now() - 200 * 3_600_000), // caught 200h ago, well past any grace window
    // fedUntil intentionally omitted: this is what a real pre-deploy row looks like.
  });
  return _id.toHexString();
}

describe("zooCareMigration backfill", () => {
  it("LEGACY_FED_UNTIL_WHERE matches an absent fedUntil; a naive `{ fedUntil: null }` filter does not", async () => {
    const insertedId = await insertLegacyAnimal();

    const matchedByNaiveNullFilter = await testPrisma.caughtAnimal.count({
      where: { id: insertedId, fedUntil: null },
    });
    const matchedByLegacyWhere = await testPrisma.caughtAnimal.count({
      where: { id: insertedId, ...LEGACY_FED_UNTIL_WHERE },
    });

    // This is the exact bug: findUnique/count read the absent field back as
    // null, but a `{ fedUntil: null }` WHERE clause only matches an explicit
    // BSON null and excludes a missing key.
    expect(matchedByNaiveNullFilter).toBe(0);
    expect(matchedByLegacyWhere).toBe(1);
  });

  it("backfillFedUntil matches a legacy row with an absent fedUntil (RED against `{ fedUntil: null }`, GREEN against the fixed filter)", async () => {
    const insertedId = await insertLegacyAnimal();

    const before = await testPrisma.caughtAnimal.findUnique({ where: { id: insertedId } });
    expect(before?.fedUntil).toBeNull();

    const result = await backfillFedUntil(testPrisma);

    // The specific legacy row must have been reached, not skipped.
    expect(result.matched).toBeGreaterThanOrEqual(1);

    const after = await testPrisma.caughtAnimal.findUnique({ where: { id: insertedId } });
    expect(after?.fedUntil).not.toBeNull();
    expect(after!.fedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("is idempotent: a second run matches nothing new and leaves nothing still-unfed", async () => {
    await insertLegacyAnimal();

    const first = await backfillFedUntil(testPrisma);
    expect(first.matched).toBeGreaterThanOrEqual(1);
    expect(first.stillUnfed).toBe(0);

    const second = await backfillFedUntil(testPrisma);
    expect(second.matched).toBe(0);
    expect(second.stillUnfed).toBe(0);
  });
});
