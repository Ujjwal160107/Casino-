import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, testRedis, seedUser, resetUser } from "../helpers";
import { buyItem } from "../../src/services/shopService";

// An item's netWorth requirement was checked against wallet + bank only,
// not the net worth the profile and leaderboard show (assets minus card debt).

const id = "shop-networth-req";
const KEY = "test_networth_gated";
let itemId: string;

describe("buyItem netWorth requirement", () => {
  beforeEach(async () => {
    await seedUser(id, { wallet: { create: { balance: 1_000 } } });
    await testRedis().del(`networth:${id}`);
    await testPrisma.shopItem.deleteMany({ where: { catalogKey: KEY } });
    const item = await testPrisma.shopItem.create({
      data: { guildId: "global", catalogKey: KEY, name: "Networth Gated", price: 100, requirements: { netWorth: 10_000 } },
    });
    itemId = item.id;
  });
  afterAll(async () => {
    await resetUser(id);
    await testPrisma.shopItem.deleteMany({ where: { catalogKey: KEY } });
  });

  it("counts assets beyond wallet and bank", async () => {
    // Two rabbits (8,000 each) lift net worth past 10,000; wallet + bank is only 1,000.
    await testPrisma.caughtAnimal.createMany({
      data: [1, 2].map(() => ({ discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: false })),
    });

    await expect(buyItem("guild", id, itemId, undefined, true)).resolves.toBeDefined();
  });

  it("still refuses a player below the requirement", async () => {
    await expect(buyItem("guild", id, itemId, undefined, true)).rejects.toThrow("net worth");
  });
});
