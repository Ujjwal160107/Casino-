import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";

// craftHuntRecipe checks the balance before its transaction. Spending the
// wallet right after that read reproduces another command committing in the
// window, which is the real overdraw.
const spend = vi.hoisted(() => ({ armed: false }));
vi.mock("../../src/utils/prisma", async (importOriginal) => {
  const actual = await importOriginal<any>();
  const client = actual.default;
  const wallet = new Proxy(client.wallet, {
    get(target, prop) {
      if (prop !== "findUnique") return Reflect.get(target, prop);
      return async (args: any) => {
        const row = await target.findUnique(args);
        if (spend.armed) {
          spend.armed = false;
          const { testPrisma } = await import("../helpers");
          await testPrisma.wallet.update({ where: { id: row.id }, data: { balance: 0 } });
        }
        return row;
      };
    },
  });
  const proxied = new Proxy(client, {
    get(target, prop) {
      if (prop === "wallet") return wallet;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...actual, default: proxied };
});

import { craftHuntRecipe, HUNT_CRAFT_RECIPES } from "../../src/services/huntCraftService";

const id = "hunt-craft-race";
const recipe = HUNT_CRAFT_RECIPES.find((r) => r.key === "duck_feather_quill")!;

describe("hunt craft debit", () => {
  beforeEach(async () => {
    spend.armed = false;
    await testPrisma.huntPartInventory.deleteMany({ where: { userId: id } });
    await seedUser(id, { wallet: { create: { balance: recipe.coinCost } } });
    await testPrisma.huntPartInventory.create({ data: { userId: id, partKey: "duck_feathers", amount: 5 } });
  });
  afterAll(async () => {
    await testPrisma.huntPartInventory.deleteMany({ where: { userId: id } });
    await resetUser(id);
  });

  it("refuses to craft when the wallet was spent after the balance check", async () => {
    spend.armed = true;

    await expect(craftHuntRecipe(id, "guild", recipe.key)).rejects.toThrow("to craft this");

    expect((await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance).toBe(0);
    expect((await testPrisma.huntPartInventory.findFirst({ where: { userId: id, partKey: "duck_feathers" } }))!.amount).toBe(5);
  });
});
