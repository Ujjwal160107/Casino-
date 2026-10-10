import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { findCatalogEntry, findOwnedItemForUse, seedGeneralShop, useItem } from "../../src/services/shopService";

// `use counter` (a prefix) used to skip the catalog handler and land in useItem,
// which applied the raw PAY_MULTIPLIER effect once per use — an uncapped stack.

const uid = "use-item-catalog-user";

async function cleanup() {
  await testPrisma.activeEffect.deleteMany({ where: { userId: uid } });
  await resetUser(uid);
}

describe("useItem and catalog items", () => {
  let kitId: string;
  beforeEach(async () => {
    await cleanup();
    await seedUser(uid);
    await seedGeneralShop();
    const kit = await testPrisma.shopItem.findFirst({ where: { catalogKey: "counterfeit_kit" } });
    kitId = kit!.id;
    await testPrisma.inventory.create({ data: { userId: uid, shopItemId: kitId, amount: 3 } });
  });
  afterAll(cleanup);

  it("refuses a catalog item instead of applying its raw DB effects", async () => {
    await expect(useItem(uid, "g", "counter")).rejects.toThrow(/can't be used this way/);
    expect(await testPrisma.activeEffect.count({ where: { userId: uid } })).toBe(0);
    const inv = await testPrisma.inventory.findFirst({ where: { userId: uid, shopItemId: kitId } });
    expect(inv?.amount).toBe(3);
  });

  it("resolves a prefix and an index to the catalog entry so `use` can route to its handler", async () => {
    const byPrefix = await findOwnedItemForUse(uid, "counter");
    expect(findCatalogEntry(byPrefix.shopItem)?.key).toBe("counterfeit_kit");
    const byIndex = await findOwnedItemForUse(uid, "1");
    expect(findCatalogEntry(byIndex.shopItem)?.key).toBe("counterfeit_kit");
  });
});
