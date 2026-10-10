import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { sellOne } from "../../src/commands/economy/inventory";
import { seedCosmeticsShop, seedGeneralShop } from "../../src/services/shopService";

// Quick Sell is a resale exit just like the Black Market, so it must refuse
// whatever listing refuses.

const uid = "quick-sell-user";

async function give(catalogKey: string, amount = 1, meta?: object) {
  const item = await testPrisma.shopItem.findFirst({ where: { catalogKey } });
  if (!item) throw new Error(`catalog item ${catalogKey} not seeded`);
  return testPrisma.inventory.create({ data: { userId: uid, shopItemId: item.id, amount, ...(meta ? { meta } : {}) } });
}

async function balance() {
  return (await testPrisma.wallet.findUnique({ where: { userId: uid } }))?.balance;
}

describe("Quick Sell", () => {
  beforeEach(async () => {
    await resetUser(uid);
    await seedUser(uid);
    await seedGeneralShop();
    await seedCosmeticsShop();
  });
  afterAll(() => resetUser(uid));

  it("refuses a card-exclusive item and pays nothing", async () => {
    const cape = await testPrisma.shopItem.findFirst({ where: { name: "Royal Cape" } });
    const slot = await testPrisma.inventory.create({ data: { userId: uid, shopItemId: cape!.id, amount: 1 } });
    await expect(sellOne(slot.id, uid)).rejects.toThrow(/card-exclusive/);
    expect((await testPrisma.inventory.findUnique({ where: { id: slot.id } }))?.amount).toBe(1);
    expect(await balance()).toBe(0);
  });

  it("still sells an ordinary item", async () => {
    const slot = await give("tax_shield", 2);
    const result = await sellOne(slot.id, uid);
    expect(result.sellValue).toBeGreaterThan(0);
    expect((await testPrisma.inventory.findUnique({ where: { id: slot.id } }))?.amount).toBe(1);
    expect(await balance()).toBe(result.sellValue);
  });
});
