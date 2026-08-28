import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { feedSpecies, claimZooIncome } from "../../src/services/zooService";
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

async function houseHungryRabbits(n: number) {
  const longAgo = new Date(Date.now() - 40 * 3_600_000);
  for (let i = 0; i < n; i++) {
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true, caughtAt: longAgo, fedUntil: longAgo },
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
    await houseHungryRabbits(3);
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
    await houseHungryRabbits(4);
    await giveFeed(RARITY_FEED_KEY.Common, 2);

    const result = await feedSpecies(id, "rabbit");
    expect(result.fed).toBe(2);
    expect(result.missing).toEqual([{ rarity: "Common", units: 2 }]);
  });
});

describe("claimZooIncome", () => {
  beforeEach(async () => {
    await seedUser(id);
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
});
