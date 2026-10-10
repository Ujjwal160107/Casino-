import { describe, it, expect, beforeEach, afterAll } from "vitest";
import prisma from "../../src/utils/prisma";
import { houseAnimals } from "../../src/services/zooService";
import { testPrisma, seedUser, resetUser } from "../helpers";

const id = "zoo-house-race";

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

describe("houseAnimals", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
    await testPrisma.caughtAnimal.createMany({
      data: [1, 2].map(() => ({ discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: false })),
    });
  });
  afterAll(() => resetUser(id));

  it("does not claim rows a concurrent call housed between its read and its write", async () => {
    // A double-clicked "Send to zoo": the other click houses both rabbits
    // after this call picked them from inventory but before it writes.
    // Swapped by hand: vi.restoreAllMocks cannot restore a Prisma delegate
    // method, which leaves it undefined for the next test.
    const delegate = prisma.caughtAnimal as any;
    const real = delegate.updateMany;
    const wasOwn = Object.prototype.hasOwnProperty.call(delegate, "updateMany");
    delegate.updateMany = async (args: any) => {
      if (args?.data?.inZoo === true) {
        await testPrisma.caughtAnimal.updateMany({ where: { discordId: id }, data: { inZoo: true } });
      }
      return real.call(delegate, args);
    };

    let res: Awaited<ReturnType<typeof houseAnimals>>;
    try {
      res = await houseAnimals(id, "rabbit");
    } finally {
      if (wasOwn) delegate.updateMany = real;
      else delete delegate.updateMany;
    }

    expect(res.housed).toBe(0);
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: id, inZoo: true } })).toBe(2);
  });

  it("reports what it housed", async () => {
    expect((await houseAnimals(id, "rabbit")).housed).toBe(2);
  });
});
