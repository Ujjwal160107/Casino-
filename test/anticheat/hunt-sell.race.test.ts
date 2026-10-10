import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";

// Runs a competing action right after the sell has read the inventory and
// before it writes anything, which is where a double-clicked Sell or a Send to
// Zoo lands.
const hook = vi.hoisted(() => ({ afterRead: null as null | (() => Promise<unknown>) }));
vi.mock("../../src/utils/prisma", async (importOriginal) => {
  const actual = await importOriginal<any>();
  const client = actual.default;
  const caughtAnimal = new Proxy(client.caughtAnimal, {
    get(target, prop) {
      if (prop !== "findMany") return Reflect.get(target, prop);
      return async (args: unknown) => {
        const rows = await target.findMany(args);
        const competing = hook.afterRead;
        hook.afterRead = null;
        if (competing) await competing();
        return rows;
      };
    },
  });
  const proxied = new Proxy(client, {
    get(target, prop) {
      if (prop === "caughtAnimal") return caughtAnimal;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...actual, default: proxied };
});

import { sellAnimalsByKey, sellAllInventoryAnimals } from "../../src/services/huntService";
import { getAnimal } from "../../src/utils/animalCatalog";

const id = "hunt-sell-race";
const price = getAnimal("rabbit")!.sellValue;
const afterSellReads = (competing: () => Promise<unknown>) => { hook.afterRead = competing; };

const balance = async () => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const sendAllToZoo = () => testPrisma.caughtAnimal.updateMany({ where: { discordId: id }, data: { inZoo: true } });

describe("hunt sell claims animals before paying", () => {
  beforeEach(async () => {
    await seedUser(id);
    await testPrisma.caughtAnimal.createMany({
      data: Array.from({ length: 3 }, () => ({ discordId: id, animalKey: "rabbit", partsAvailable: [], inZoo: false })),
    });
  });
  afterEach(() => { hook.afterRead = null; });
  afterAll(() => resetUser(id));

  it("a double-clicked Sell pays for the animals once", async () => {
    afterSellReads(() => sellAnimalsByKey(id, "rabbit", "TestUser"));

    await sellAnimalsByKey(id, "rabbit", "TestUser").catch(() => {});

    expect(await balance()).toBe(3 * price);
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: id } })).toBe(0);
  });

  it("Sell does not pay for animals sent to the zoo mid-sell", async () => {
    afterSellReads(sendAllToZoo);

    await expect(sellAnimalsByKey(id, "rabbit", "TestUser")).rejects.toThrow();

    expect(await balance()).toBe(0);
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: id, inZoo: true } })).toBe(3);
  });

  it("Sell All does not pay for animals sent to the zoo mid-sell", async () => {
    afterSellReads(sendAllToZoo);

    await expect(sellAllInventoryAnimals(id, "TestUser")).rejects.toThrow();

    expect(await balance()).toBe(0);
    expect(await testPrisma.caughtAnimal.count({ where: { discordId: id, inZoo: true } })).toBe(3);
  });
});
