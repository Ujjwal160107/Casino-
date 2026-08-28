import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser, flushTestKeys } from "../helpers";
import { feedSpecies, feedAll, claimZooIncome, getZooStatus } from "../../src/services/zooService";
import { FED_WINDOW_MS, RARITY_FEED_KEY } from "../../src/utils/animalCatalog";

const id = "zoo-feed-1";

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

async function houseHungry(animalKey: string, n: number) {
  const longAgo = new Date(Date.now() - 40 * 3_600_000);
  for (let i = 0; i < n; i++) {
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey, partsAvailable: [], inZoo: true, caughtAt: longAgo, fedUntil: longAgo },
    });
  }
}

describe("feedSpecies", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
  });
  afterAll(() => resetUser(id));

  it("spends one feed unit per hungry animal", async () => {
    await houseHungry("rabbit", 3);
    await giveFeed(RARITY_FEED_KEY.Common, 10);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(3);
    expect(result.missing).toEqual([]);

    const item = await testPrisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY.Common } });
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: id, shopItemId: item!.id } },
    });
    expect(inv!.amount).toBe(7);
  });

  it("costs nothing when the species is already fed", async () => {
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await giveFeed(RARITY_FEED_KEY.Common, 5);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(0);

    const item = await testPrisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY.Common } });
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: id, shopItemId: item!.id } },
    });
    expect(inv!.amount).toBe(5);
  });

  it("feeds what it can afford and reports the shortfall", async () => {
    await houseHungry("rabbit", 4);
    await giveFeed(RARITY_FEED_KEY.Common, 2);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(2);
    expect(result.missing).toEqual([{ rarity: "Common", units: 2 }]);
  });
});

describe("feedAll", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
  });
  afterAll(() => resetUser(id));

  it("feeds every rarity in one call, cheapest first, and reports a per-rarity shortfall", async () => {
    await houseHungry("rabbit", 2);       // Common
    await houseHungry("black_bear", 2);   // Rare
    await giveFeed(RARITY_FEED_KEY.Common, 2);
    await giveFeed(RARITY_FEED_KEY.Rare, 1);

    const result = await feedAll(id);
    expect(result.fed).toBe(3);
    expect(result.spent).toEqual([
      { rarity: "Common", units: 2 },
      { rarity: "Rare", units: 1 },
    ]);
    expect(result.missing).toEqual([{ rarity: "Rare", units: 1 }]);
  });
});

describe("claimZooIncome", () => {
  beforeEach(async () => {
    await seedUser(id);
    // getCraftEffect caches zoo_boost in Redis by discordId, which outlives a
    // single `vitest run` (Redis is a real Docker container, not reset per
    // run like the memory-server Mongo) — flush it so the boost-parity test
    // below cannot leak a multiplier into an unrelated claim.
    await flushTestKeys(`crafted_zoo_boost:${id}`);
  });
  afterAll(() => resetUser(id));

  it("refuses to pay when the player owns no zoo", async () => {
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await expect(claimZooIncome(id, "TestUser")).rejects.toThrow(/own a zoo/i);
  });

  it("pays the daily rate for fed animals and skips hungry ones", async () => {
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    const longAgo = new Date(Date.now() - 40 * 3_600_000);
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "fox", partsAvailable: [], inZoo: true, caughtAt: longAgo, fedUntil: longAgo },
    });

    const result = await claimZooIncome(id, "TestUser");
    expect(result.claimed).toBe(4_000);
    expect(result.fedAnimals).toBe(1);
    expect(result.hungryAnimals).toBe(1);

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(4_000);
  });

  it("cannot be claimed twice inside 24h", async () => {
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await claimZooIncome(id, "TestUser");
    await expect(claimZooIncome(id, "TestUser")).rejects.toThrow();
  });

  it("previews the same boosted number the claim actually pays", async () => {
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
    await testPrisma.activeEffect.create({
      data: {
        userId: id, effectType: "zoo_boost", value: 1.5,
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      },
    });

    const status = await getZooStatus(id);
    const result = await claimZooIncome(id, "TestUser");

    expect(result.claimed).toBe(6_000); // floor(4_000 * 1.5)
    expect(status.incomePerDay).toBe(result.claimed);
  });
});
