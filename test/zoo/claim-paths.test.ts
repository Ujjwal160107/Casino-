import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { claimZooIncome, purgeDead } from "../../src/services/zooService";
import { collectIncome } from "../../src/services/propertyService";
import { FED_WINDOW_MS, HUNGER_GRACE_MS } from "../../src/utils/animalCatalog";

const id = "zoo-claim-paths";

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

describe("zoo income is paid once per day across both paths", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });
  });
  afterAll(() => resetUser(id));

  it("!collect-rent pays nothing after !zoo Collect took the window", async () => {
    const first = await claimZooIncome(id, "TestUser");
    expect(first.claimed).toBe(4_000);

    const second = await collectIncome(id, "guild");
    expect(second.zooTotal).toBe(0);
    expect(second.zooBreakdown).toEqual([]);
  });

  it("concurrent claims across both paths pay exactly once", async () => {
    const results = await Promise.allSettled([
      claimZooIncome(id, "TestUser"),
      collectIncome(id, "guild"),
    ]);

    let paid = 0;
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const value = r.value as any;
      paid += value.claimed ?? value.zooTotal ?? 0;
    }
    expect(paid).toBe(4_000);
  });
});

describe("dead animals", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
  });
  afterAll(() => resetUser(id));

  it("are purged and never pay", async () => {
    const longDead = new Date(Date.now() - FED_WINDOW_MS - HUNGER_GRACE_MS - 3_600_000);
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "white_tiger", partsAvailable: [], inZoo: true, caughtAt: longDead, fedUntil: longDead },
    });

    const died = await purgeDead(id);
    expect(died).toEqual([{ animalKey: "white_tiger", count: 1 }]);
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: id } })).toBe(0);

    await expect(claimZooIncome(id, "TestUser")).rejects.toThrow();
  });
});
