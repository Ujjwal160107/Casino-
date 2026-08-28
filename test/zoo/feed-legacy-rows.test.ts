import { describe, it, expect, beforeEach, afterAll, beforeAll } from "vitest";
import { MongoClient, ObjectId, Collection, Document } from "mongodb";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { feedSpecies, getZooStatus } from "../../src/services/zooService";
import { RARITY_FEED_KEY } from "../../src/utils/animalCatalog";

// Regression test for the absent-vs-null trap in feedRows' claim CAS.
//
// fedUntil was introduced in this branch and MongoDB has no schema migration,
// so every CaughtAnimal document written before this deploy has the field
// PHYSICALLY ABSENT from its BSON, not explicitly null. Prisma's Mongo
// connector matches `{ fedUntil: null }` against explicit BSON null only, so
// the original filter
//
//   OR: [{ fedUntil: null }, { fedUntil: { lt: now } }]
//
// matched such a row with neither disjunct: claim.count === 0, paid === 0, the
// rarity was pushed onto `missing`, and the player was told "you have no feed"
// while holding feed — and the animal then starved to death.
//
// Rows are inserted through the native driver, bypassing Prisma's `create`, so
// the key really is missing (the same technique as test/zoo/migration.test.ts).

const id = "zoo-feed-legacy";

let client: MongoClient;
let animals: Collection<Document>;

beforeAll(async () => {
  client = new MongoClient(process.env.TEST_DATABASE_URL!);
  await client.connect();
  animals = client.db().collection("CaughtAnimal");
});

afterAll(async () => {
  await resetUser(id);
  await client.close();
});

/**
 * A pre-deploy row with no fedUntil key. caughtAt is 40h ago, so its effective
 * fedUntil (caughtAt + 24h) is 16h in the past: hungry, and still well inside
 * the 72h starve grace, which is the state where feeding must work.
 */
async function insertLegacyHungryAnimal(animalKey: string): Promise<string> {
  const _id = new ObjectId();
  await animals.insertOne({
    _id,
    discordId: id,
    animalKey,
    partsAvailable: [],
    inZoo: true,
    caughtAt: new Date(Date.now() - 40 * 3_600_000),
    // fedUntil intentionally omitted.
  });
  return _id.toHexString();
}

async function giveFeed(catalogKey: string, amount: number) {
  const item = await testPrisma.shopItem.upsert({
    where: { catalogKey },
    create: {
      catalogKey, guildId: "global", name: catalogKey, price: 1, description: "test",
      stock: -1, consumable: true, usable: false, itemType: "CONSUMABLE", effects: [],
    } as any,
    update: {},
  });
  await testPrisma.inventory.upsert({
    where: { userId_shopItemId: { userId: id, shopItemId: item.id } },
    create: { userId: id, shopItemId: item.id, amount },
    update: { amount },
  });
  return item.id;
}

async function giveWorldZoo() {
  const property = await testPrisma.property.upsert({
    where: { key: "world_zoo" },
    create: {
      guildId: "global", key: "world_zoo", name: "World Zoo", description: "test",
      basePrice: 1, price: 1, incomePerCycle: 0, incomeCycleHours: 24, totalSold: 0,
    } as any,
    update: {},
  });
  await testPrisma.ownedProperty.create({
    data: { userId: id, propertyId: property.id, purchasedPrice: 1, lastCollected: new Date() },
  });
}

describe("feeding a legacy row whose fedUntil is physically absent", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
  });

  it("reads as hungry before it is fed", async () => {
    await insertLegacyHungryAnimal("rabbit");
    const status = await getZooStatus(id);
    const slot = status.slots.find((s) => s.animalKey === "rabbit");
    expect(slot?.hungryCount).toBe(1);
    expect(slot?.fedCount).toBe(0);
  });

  it("is fed and billed exactly once (RED with the `{ fedUntil: null }` filter, GREEN with `isSet: false`)", async () => {
    const legacyId = await insertLegacyHungryAnimal("rabbit");
    await giveFeed(RARITY_FEED_KEY.Common, 5);

    const result = await feedSpecies(id, "rabbit");

    // The bug's signature: fed 0, and the rarity reported as missing while the
    // player is holding five sacks of feed.
    expect(result.fed).toBe(1);
    expect(result.spent).toEqual([{ rarity: "Common", units: 1 }]);
    expect(result.missing).toEqual([]);

    const after = await testPrisma.caughtAnimal.findUnique({ where: { id: legacyId } });
    expect(after?.fedUntil).not.toBeNull();
    expect(after!.fedUntil!.getTime()).toBeGreaterThan(Date.now());

    const item = await testPrisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY.Common } });
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: id, shopItemId: item!.id } },
    });
    expect(inv!.amount).toBe(4);
  });

  it("earns its daily income after being fed, instead of starving to death", async () => {
    await insertLegacyHungryAnimal("rabbit");
    await giveFeed(RARITY_FEED_KEY.Common, 5);

    await feedSpecies(id, "rabbit");
    const status = await getZooStatus(id);

    expect(status.incomePerDay).toBe(4_000);
    expect(status.slots.find((s) => s.animalKey === "rabbit")?.hungryCount).toBe(0);
  });
});
