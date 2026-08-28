import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { claimZooIncome, purgeDead } from "../../src/services/zooService";
import { collectIncome, PropertyService } from "../../src/services/propertyService";
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

    // The DTOs alone don't prove money actually moved once, not twice — read
    // the wallet so a path that credited while under-reporting can't slip by.
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet?.balance).toBe(4_000);
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

describe("selling a zoo evicts housed animals", () => {
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it("turns every housed animal out to inventory, keeping fedUntil, when the zoo is sold", async () => {
    await giveWorldZoo();
    const fedUntil = new Date(Date.now() + FED_WINDOW_MS);
    const animal = await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: true, fedUntil },
    });

    const result = await PropertyService.sellPropertySystem(id, "guild", "world_zoo");
    expect(result.success).toBe(true);

    const after = await testPrisma.caughtAnimal.findUniqueOrThrow({ where: { id: animal.id } });
    expect(after.inZoo).toBe(false);
    expect(after.fedUntil?.getTime()).toBe(fedUntil.getTime());
  });
});

describe("collectIncome with no zoo owned", () => {
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it("pays zero zoo income for a player with animals but no zoo", async () => {
    await testPrisma.caughtAnimal.create({
      data: {
        discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: false,
        fedUntil: new Date(Date.now() + FED_WINDOW_MS),
      },
    });

    const result = await collectIncome(id, "guild");
    expect(result.zooTotal).toBe(0);
    expect(result.zooBreakdown).toEqual([]);
  });
});
