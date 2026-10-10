import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { storeSpeciesPartsFromAnimals } from "../../src/services/huntPartService";

// Storing parts read the animals outside the transaction, paid the parts, then
// deleted whatever was left. A second store (double-click) or a sell that took
// the animals in between still got paid. The competing claim is committed right
// before the store transaction starts to make the race deterministic.

const uid = "store-parts-race-user";

async function cleanup() {
  await testPrisma.huntPartInventory.deleteMany({ where: { userId: uid } });
  await resetUser(uid);
}

describe("storeSpeciesPartsFromAnimals claims the animals before paying", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(uid);
    for (let i = 0; i < 2; i++) {
      await testPrisma.caughtAnimal.create({
        data: { discordId: uid, animalKey: "rabbit", partsAvailable: ["meat", "fur"] },
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(cleanup);

  it("pays nothing when the animals were taken after the read", async () => {
    const realTx = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (arg: any, opts?: any) => {
      await testPrisma.caughtAnimal.deleteMany({ where: { discordId: uid } });
      return realTx(arg, opts);
    }) as any);

    await expect(storeSpeciesPartsFromAnimals(uid, "rabbit")).rejects.toThrow(/already stored or sold/);
    expect(await testPrisma.huntPartInventory.count({ where: { userId: uid } })).toBe(0);
  });

  it("stores every part once and removes the animals", async () => {
    await storeSpeciesPartsFromAnimals(uid, "rabbit");
    const parts = await testPrisma.huntPartInventory.findMany({ where: { userId: uid } });
    expect(Object.fromEntries(parts.map((p) => [p.partKey, p.amount]))).toEqual({ rabbit_meat: 2, rabbit_fur: 2 });
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: uid } })).toBe(0);
    await expect(storeSpeciesPartsFromAnimals(uid, "rabbit")).rejects.toThrow(/No stored animals/);
  });
});
